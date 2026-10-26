"""Validate entries/*.yaml against the schema, plus checks the schema can't express.

Usage:
    uv run scripts/validate.py
"""

from __future__ import annotations

import csv
import json
import sys

from jsonschema import Draft202012Validator

from common import ROOT, load_yaml


def load_entries() -> dict[str, dict]:
    entries = {}
    for path in sorted((ROOT / "entries").glob("*.yaml")):
        entries[path.stem] = load_yaml(path.read_text())
    return entries


def main() -> int:
    schema = json.loads((ROOT / "schema" / "entry.schema.json").read_text())
    validator = Draft202012Validator(schema)
    with (ROOT / "data" / "countries.csv").open() as f:
        countries = {row["iso3"] for row in csv.DictReader(f)} | {"GLOBAL", "UNKNOWN"}

    entries = load_entries()
    errors = []
    names = {}
    for stem, e in entries.items():
        for err in validator.iter_errors(e):
            loc = "/".join(str(p) for p in err.absolute_path) or "(root)"
            errors.append(f"{stem}: {loc}: {err.message}")
        if not isinstance(e, dict):
            continue
        if e.get("id") != stem:
            errors.append(f"{stem}: id {e.get('id')!r} does not match the file name")
        geo = e.get("geography") or {}
        codes = (geo.get("item_origin_countries", []) + geo.get("rater_countries", [])
                 + geo.get("lead_institution_countries", [])
                 + [c for s in geo.get("subsets", []) for c in s.get("countries", [])])
        for code in codes:
            if code not in countries:
                errors.append(f"{stem}: unknown country code {code!r}")
        for parent in e.get("adapted_from", []):
            if parent not in entries:
                errors.append(f"{stem}: adapted_from {parent!r} is not an entry")
        if e.get("kind") == "eval_framework" and e.get("readme_section") != "frameworks":
            errors.append(f"{stem}: eval_framework entries go in readme_section 'frameworks'")
        key = (e.get("name") or "").lower()
        if key in names:
            errors.append(f"{stem}: same name as {names[key]}")
        names[key] = stem

    for line in errors:
        print(line)
    print(f"{len(entries)} entries, {len(errors)} problems", file=sys.stderr)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
