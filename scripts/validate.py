"""Validate entries/*.yaml and terms/*.yaml against their schemas, plus checks the schemas can't express.

Usage:
    uv run scripts/validate.py
"""

from __future__ import annotations

import csv
import json
import sys

import yaml
from jsonschema import Draft202012Validator

from common import ROOT, load_yaml


def load_entries(errors: list[str] | None = None) -> dict[str, dict]:
    """Parse entries/*.yaml. Files that aren't valid YAML are reported in `errors` (or raise)."""
    entries = {}
    for path in sorted((ROOT / "entries").glob("*.yaml")):
        try:
            entries[path.stem] = load_yaml(path.read_text())
        except yaml.YAMLError as err:
            if errors is None:
                raise
            mark = getattr(err, "problem_mark", None)
            where = f" at line {mark.line + 1}" if mark else ""
            errors.append(f"{path.stem}: invalid YAML{where}; quote strings that contain ': ' or ' #'")
    return entries


def main() -> int:
    schema = json.loads((ROOT / "schema" / "entry.schema.json").read_text())
    validator = Draft202012Validator(schema)
    with (ROOT / "data" / "countries.csv").open() as f:
        countries = {row["iso3"] for row in csv.DictReader(f)} | {"GLOBAL", "UNKNOWN"}

    errors = []
    entries = load_entries(errors)
    names, owners = {}, {}
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
        # Two entries sharing a paper or dataset are usually one benchmark written twice.
        links = e.get("links") or {}
        for kind in ("doi", "arxiv"):
            if links.get(kind):
                owners.setdefault(f"{kind}:{str(links[kind]).lower()}", []).append(stem)
        for hf in links.get("huggingface") or []:
            owners.setdefault(f"huggingface:{hf.lower()}", []).append(stem)

    # A warning, not an error: one paper can release two benchmarks.
    warnings = [f"warning: {', '.join(stems)} share {link}; merge them if they are one benchmark"
                for link, stems in sorted(owners.items()) if len(stems) > 1]

    # Pass-2 term files.
    terms_validator = Draft202012Validator(json.loads((ROOT / "schema" / "terms.schema.json").read_text()))
    term_files = sorted((ROOT / "terms").glob("*.yaml"))
    for path in term_files:
        try:
            t = load_yaml(path.read_text())
        except yaml.YAMLError as err:
            mark = getattr(err, "problem_mark", None)
            where = f" at line {mark.line + 1}" if mark else ""
            errors.append(f"terms/{path.stem}: invalid YAML{where}; quote strings that contain ': ' or ' #'")
            continue
        for err in terms_validator.iter_errors(t):
            loc = "/".join(str(p) for p in err.absolute_path) or "(root)"
            errors.append(f"terms/{path.stem}: {loc}: {err.message}")
        if isinstance(t, dict) and t.get("entry") != path.stem:
            errors.append(f"terms/{path.stem}: entry {t.get('entry')!r} does not match the file name")
        if path.stem not in entries:
            errors.append(f"terms/{path.stem}: no entry with this id")

    for line in errors + warnings:
        print(line)
    print(f"{len(entries)} entries, {len(term_files)} term files, {len(errors)} problems", file=sys.stderr)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
