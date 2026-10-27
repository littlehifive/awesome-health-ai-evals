"""Build the static site in site/dist from entries, terms, the taxonomy, and site/src.

Writes three data files and copies the app shell from site/src:

- data/entries.json: entries with derived labels but no terms, plus everything the
  site needs up front (countries, taxonomy, families, glossary, pipeline counts).
  Home and Catalog load only this.
- data/details.json: each entry's terms (with their construct mappings), its card (the
  prose facts from scripts/build_cards.py) and extraction notes, loaded only by views
  that need them (entry pages, construct pages, Compare).
- data/catalog.json: both combined, as the single-file download.

The site is plain HTML, CSS, and JavaScript; Vercel serves site/dist as-is (see vercel.json).

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

from common import ROOT, load_yaml, search_stats
from counts import catalog_counts, fill, load_terms
from derive import country_name, grounding, income_groups, item_countries, research_or_practice, who_regions
from validate import load_entries

SRC = ROOT / "site" / "src"
DIST = ROOT / "site" / "dist"
SITE_URL = "https://awesome-health-ai-evals-iota.vercel.app"

# derive.grounding() values -> the site's origin keys. "global or unknown" is split by
# whether the entry says its items are general (GLOBAL) or doesn't say at all.
ORIGIN = {"native LMIC": "lmic", "adapted": "adapted", "translated only": "translated",
          "high-income only": "high"}


def countries() -> dict[str, dict]:
    out = {}
    with (ROOT / "data" / "countries.csv").open() as f:
        for row in csv.DictReader(f):
            c = pycountry.countries.get(alpha_3=row["iso3"])
            out[row["iso3"]] = {"name": country_name(row["iso3"]), "income": row["income_group"],
                                "region": row["who_region"], "numeric": c.numeric if c else None}
    return out




def load_data_yaml(name: str) -> dict:
    path = ROOT / name
    return yaml.safe_load(path.read_text()) if path.exists() else {}


def origin_of(e: dict, codes: list[str]) -> str:
    g = grounding(e)
    if g in ORIGIN:
        return ORIGIN[g]
    return "global" if "GLOBAL" in codes else "unstated"


def top_related(items: list[dict], n: int = 15) -> list[dict]:
    top = sorted(items, key=lambda x: -(x.get("cited_by") or 0))[:n]
    return [{k: it.get(k) for k in ("title", "url", "year", "by", "cited_by")} for it in top]


def main() -> None:
    entries = load_entries()
    terms = load_terms()
    taxonomy = load_data_yaml("taxonomy/constructs.yaml")
    related = load_data_yaml("data/related.yaml")
    glossary = load_data_yaml("data/glossary.yaml")
    labels = load_data_yaml("data/labels.yaml")
    about = load_data_yaml("data/about.yaml")
    # term mappings: (entry id, term) -> [{construct, relationship, status}]
    mapped = {}
    for m in taxonomy.get("mappings", []):
        mapped.setdefault((m["entry"], m["term"]), []).append(
            {"construct": m["construct"], "relationship": m.get("relationship", "same"),
             "status": m.get("status", "agreed")})

    rows, details = [], {}
    for eid, e in sorted(entries.items()):
        codes = item_countries(e)
        geo, origin, facets = e["geography"], e["origin"], e["facets"]
        tdoc = terms.get(eid) or {"terms": [], "sources": [], "extracted": ""}
        entry_terms = [{**t, "constructs": mapped.get((eid, t["term"]), [])} for t in tdoc["terms"]]
        details[eid] = {"terms": entry_terms, "notes": e["provenance"].get("notes") or "",
                        "sources": tdoc["sources"], "terms_extracted": tdoc["extracted"],
                        "card": e.get("card") or {}}
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
            "origin": origin_of(e, codes), "setting": research_or_practice(e),
            "builders": origin["builder_types"], "provenance": origin["item_provenance"], "venue": origin["venue"],
            "health_areas": facets["health_areas"], "users": facets["intended_users"],
            "methods": facets["eval_methods"], "modality": facets["modality"], "size": facets.get("size") or "",
            "signals": e.get("signals") or {},
            "confidence": e["provenance"]["confidence"], "read_full_text": e["provenance"].get("read_full_text"),
            "extracted": str(e["provenance"].get("extracted") or ""),
            "n_terms": len(entry_terms),
            "constructs": sorted({m["construct"] for t in entry_terms for m in t["constructs"]}),
        })

    # adaptation families: original id -> ids of entries adapted from it (only originals in the catalog)
    ids = {r["id"] for r in rows}
    families: dict[str, list[str]] = {}
    for r in rows:
        for parent in r["adapted_from"]:
            if parent in ids:
                families.setdefault(parent, []).append(r["id"])

    stats = search_stats()
    shared = catalog_counts(entries, terms, taxonomy)
    meta = {
        "built": date.today().isoformat(),
        "site_url": SITE_URL,
        "countries": countries(),
        "constructs": taxonomy.get("constructs", []),
        "domains": taxonomy.get("domains", []),
        "families": families,
        "glossary": glossary,
        "labels": labels,
        "about": fill(about, shared),
        "related": {"guidance": top_related(related.get("guidance", [])),
                    "surveys": top_related(related.get("surveys", [])),
                    "counts": {k: len(v) for k, v in related.items()}},
        "counts": {**{k: v for k, v in shared.items() if k not in ("site", "repo")},
                   "by_section": Counter(r["section"] for r in rows)},
        "pipeline": stats,
    }

    if DIST.exists():
        shutil.rmtree(DIST)
    shutil.copytree(SRC, DIST)
    out = DIST / "data"
    out.mkdir(exist_ok=True)
    dump = lambda obj: json.dumps(obj, ensure_ascii=False, separators=(",", ":"))  # noqa: E731
    (out / "entries.json").write_text(dump({**meta, "entries": rows}))
    (out / "details.json").write_text(dump(details))
    full = [{**r, **details[r["id"]]} for r in rows]
    (out / "catalog.json").write_text(dump({**meta, "entries": full}))
    print(f"site/dist: {len(rows)} entries, {meta['counts']['terms']} terms, "
          f"{len(meta['constructs'])} constructs, {len(families)} families", file=sys.stderr)


if __name__ == "__main__":
    main()
