"""Group screened-in records into candidate entries for full-text extraction.

Records whose strict screening decision is benchmark, eval_framework, or
borderline (see screen.py) are grouped when the screener gave them the same
benchmark name (this folds dataset mirrors into their paper).

Extraction runs in rounds, so it can start before every record is screened.
Round N takes the screened-in records that no earlier round included (as
listed in search/work/rounds, or in search/candidates.csv on a fresh
checkout). It writes search/work/rounds/rN/candidates.jsonl, batches of --batch-size
candidates for the extraction agents (search/work/rounds/rN/bXXX.jsonl), and
appends the round to search/candidates.csv (committed: candidate ID, name,
record IDs).

Usage:
    uv run scripts/candidates.py --round 1 [--batch-size 15]
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
from collections import Counter, defaultdict

from common import SEARCH, WORK, read_jsonl, write_jsonl
from dedup import UnionFind
from screen import KEEP, latest_decisions

GENERIC = {"", "benchmark", "dataset", "framework", "rubric", "evaluation framework", "medical benchmark",
           "medical qa", "medical dataset", "healthcare chatbot evaluation framework"}
ROUNDS = WORK / "rounds"


def norm_name(name: str) -> str:
    n = name.lower().strip()
    if n in GENERIC:
        return ""
    return re.sub(r"[^a-z0-9]+", "", n)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--round", type=int, required=True)
    parser.add_argument("--batch-size", type=int, default=15)
    args = parser.parse_args()

    out = ROUNDS / f"r{args.round}"
    # Records an earlier round already grouped: from the work rounds (gitignored) and from the
    # committed index, so a fresh checkout doesn't send them to extraction again.
    earlier = set()
    for path in sorted(ROUNDS.glob("r*/candidates.jsonl")):
        if path.parent != out:
            earlier |= {r["id"] for c in read_jsonl(path) for r in c["records"]}
    if (SEARCH / "candidates.csv").exists():
        with (SEARCH / "candidates.csv").open() as f:
            for r in csv.DictReader(f):
                if not r["cid"].startswith(f"r{args.round}-"):
                    earlier |= set(filter(None, r["records"].split(";")))

    latest = latest_decisions()
    records = {r["id"]: r for r in read_jsonl(WORK / "records.jsonl")}
    keep = [rid for rid, row in latest.items()
            if row["stage"] == "strict" and row["label"] in KEEP and rid in records and rid not in earlier]

    uf = UnionFind()
    for rid in keep:
        uf.find(rid)
        n = norm_name(latest[rid]["name"])
        if len(n) >= 3:
            uf.union(rid, f"name:{n}")
    groups = defaultdict(list)
    for rid in keep:
        groups[uf.find(rid)].append(rid)

    rank = {"benchmark": 0, "eval_framework": 1, "borderline": 2}
    candidates = []
    for members in groups.values():
        rows = [records[rid] for rid in members]
        labels = Counter(latest[rid]["label"] for rid in members)
        names = Counter(latest[rid]["name"] for rid in members if latest[rid]["name"])
        # Papers first, then datasets and repos.
        rows.sort(key=lambda r: (not (r["doi"] or r["arxiv_id"]), -(r["cited_by"] or 0)))
        candidates.append({
            "name": names.most_common(1)[0][0] if names else rows[0]["title"],
            "labels": dict(labels),
            "best_label": min(labels, key=rank.get),
            "records": [{
                "id": r["id"], "label": latest[r["id"]]["label"], "reason": latest[r["id"]]["reason"],
                "title": r["title"], "year": r["year"], "doi": r["doi"], "arxiv_id": r["arxiv_id"],
                "pmcid": r["pmcid"], "paperclip_id": r["paperclip_id"], "url": r["url"],
                "hf_ids": r["hf_ids"], "github_repos": r["github_repos"], "venue": r["venue"],
                "cited_by": r["cited_by"], "downloads": r["downloads"],
                # Abstracts for the first few records only; big groups are mostly dataset mirrors.
                "abstract": (r["abstract"] or "")[:1500] if i < 5 else "",
            } for i, r in enumerate(rows)],
            "n_records": len(rows),
        })
    # Similar names sort together, so contiguous batches send MedQA and MedQA-CS to the same agent;
    # benchmark batches come before borderline ones.
    candidates.sort(key=lambda c: (rank[c["best_label"]], c["name"].lower()))
    for i, c in enumerate(candidates):
        c["cid"] = f"r{args.round}-c{i:04d}"

    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("*.jsonl"):
        old.unlink()
    write_jsonl(out / "candidates.jsonl", candidates)
    n_batches = -(-len(candidates) // args.batch_size)
    for b in range(n_batches):
        write_jsonl(out / f"b{b:03d}.jsonl", candidates[b * args.batch_size:(b + 1) * args.batch_size])

    index = SEARCH / "candidates.csv"
    rows = []
    if index.exists():
        with index.open() as f:
            rows = [r for r in csv.DictReader(f) if not r["cid"].startswith(f"r{args.round}-")]
    rows += [{"cid": c["cid"], "name": c["name"], "best_label": c["best_label"],
              "records": ";".join(r["id"] for r in c["records"])} for c in candidates]
    with index.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["cid", "name", "best_label", "records"])
        w.writeheader()
        w.writerows(rows)

    print(f"round {args.round}: {len(keep)} screened-in records -> {len(candidates)} candidates "
          f"in {n_batches} batches", file=sys.stderr)
    print(Counter(c["best_label"] for c in candidates), file=sys.stderr)


if __name__ == "__main__":
    main()
