"""Labels derived from entry facts: income group, WHO region, grounding, research vs practice.

Used by build_readme.py and, later, the site build.
"""

from __future__ import annotations

import csv
from functools import lru_cache

from common import ROOT

INCOME_ORDER = ["low", "lower-middle", "upper-middle", "high"]


@lru_cache
def countries() -> dict[str, dict]:
    with (ROOT / "data" / "countries.csv").open() as f:
        return {row["iso3"]: row for row in csv.DictReader(f)}


# display names where cutting the World Bank name at the comma would be ambiguous or odd
DISPLAY = {"COD": "DR Congo", "COG": "Republic of the Congo", "KOR": "South Korea", "PRK": "North Korea",
           "HKG": "Hong Kong", "MAC": "Macao"}


def country_name(code: str) -> str:
    if code == "GLOBAL":
        return "Global"
    if code == "UNKNOWN":
        return "Unknown"
    if code in DISPLAY:
        return DISPLAY[code]
    name = countries().get(code, {}).get("name", code)
    return name.split(",")[0]


def income_groups(codes: list[str]) -> list[str]:
    """Distinct World Bank income groups of the given countries, poorest first."""
    groups = {countries()[c]["income_group"] for c in codes if c in countries()}
    return [g for g in INCOME_ORDER if g in groups]


def who_regions(codes: list[str]) -> list[str]:
    return sorted({countries()[c]["who_region"] for c in codes
                   if c in countries() and countries()[c]["who_region"]})


def item_countries(entry: dict) -> list[str]:
    geo = entry["geography"]
    codes = list(geo.get("item_origin_countries", []))
    for s in geo.get("subsets", []):
        codes += [c for c in s.get("countries", []) if c not in codes]
    return codes


def grounding(entry: dict) -> str:
    """native LMIC / adapted / translated only / high-income only / global or unknown."""
    geo = entry["geography"]
    groups = income_groups(item_countries(entry))
    lmic = any(g != "high" for g in groups)
    loc = {geo.get("localization")} | {s.get("localization") for s in geo.get("subsets", [])}
    if lmic and "native" in loc:
        return "native LMIC"
    if lmic and loc & {"adapted", "mixed"}:
        return "adapted"
    if lmic and "translated" in loc:
        return "translated only"
    if groups == ["high"]:
        return "high-income only"
    return "global or unknown"


def research_or_practice(entry: dict) -> str:
    builders = set(entry["origin"]["builder_types"])
    provenance = set(entry["origin"]["item_provenance"])
    practice = bool(builders & {"implementer_ngo", "government"}) or "real_user_queries" in provenance
    research = bool(builders & {"academic", "industry_lab"}) or entry["origin"]["venue"] != "grey_literature"
    if practice and research:
        return "both"
    return "practice" if practice else "research"
