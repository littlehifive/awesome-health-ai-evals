"""Pin the country table: World Bank income group and region, WHO region.

Writes data/countries.csv. Re-run by hand to update the classification;
the fetch date is recorded in every row.

Usage:
    uv run scripts/fetch_countries.py
"""

from __future__ import annotations

import csv
from datetime import date

import requests

from common import ROOT

WB = "https://api.worldbank.org/v2/country?format=json&per_page=400"
WHO = "https://ghoapi.azureedge.net/api/DIMENSION/COUNTRY/DimensionValues"
INCOME = {"LIC": "low", "LMC": "lower-middle", "UMC": "upper-middle", "HIC": "high", "INX": "unclassified"}
# Economies in the World Bank's classification file but not returned by its API.
EXTRA = [{"iso3": "TWN", "name": "Taiwan, China", "income_group": "high", "lmic": "no",
          "wb_region": "East Asia & Pacific", "who_region": ""}]


def main() -> None:
    wb = [c for c in requests.get(WB, timeout=60).json()[1] if c["region"]["value"] != "Aggregates"]
    who = {c["Code"]: c for c in requests.get(WHO, timeout=60).json()["value"]}
    today = date.today().isoformat()
    rows = []
    for c in wb:
        income = INCOME.get(c["incomeLevel"]["id"], "unclassified")
        w = who.get(c["id"], {})
        rows.append({
            "iso3": c["id"],
            "name": c["name"],
            "income_group": income,
            "lmic": "yes" if income in ("low", "lower-middle", "upper-middle") else "no",
            "wb_region": c["region"]["value"].strip(),
            "who_region": w.get("ParentCode") or "",
            "fetched": today,
        })
    have = {r["iso3"] for r in rows}
    rows += [{**e, "fetched": today} for e in EXTRA if e["iso3"] not in have]
    out = ROOT / "data" / "countries.csv"
    out.parent.mkdir(exist_ok=True)
    with out.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(sorted(rows, key=lambda r: r["iso3"]))
    print(f"wrote {len(rows)} countries to data/countries.csv")


if __name__ == "__main__":
    main()
