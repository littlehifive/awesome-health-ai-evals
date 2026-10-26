"""OpenAlex track: keyword queries and forward citations of anchor benchmarks.

Usage:
    uv run scripts/search_openalex.py --count   # hit counts only (cheap)
    uv run scripts/search_openalex.py           # fetch everything
"""

from __future__ import annotations

import argparse
import os
import re
import sys

from common import WORK, cached_get, load_env, load_queries, log_query, new_record, norm_title, write_jsonl

API = "https://api.openalex.org/works"
SELECT = ("id,doi,title,publication_year,type,cited_by_count,ids,"
          "primary_location,abstract_inverted_index,referenced_works_count")


def expand(template: str, terms: dict) -> str:
    out = template
    for key, value in terms.items():
        out = out.replace("{" + key + "}", value)
    return out


def abstract_from(inverted: dict | None) -> str | None:
    if not inverted:
        return None
    words = sorted((pos, word) for word, positions in inverted.items() for pos in positions)
    return " ".join(word for _, word in words)


def to_record(work: dict, query_id: str, track: str = "openalex") -> dict:
    loc = work.get("primary_location") or {}
    source = loc.get("source") or {}
    ids = work.get("ids") or {}
    pmcid = ids.get("pmcid")
    if pmcid:
        pmcid = "PMC" + pmcid.rstrip("/").split("PMC")[-1]
    return new_record(
        track, query_id,
        title=work.get("title"),
        abstract=abstract_from(work.get("abstract_inverted_index")),
        year=work.get("publication_year"),
        doi=work.get("doi"),
        openalex_id=work["id"].rsplit("/", 1)[-1],
        pmcid=pmcid,
        url=loc.get("landing_page_url") or work.get("doi"),
        venue=source.get("display_name"),
        type=work.get("type"),
        cited_by=work.get("cited_by_count"),
    )


class OpenAlex:
    def __init__(self):
        load_env()
        key = os.environ.get("OPENALEX_API_KEY")
        self.secret = {"api_key": key} if key else {}

    def get(self, params: dict) -> dict:
        return cached_get("openalex", API, params, secret_params=self.secret)

    def count(self, filt: str) -> int:
        return self.get({"filter": filt, "per-page": 1, "select": "id"})["meta"]["count"]

    def fetch_all(self, filt: str) -> list[dict]:
        works, cursor = [], "*"
        while cursor:
            body = self.get({"filter": filt, "per-page": 200, "cursor": cursor, "select": SELECT})
            works.extend(body["results"])
            cursor = body["meta"].get("next_cursor") if body["results"] else None
        return works


def keyword_filter(q: dict, terms: dict, since: str) -> str:
    parts = []
    if q.get("title"):
        parts.append("title.search:" + expand(q["title"], terms))
    if q.get("text"):
        parts.append("title_and_abstract.search:" + expand(q["text"], terms))
    parts.append(f"from_publication_date:{since}")
    return ",".join(parts)


def resolve_anchor(oa: OpenAlex, anchor: dict) -> list[str]:
    """OpenAlex IDs of every version of an anchor paper (exact title match)."""
    found = []
    for title in anchor["titles"]:
        clean = re.sub(r"[^\w\s-]", " ", title)
        body = oa.get({"filter": f"title.search:{clean}", "per-page": 25,
                       "select": "id,title,publication_year,cited_by_count"})
        for work in body["results"]:
            if norm_title(work["title"]) == norm_title(title):
                found.append(work["id"].rsplit("/", 1)[-1])
    for doi in anchor.get("dois", []):
        work = cached_get("openalex", f"{API}/doi:{doi}", {"select": "id,title"},
                          secret_params=oa.secret)
        found.append(work["id"].rsplit("/", 1)[-1])
    return sorted(set(found))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", action="store_true", help="print hit counts only")
    args = parser.parse_args()

    cfg = load_queries()
    terms, since = cfg["terms"], cfg["since"]
    oa = OpenAlex()
    records = []

    for q in cfg["openalex"]["keyword"]:
        filt = keyword_filter(q, terms, since)
        n = oa.count(filt)
        print(f"{q['id']:<20} {n:>6}", file=sys.stderr)
        if args.count:
            continue
        works = oa.fetch_all(filt)
        records += [to_record(w, q["id"]) for w in works]
        log_query("openalex", q["id"], "openalex", filt, len(works))

    citing_filter = expand(cfg["openalex"]["citing_filter"], terms)
    for anchor in cfg["openalex"]["anchors"]:
        ids = resolve_anchor(oa, anchor)
        if not ids:
            print(f"cites:{anchor['id']:<14} anchor not found", file=sys.stderr)
            continue
        filt = (f"cites:{'|'.join(ids)},title_and_abstract.search:{citing_filter},"
                f"from_publication_date:{since}")
        n = oa.count(filt)
        print(f"cites:{anchor['id']:<14} {n:>6}  ({', '.join(ids)})", file=sys.stderr)
        if args.count:
            continue
        # The anchor papers themselves, so they are screened even if pre-2019.
        seeds = oa.fetch_all(f"openalex:{'|'.join(ids)}")
        records += [to_record(w, f"anchor-{anchor['id']}") for w in seeds]
        works = oa.fetch_all(filt)
        records += [to_record(w, f"cites-{anchor['id']}") for w in works]
        log_query("openalex", f"cites-{anchor['id']}", "openalex", filt, len(works))

    if not args.count:
        write_jsonl(WORK / "openalex.jsonl", records)
        print(f"wrote {len(records)} hits to search/work/openalex.jsonl", file=sys.stderr)


if __name__ == "__main__":
    main()
