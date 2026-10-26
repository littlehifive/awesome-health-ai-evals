"""Split entries that need pass-2 term extraction into lists for the term agents.

An entry needs pass 2 if it is an evaluation framework or is scored by an LLM
judge, expert rating, simulated dialogue, or real-user data, and has no file in
terms/ yet. Benchmarks scored only by exact match get terms from terms_mcq.py;
benchmarks scored only by automatic metrics are left for later. Writes
search/work/pass2/p2-XXX.txt (one entry ID per line), numbered after any lists
already there.

Usage:
    uv run scripts/pass2_lists.py [--size 15]
"""

from __future__ import annotations

import argparse
import sys

from common import ROOT, WORK
from validate import load_entries

JUDGED = {"rubric_llm_judge", "expert_human_rating", "simulated_multi_turn", "real_user_data"}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--size", type=int, default=15)
    args = parser.parse_args()

    done = {p.stem for p in (ROOT / "terms").glob("*.yaml")}
    out = WORK / "pass2"
    out.mkdir(parents=True, exist_ok=True)
    listed = {line.strip() for p in out.glob("p2-*.txt") for line in p.read_text().split() if line.strip()}
    picked = sorted(k for k, e in load_entries([]).items()
                    if (e["kind"] == "eval_framework" or set(e["facets"]["eval_methods"]) & JUDGED)
                    and k not in done and k not in listed)
    start = len(list(out.glob("p2-*.txt")))
    for i in range(0, len(picked), args.size):
        (out / f"p2-{start + i // args.size:03d}.txt").write_text("\n".join(picked[i:i + args.size]) + "\n")
    print(f"{len(picked)} entries -> {-(-len(picked) // args.size)} new pass-2 lists", file=sys.stderr)


if __name__ == "__main__":
    main()
