"""The headline numbers, computed once so the README and the site can't disagree.

Both build scripts call catalog_counts() and format data/about.yaml with the result.
"""

from __future__ import annotations

from common import ROOT, load_yaml, search_stats
from derive import grounding, income_groups, item_countries
from validate import load_entries

SITE = "https://awesome-health-ai-evals-iota.vercel.app"
REPO = "https://github.com/littlehifive/awesome-health-ai-evals"


def load_terms() -> dict[str, dict]:
    """terms/<id>.yaml -> {"terms": [...], "sources": [...], "extracted": "..."}"""
    out = {}
    for path in sorted((ROOT / "terms").glob("*.yaml")):
        doc = load_yaml(path.read_text()) or {}
        out[path.stem] = {"terms": doc.get("terms") or [], "sources": doc.get("sources") or [],
                          "extracted": str(doc.get("extracted") or "")}
    return out


def catalog_counts(entries: dict[str, dict] | None = None, terms: dict[str, dict] | None = None,
                   taxonomy: dict | None = None) -> dict:
    entries = entries if entries is not None else load_entries()
    terms = terms if terms is not None else load_terms()
    taxonomy = taxonomy if taxonomy is not None else load_yaml((ROOT / "taxonomy" / "constructs.yaml").read_text())
    rows = list(entries.values())
    stats = search_stats()
    codes = {e["id"]: item_countries(e) for e in rows}
    countries = {c for cs in codes.values() for c in cs if len(c) == 3 and c != "UNKNOWN"}
    languages = {lang for e in rows for lang in e["geography"]["item_languages"] if lang != "UNKNOWN"}
    n_terms = sum(len(t["terms"]) for t in terms.values())
    return {
        "entries": len(rows),
        "benchmarks": sum(1 for e in rows if e["kind"] == "benchmark"),
        "frameworks": sum(1 for e in rows if e["kind"] == "eval_framework"),
        "countries": len(countries),
        "languages": len(languages),
        "lmic": sum(1 for e in rows if grounding(e) == "native LMIC"),
        "low": sum(1 for e in rows if "low" in income_groups(codes[e["id"]])),
        "terms": n_terms,
        "entries_with_terms": sum(1 for t in terms.values() if t["terms"]),
        "constructs": len(taxonomy.get("constructs", [])),
        "domains": len(taxonomy.get("domains", [])),
        "queries": stats["queries"], "records": stats["records"], "screened": stats["screened"],
        "kept": stats["kept"], "candidates": stats["candidates"],
        "site": SITE, "repo": REPO,
    }


def fill(obj, counts: dict):
    """Format every {placeholder} in a nested about.yaml structure. Numbers get thousands separators."""
    pretty = {k: (f"{v:,}" if isinstance(v, int) else v) for k, v in counts.items()}
    if isinstance(obj, str):
        return obj.format(**pretty)
    if isinstance(obj, list):
        return [fill(x, counts) for x in obj]
    if isinstance(obj, dict):
        return {k: fill(v, counts) for k, v in obj.items()}
    return obj
