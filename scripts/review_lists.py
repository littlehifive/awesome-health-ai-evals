"""Split entries that need a second look into review lists for the review agents.

An entry needs review if its confidence is low, its full text wasn't read, it
has no paper link (a dataset or repo only), or its notes call its scope
borderline, and no review log covers it yet. Writes search/work/review/rv-XX.txt
(one entry ID per line), numbered after any lists already there.

Usage:
    uv run scripts/review_lists.py [--size 20]
"""

from __future__ import annotations

import argparse
import re
import sys

from common import SEARCH, WORK, read_jsonl
from validate import load_entries

FLAG = re.compile(r"borderline|out of scope|out_of_scope|edge of scope|one-off|may not belong", re.I)


def needs_review(e: dict) -> bool:
    p, links = e["provenance"], e.get("links") or {}
    return (p["confidence"] == "low" or not p.get("read_full_text")
            or not any(links.get(k) for k in ("paper", "doi", "arxiv"))
            or bool(FLAG.search(p.get("notes") or "")))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--size", type=int, default=20)
    args = parser.parse_args()

    entries = load_entries([])
    reviewed = {row["entry_id"] for p in (SEARCH / "extraction").glob("review-*.jsonl") for row in read_jsonl(p)}
    picked = sorted(k for k, e in entries.items() if needs_review(e) and k not in reviewed)
    out = WORK / "review"
    out.mkdir(exist_ok=True)
    start = len(list(out.glob("rv-*.txt")))  # earlier lists stay; new ones are numbered after them
    for i in range(0, len(picked), args.size):
        n = start + i // args.size
        (out / f"rv-{n:02d}.txt").write_text("\n".join(picked[i:i + args.size]) + "\n")
    print(f"{len(picked)} of {len(entries)} entries need review -> "
          f"{-(-len(picked) // args.size)} lists in search/work/review/", file=sys.stderr)


if __name__ == "__main__":
    main()
