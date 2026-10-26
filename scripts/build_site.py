"""Build the static site in site/dist from entries, terms, the taxonomy, and site/src.

Writes site/dist/data/catalog.json (entries with derived labels, terms, and
construct mappings) and copies the app shell from site/src. The site is plain
HTML, CSS, and JavaScript; Vercel serves site/dist as-is (see vercel.json).

Usage:
    uv run scripts/build_site.py
"""

from __future__ import annotations

import csv
import json
import shutil
import sys
from collections import Counter
from datetime import date

import pycountry
import yaml

from common import ROOT, load_yaml
from derive import country_name, grounding, income_groups, item_countries, research_or_practice, who_regions
from validate import load_entries

SRC = ROOT / "site" / "src"
DIST = ROOT / "site" / "dist"


def countries() -> dict[str, dict]:
    out = {}
    with (ROOT / "data" / "countries.csv").open() as f:
        for row in csv.DictReader(f):
            c = pycountry.countries.get(alpha_3=row["iso3"])
            out[row["iso3"]] = {"name": country_name(row["iso3"]), "income": row["income_group"],
                                "region": row["who_region"], "numeric": c.numeric if c else None}
    return out


def load_terms() -> dict[str, list[dict]]:
    terms = {}
    for path in sorted((ROOT / "terms").glob("*.yaml")):
        doc = load_yaml(path.read_text()) or {}
        terms[path.stem] = doc.get("terms") or []
    return terms


def load_taxonomy() -> dict:
    path = ROOT / "taxonomy" / "constructs.yaml"
    return yaml.safe_load(path.read_text()) if path.exists() else {}


def main() -> None:
    entries = load_entries()
    terms = load_terms()
    taxonomy = load_taxonomy()
    # term mappings: (entry id, term) -> [{construct, relationship, status}]
    mapped = {}
    for m in taxonomy.get("mappings", []):
        mapped.setdefault((m["entry"], m["term"]), []).append(
            {"construct": m["construct"], "relationship": m.get("relationship", "same"),
             "status": m.get("status", "agreed")})

    rows = []
    for eid, e in sorted(entries.items()):
        codes = item_countries(e)
        geo, origin, facets = e["geography"], e["origin"], e["facets"]
        entry_terms = [{**t, "constructs": mapped.get((eid, t["term"]), [])} for t in terms.get(eid, [])]
        rows.append({
            "id": eid, "name": e["name"], "kind": e["kind"], "year": e["year"], "summary": e["summary"],
            "section": e["readme_section"], "featured": bool(e.get("featured")),
            "links": e.get("links") or {}, "license": e.get("license"), "open_data": e["open_data"],
            "adapted_from": e.get("adapted_from") or [],
            "languages": geo["item_languages"], "countries": codes,
            "country_names": [country_name(c) for c in codes],
            "rater_countries": geo.get("rater_countries") or [],
            "lead_countries": geo.get("lead_institution_countries") or [],
            "origin_note": geo.get("item_origin_note") or "", "localization": geo["localization"],
            "subsets": geo.get("subsets") or [],
            "income": income_groups(codes), "regions": who_regions(codes), "grounding": grounding(e),
            "setting": research_or_practice(e),
            "builders": origin["builder_types"], "provenance": origin["item_provenance"], "venue": origin["venue"],
            "health_areas": facets["health_areas"], "users": facets["intended_users"],
            "methods": facets["eval_methods"], "modality": facets["modality"], "size": facets.get("size") or "",
            "signals": e.get("signals") or {},
            "confidence": e["provenance"]["confidence"], "read_full_text": e["provenance"].get("read_full_text"),
            "notes": e["provenance"].get("notes") or "",
            "terms": entry_terms,
            "constructs": sorted({m["construct"] for t in entry_terms for m in t["constructs"]}),
        })

    catalog = {
        "built": date.today().isoformat(),
        "entries": rows,
        "countries": countries(),
        "constructs": taxonomy.get("constructs", []),
        "domains": taxonomy.get("domains", []),
        "counts": {"entries": len(rows), "terms": sum(len(r["terms"]) for r in rows),
                   "by_section": Counter(r["section"] for r in rows)},
    }

    if DIST.exists():
        shutil.rmtree(DIST)
    shutil.copytree(SRC, DIST)
    (DIST / "data").mkdir(exist_ok=True)
    (DIST / "data" / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")))
    print(f"site/dist: {len(rows)} entries, {catalog['counts']['terms']} terms, "
          f"{len(catalog['constructs'])} constructs", file=sys.stderr)


if __name__ == "__main__":
    main()
