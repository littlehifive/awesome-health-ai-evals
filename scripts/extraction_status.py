"""Summarize extraction progress: decisions logged per round and batch, and entries written.

Usage:
    uv run scripts/extraction_status.py
"""

from __future__ import annotations

import sys
from collections import Counter

from common import ROOT, SEARCH, WORK, read_jsonl


def main() -> None:
    logs = {p.stem: read_jsonl(p) for p in sorted((SEARCH / "extraction").glob("r*-b*.jsonl"))}
    for rdir in sorted((WORK / "rounds").glob("r*")):
        batches = sorted(rdir.glob("b*.jsonl"))
        sizes = {b.stem: sum(1 for _ in b.open()) for b in batches}
        done = {k: len(logs.get(f"{rdir.name}-{k}", [])) for k in sizes}
        complete = [k for k in sizes if done[k] >= sizes[k]]
        started = [k for k in sizes if 0 < done[k] < sizes[k]]
        print(f"{rdir.name}: {len(batches)} batches, {len(complete)} complete, "
              f"{len(started)} partial ({', '.join(started) or '-'}), "
              f"{sum(done.values())}/{sum(sizes.values())} candidates decided")
    decisions = Counter(row.get("decision") for rows in logs.values() for row in rows)
    reasons = Counter(row.get("reason", "").split()[0].rstrip(":,") for rows in logs.values() for row in rows
                      if row.get("decision") == "exclude" and row.get("reason"))
    print("decisions:", dict(decisions))
    print("exclude reasons:", dict(reasons.most_common(12)))
    print("entries:", len(list((ROOT / "entries").glob("*.yaml"))), file=sys.stdout)


if __name__ == "__main__":
    main()
