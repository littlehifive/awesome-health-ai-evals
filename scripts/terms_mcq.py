"""Write terms/<id>.yaml for entries scored only by multiple choice or exact match.

These entries judge one thing, answer accuracy, so pass-2 agents skip them.
Files this script wrote are marked `generated: terms_mcq` in their notes and
are rewritten on each run; files agents wrote are left alone.

Usage:
    uv run scripts/terms_mcq.py
"""

from __future__ import annotations

import sys
from datetime import date

import yaml

from common import ROOT, load_yaml
from validate import load_entries

MARK = "generated: terms_mcq"


def main() -> None:
    out_dir = ROOT / "terms"
    out_dir.mkdir(exist_ok=True)
    written = 0
    for eid, e in load_entries().items():
        if e["kind"] != "benchmark" or e["facets"]["eval_methods"] != ["mcq_exact_match"]:
            continue
        path = out_dir / f"{eid}.yaml"
        if path.exists() and MARK not in (load_yaml(path.read_text()) or {}).get("notes", ""):
            continue
        links = e.get("links", {})
        source = (links.get("paper") or (f"https://arxiv.org/abs/{links['arxiv']}" if links.get("arxiv") else None)
                  or (f"https://doi.org/{links['doi']}" if links.get("doi") else None)
                  or links.get("dataset") or links.get("code") or links.get("website") or f"entries/{eid}.yaml")
        doc = {
            "entry": eid,
            "sources": [source],
            "extracted": date.today().isoformat(),
            "terms": [{
                "term": "Accuracy",
                "level": "metric",
                "definition": "Share of items answered correctly, by exact match with the answer key.",
                "definition_verbatim": False,
                "location": "scoring method",
                "scale": "binary per item",
            }],
            "notes": f"{MARK} (multiple-choice or exact-match scoring only).",
        }
        path.write_text(yaml.safe_dump(doc, sort_keys=False, allow_unicode=True, width=120))
        written += 1
    print(f"wrote {written} term files", file=sys.stderr)


if __name__ == "__main__":
    main()
