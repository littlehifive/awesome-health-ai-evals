"""Merge hits from every track into one record per work.

Hits are merged when they share a DOI, arXiv ID, OpenAlex ID, PMC ID,
Hugging Face dataset ID, GitHub repo, or normalized title. Records with a DOI
but no abstract get one from OpenAlex.

Writes search/work/records.jsonl (with abstracts, gitignored) and
search/records.csv (metadata only, committed).

Usage:
    uv run scripts/dedup.py
"""

from __future__ import annotations

import csv
import hashlib
import sys
from collections import defaultdict

from common import SEARCH, WORK, norm_title, read_jsonl, write_jsonl
from search_openalex import OpenAlex, to_record

TRACK_FILES = ["openalex", "paperclip", "hf_github", "survey_refs"]
PAPER_TRACKS = {"openalex", "paperclip", "survey_refs"}
KEY_ORDER = ["doi", "arxiv_id", "openalex_id", "pmcid", "hf_id", "github_repo"]
CSV_FIELDS = ["id", "title", "year", "doi", "arxiv_id", "openalex_id", "pmcid",
              "hf_ids", "github_repos", "venue", "type", "tracks", "queries"]


def keys_of(hit: dict) -> list[str]:
    keys = [f"{k}:{str(hit[k]).lower()}" for k in KEY_ORDER if hit.get(k)]
    if hit["track"] in PAPER_TRACKS:
        t = norm_title(hit.get("title"))
        if len(t) >= 25 and t != "untitled":
            keys.append(f"title:{t}")
    return keys


class UnionFind:
    def __init__(self):
        self.parent = {}

    def find(self, x):
        self.parent.setdefault(x, x)
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a, b):
        self.parent[self.find(a)] = self.find(b)


def record_id(group: list[dict]) -> str:
    for k in KEY_ORDER:
        vals = sorted({str(h[k]).lower() for h in group if h.get(k)})
        if vals:
            return "r_" + hashlib.sha1(f"{k}:{vals[0]}".encode()).hexdigest()[:10]
    t = sorted(norm_title(h.get("title")) for h in group)[0]
    return "r_" + hashlib.sha1(f"title:{t}".encode()).hexdigest()[:10]


def merge(group: list[dict]) -> dict:
    papers = [h for h in group if h["track"] in PAPER_TRACKS] or group

    def first(field, hits=group):
        return next((h[field] for h in hits if h.get(field)), None)

    titles = [h["title"] for h in papers if h.get("title") and h["title"] != "Untitled"]
    abstracts = sorted((h["abstract"] for h in papers if h.get("abstract")), key=len, reverse=True)
    return {
        "id": record_id(group),
        "title": max(titles, key=len) if titles else first("title"),
        "abstract": abstracts[0] if abstracts else first("abstract"),
        "year": min((h["year"] for h in papers if h.get("year")), default=None),
        "doi": first("doi", papers),
        "arxiv_id": first("arxiv_id"),
        "openalex_id": first("openalex_id"),
        "pmcid": first("pmcid"),
        "paperclip_id": first("paperclip_id"),
        "hf_ids": sorted({h["hf_id"] for h in group if h.get("hf_id")}),
        "github_repos": sorted({h["github_repo"] for h in group if h.get("github_repo")}),
        "url": first("url", papers),
        "venue": first("venue", [h for h in papers if h["track"] == "openalex"]) or first("venue"),
        "type": first("type", papers),
        "authors": first("authors"),
        "cited_by": max((h["cited_by"] for h in group if h.get("cited_by") is not None), default=None),
        "downloads": max((h.get("downloads") or 0 for h in group), default=0) or None,
        "stars": max((h.get("stars") or 0 for h in group), default=0) or None,
        "tracks": sorted({h["track"] for h in group}),
        "queries": sorted({h["query_id"] for h in group}),
    }


def fill_abstracts(records: list[dict]) -> int:
    """Fetch missing abstracts from OpenAlex by DOI, 50 DOIs per request."""
    need = [r for r in records if not r["abstract"] and r["doi"]]
    oa = OpenAlex()
    by_doi = {r["doi"]: r for r in need}
    dois = sorted(d for d in by_doi if "," not in d and "|" not in d)
    filled = 0
    for i in range(0, len(dois), 50):
        chunk = dois[i:i + 50]
        works = oa.fetch_all("doi:" + "|".join(chunk))
        for w in works:
            hit = to_record(w, "fill")
            r = by_doi.get(hit["doi"])
            if not r:
                continue
            if hit["abstract"]:
                r["abstract"] = hit["abstract"]
                filled += 1
            if not r["title"] or r["title"] == "Untitled":
                r["title"] = hit["title"]
            r["openalex_id"] = r["openalex_id"] or hit["openalex_id"]
            r["venue"] = r["venue"] if r["venue"] not in (None, "crossref") else hit["venue"]
            r["year"] = r["year"] or hit["year"]
            r["cited_by"] = max(r["cited_by"] or 0, hit["cited_by"] or 0)
    return filled


def main() -> None:
    hits = []
    for name in TRACK_FILES:
        rows = read_jsonl(WORK / f"{name}.jsonl")
        print(f"{name:<12} {len(rows):>6} hits", file=sys.stderr)
        hits += rows

    uf = UnionFind()
    for i, hit in enumerate(hits):
        node = f"hit:{i}"
        uf.find(node)
        for key in keys_of(hit):
            uf.union(node, key)
    groups = defaultdict(list)
    for i, hit in enumerate(hits):
        groups[uf.find(f"hit:{i}")].append(hit)

    records = sorted((merge(g) for g in groups.values()), key=lambda r: r["id"])
    filled = fill_abstracts(records)
    write_jsonl(WORK / "records.jsonl", records)

    with (SEARCH / "records.csv").open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=CSV_FIELDS, extrasaction="ignore")
        w.writeheader()
        for r in records:
            w.writerow({**r, "hf_ids": ";".join(r["hf_ids"]),
                        "github_repos": ";".join(r["github_repos"]),
                        "tracks": ";".join(r["tracks"]), "queries": ";".join(r["queries"])})

    no_abs = sum(1 for r in records if not r["abstract"])
    print(f"{len(hits)} hits -> {len(records)} records "
          f"({filled} abstracts filled from OpenAlex, {no_abs} still without)", file=sys.stderr)


if __name__ == "__main__":
    main()
