"""Survey-reference track: works cited by every record screened as a survey or review.

Runs after the first screening pass. New records go through dedup and the same
screening.

Usage:
    uv run scripts/search_survey_refs.py
"""

from __future__ import annotations

import sys

from common import WORK, cached_get, load_queries, log_query, read_jsonl, write_jsonl
from screen import RESULTS
from search_openalex import API, OpenAlex, to_record


def main() -> None:
    since_year = int(load_queries()["since"][:4])
    surveys = {r["id"] for r in read_jsonl(RESULTS) if r["label"] == "survey"}
    records = [r for r in read_jsonl(WORK / "records.jsonl") if r["id"] in surveys]
    oa = OpenAlex()

    # OpenAlex IDs for surveys found only on arXiv.
    for r in records:
        if not r["openalex_id"] and r["arxiv_id"]:
            try:
                w = cached_get("openalex", f"{API}/doi:10.48550/arxiv.{r['arxiv_id']}",
                               {"select": "id"}, secret_params=oa.secret)
                r["openalex_id"] = w["id"].rsplit("/", 1)[-1]
            except RuntimeError:
                pass
    ids = sorted({r["openalex_id"] for r in records if r["openalex_id"]})
    print(f"{len(surveys)} surveys, {len(ids)} found in OpenAlex", file=sys.stderr)

    refs = set()
    for i in range(0, len(ids), 50):
        body = oa.get({"filter": "openalex:" + "|".join(ids[i:i + 50]), "per-page": 50,
                       "select": "id,referenced_works"})
        for w in body["results"]:
            refs.update(x.rsplit("/", 1)[-1] for x in w.get("referenced_works") or [])
    known = {r["openalex_id"] for r in read_jsonl(WORK / "records.jsonl") if r["openalex_id"]}
    new = sorted(refs - known)
    print(f"{len(refs)} referenced works, {len(new)} not already found", file=sys.stderr)

    hits = []
    for i in range(0, len(new), 50):
        works = oa.fetch_all(f"openalex:{'|'.join(new[i:i + 50])},from_publication_date:{since_year}-01-01")
        hits += [to_record(w, "survey-refs", track="survey_refs") for w in works]
    log_query("survey_refs", "survey-refs", "openalex",
              f"references of {len(ids)} surveys, published {since_year} or later", len(hits))
    write_jsonl(WORK / "survey_refs.jsonl", hits)
    print(f"wrote {len(hits)} hits to search/work/survey_refs.jsonl", file=sys.stderr)


if __name__ == "__main__":
    main()
