"""Map every pass-2 term to taxonomy constructs (taxonomy step 5).

Sends terms in groups of 25 to an OpenAI model with the construct list
(taxonomy/constructs.yaml) and asks, for each term, which constructs it
measures and how closely: same, narrower, broader, or partial. Mappings to a
contested construct are marked contested. Writes the `mappings` list back into
taxonomy/constructs.yaml and caches each answer, so re-runs only send new terms.

Usage:
    uv run scripts/map_terms.py [--model gpt-6.1-sol] [--workers 12]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor

import yaml
from openai import OpenAI

from common import ROOT, cache_get, cache_put, load_env, read_jsonl

TAX = ROOT / "taxonomy"
RELS = ["same", "narrower", "broader", "partial"]

SCHEMA = {
    "type": "object",
    "properties": {"mappings": {"type": "array", "items": {
        "type": "object",
        "properties": {
            "n": {"type": "integer"},
            "constructs": {"type": "array", "items": {
                "type": "object",
                "properties": {"id": {"type": "string"}, "relationship": {"type": "string", "enum": RELS}},
                "required": ["id", "relationship"], "additionalProperties": False}},
        },
        "required": ["n", "constructs"], "additionalProperties": False}}},
    "required": ["mappings"], "additionalProperties": False,
}


def system_prompt(constructs: list[dict]) -> str:
    lines = [f"- {c['id']}: {c['name']}. {c['definition']}" for c in constructs]
    return ("You map evaluation terms from health AI benchmarks and evaluation frameworks to a taxonomy of constructs "
            "(qualities of a model's output or behavior that evaluations judge).\n\nConstructs:\n" + "\n".join(lines) +
            "\n\nFor each numbered term, give the one construct it measures, or two if it clearly measures both. "
            "relationship: same (the term measures the construct as defined), narrower (one part of it), broader "
            "(the construct plus more), partial (overlaps but is not contained either way). If no construct fits, "
            "return an empty list. Use only construct ids from the list.")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="gpt-6.1-sol")
    parser.add_argument("--workers", type=int, default=12)
    args = parser.parse_args()

    doc = yaml.safe_load((TAX / "constructs.yaml").read_text())
    constructs = doc["constructs"]
    valid = {c["id"] for c in constructs}
    contested = {c["id"] for c in constructs if c.get("status") == "contested"}
    # skip terms whose terms file was removed (merged or dropped entries) since clustering
    present = {p.stem for p in (ROOT / "terms").glob("*.yaml")}
    terms = [t for t in read_jsonl(TAX / "terms.jsonl") if t["entry"] in present]
    system = system_prompt(constructs)
    sys_key = hashlib.sha1((args.model + system).encode()).hexdigest()[:12]

    load_env()
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    groups = [terms[i:i + 25] for i in range(0, len(terms), 25)]

    def run(group: list[dict]) -> list[dict]:
        body = "\n".join(f"{n}. {t['term']} ({t['entry']}): {t['definition'][:300]}" for n, t in enumerate(group, 1))
        key = f"{sys_key}:{hashlib.sha1(body.encode()).hexdigest()}"
        cached = cache_get("map_terms", key)
        if cached is None:
            resp = client.chat.completions.create(
                model=args.model, reasoning_effort="low",
                messages=[{"role": "system", "content": system}, {"role": "user", "content": body}],
                response_format={"type": "json_schema",
                                 "json_schema": {"name": "map", "strict": True, "schema": SCHEMA}})
            cached = json.loads(resp.choices[0].message.content)["mappings"]
            cache_put("map_terms", key, cached)
        out = []
        for m in cached:
            if not 1 <= m["n"] <= len(group):
                continue
            t = group[m["n"] - 1]
            for c in m["constructs"]:
                if c["id"] in valid:
                    out.append({"entry": t["entry"], "term": t["term"], "construct": c["id"],
                                "relationship": c["relationship"],
                                "status": "contested" if c["id"] in contested else "agreed"})
        return out

    with ThreadPoolExecutor(args.workers) as pool:
        mappings = [m for chunk in pool.map(run, groups) for m in chunk]
    doc["mappings"] = mappings
    (TAX / "constructs.yaml").write_text(
        yaml.safe_dump(doc, sort_keys=False, allow_unicode=True, width=140))
    mapped = {(m["entry"], m["term"]) for m in mappings}
    print(f"{len(terms)} terms, {len(mapped)} mapped ({len(mappings)} mappings), "
          f"{len(terms) - len(mapped)} unmapped", file=sys.stderr)


if __name__ == "__main__":
    main()
