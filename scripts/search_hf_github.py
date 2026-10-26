"""Hugging Face Hub and GitHub track: eval datasets and repos, including ones with no paper.

Usage:
    uv run scripts/search_hf_github.py
"""

from __future__ import annotations

import json
import re
import subprocess
import sys

import requests

from common import WORK, cache_get, cache_put, load_queries, log_query, new_record, write_jsonl

HF_API = "https://huggingface.co/api/datasets"


def hf_search(term: str) -> list[dict]:
    """Every dataset whose ID matches term, following the cursor links."""
    url = f"{HF_API}?search={term}&limit=1000&full=true"
    out = []
    while url:
        page = cache_get("hf", url)
        if page is None:
            resp = requests.get(url, timeout=60)
            resp.raise_for_status()
            page = {"items": resp.json(), "next": resp.links.get("next", {}).get("url")}
            cache_put("hf", url, page)
        out += page["items"]
        url = page["next"]
    return out


def hf_record(ds: dict, query_id: str) -> dict:
    tags = ds.get("tags") or []
    arxiv = next((t.split(":", 1)[1] for t in tags if t.startswith("arxiv:")), None)
    desc = (ds.get("description") or "").strip()
    return new_record(
        "hf_github", query_id,
        title=ds["id"],
        abstract=(desc + "\nTags: " + ", ".join(tags))[:3000],
        year=int(ds["createdAt"][:4]) if ds.get("createdAt") else None,
        arxiv_id=arxiv,
        hf_id=ds["id"],
        url=f"https://huggingface.co/datasets/{ds['id']}",
        venue="Hugging Face",
        type="dataset",
        cited_by=None,
        downloads=ds.get("downloads"),
        gated=bool(ds.get("gated")),
    )


def gh_search(query: str, pages: int = 10) -> list[dict]:
    out = []
    for page in range(1, pages + 1):
        key = json.dumps(["gh", query, page])
        body = cache_get("github", key)
        if body is None:
            res = subprocess.run(
                ["gh", "api", "-X", "GET", "search/repositories", "-f", f"q={query}",
                 "-f", "per_page=100", "-f", f"page={page}"],
                capture_output=True, text=True, timeout=120)
            if res.returncode != 0:
                print(f"github: {query!r} page {page}: {res.stderr.strip()[:200]}", file=sys.stderr)
                break
            body = json.loads(res.stdout)
            cache_put("github", key, body)
        items = body.get("items", [])
        out += items
        if len(items) < 100:
            break
    return out


def gh_record(repo: dict, query_id: str) -> dict:
    desc = repo.get("description") or ""
    topics = repo.get("topics") or []
    return new_record(
        "hf_github", query_id,
        title=repo["full_name"],
        abstract=(desc + ("\nTopics: " + ", ".join(topics) if topics else ""))[:3000],
        year=int(repo["created_at"][:4]) if repo.get("created_at") else None,
        github_repo=repo["full_name"].lower(),
        url=repo["html_url"],
        venue="GitHub",
        type="repository",
        stars=repo.get("stargazers_count"),
    )


def main() -> None:
    cfg = load_queries()
    records = []

    keep = re.compile(cfg["hf"]["keep_regex"], re.I)
    health = re.compile(cfg["hf"]["health_regex"], re.I)
    for term in cfg["hf"]["terms"]:
        found = hf_search(term)
        texts = [" ".join([ds["id"], ds.get("description") or "", " ".join(ds.get("tags") or [])])
                 for ds in found]
        kept = [ds for ds, text in zip(found, texts) if keep.search(text) and health.search(text)]
        log_query("hf_github", f"hf-{term}", "huggingface", f"search={term} + keep_regex + health_regex", len(kept))
        print(f"hf-{term:<20} {len(found):>6} found {len(kept):>5} kept", file=sys.stderr)
        records += [hf_record(ds, f"hf-{term}") for ds in kept]

    for q in cfg["github"]["queries"]:
        repos = gh_search(q["q"])
        log_query("hf_github", q["id"], "github", q["q"], len(repos))
        print(f"{q['id']:<24} {len(repos):>5}", file=sys.stderr)
        records += [gh_record(r, q["id"]) for r in repos]

    write_jsonl(WORK / "hf_github.jsonl", records)
    print(f"wrote {len(records)} hits to search/work/hf_github.jsonl", file=sys.stderr)


if __name__ == "__main__":
    main()
