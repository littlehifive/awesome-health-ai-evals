"""Build the reference data the skills ship with (skills/find-health-benchmarks/references/).

Writes:
- catalog.csv: one row per entry with the fields the skills filter and rank on;
- constructs.md: the construct taxonomy with definitions and how many entries judge each.

Usage:
    uv run scripts/build_skills_data.py
"""

from __future__ import annotations

import csv
import sys
from collections import Counter

import yaml

from build_readme import url_of
from common import ROOT
from derive import country_name, grounding, income_groups, item_countries, who_regions
from validate import load_entries

OUT = ROOT / "skills" / "find-health-benchmarks" / "references"
FIELDS = ["id", "name", "kind", "year", "summary", "item_languages", "item_countries", "income_groups",
          "who_regions", "item_origin", "eval_methods", "intended_users", "health_areas", "modality",
          "open_data", "license", "link", "entry_url", "constructs", "confidence"]
REPO = "https://github.com/littlehifive/awesome-health-ai-evals/blob/main"


def main() -> None:
    entries = load_entries()
    path = ROOT / "taxonomy" / "constructs.yaml"
    taxonomy = yaml.safe_load(path.read_text()) if path.exists() else {}
    by_entry: dict[str, set[str]] = {}
    for m in taxonomy.get("mappings", []):
        if m.get("relationship") != "none":
            by_entry.setdefault(m["entry"], set()).add(m["construct"])

    OUT.mkdir(parents=True, exist_ok=True)
    with (OUT / "catalog.csv").open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        for eid, e in sorted(entries.items()):
            codes = item_countries(e)
            facets = e["facets"]
            w.writerow({
                "id": eid, "name": e["name"], "kind": e["kind"], "year": e["year"], "summary": e["summary"],
                "item_languages": "; ".join(e["geography"]["item_languages"]),
                "item_countries": "; ".join(country_name(c) for c in codes),
                "income_groups": "; ".join(income_groups(codes)), "who_regions": "; ".join(who_regions(codes)),
                "item_origin": grounding(e), "eval_methods": "; ".join(facets["eval_methods"]),
                "intended_users": "; ".join(facets["intended_users"]),
                "health_areas": "; ".join(facets["health_areas"]), "modality": "; ".join(facets["modality"]),
                "open_data": e["open_data"], "license": e.get("license") or "", "link": url_of(e) or "", "entry_url": f"{REPO}/entries/{eid}.yaml",
                "constructs": "; ".join(sorted(by_entry.get(eid, ()))),
                "confidence": e["provenance"]["confidence"],
            })

    counts = Counter(c for cs in by_entry.values() for c in cs)
    lines = ["# Construct taxonomy", "",
             "What health-AI evaluations judge, built bottom-up from the terms catalog entries use "
             "(see the repository's `taxonomy/` and `docs/taxonomy.md`). Entries = catalog entries with at least "
             "one term mapped to the construct. Contested constructs are ones where evaluations disagree on what counts as a good output; read each entry's definition before comparing scores.", ""]
    constructs = taxonomy.get("constructs", [])
    for d in taxonomy.get("domains", []):
        lines += [f"## {d['name']}", "", d.get("description", ""), ""]
        for c in [c for c in constructs if c["domain"] == d["id"]]:
            status = " (contested)" if c.get("status") == "contested" else ""
            lines.append(f"- **{c['name']}** (`{c['id']}`, {counts.get(c['id'], 0)} entries){status}: {c['definition']}")
        lines.append("")
    if not constructs:
        lines.append("The taxonomy has not been built yet.")
    (OUT / "constructs.md").write_text("\n".join(lines).rstrip() + "\n")
    print(f"{OUT.relative_to(ROOT)}: {len(entries)} entries, {len(constructs)} constructs", file=sys.stderr)


if __name__ == "__main__":
    main()
