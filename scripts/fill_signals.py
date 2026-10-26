"""Fill entry signals: OpenAlex citations, Hugging Face downloads, GitHub stars.

Rewrites the signals block of each entries/*.yaml in place, keeping `uptake`.

Usage:
    uv run scripts/fill_signals.py
"""

from __future__ import annotations

import json
import re
import subprocess
from datetime import date

import requests
import yaml

from common import ROOT, cached_get, load_yaml
from search_openalex import API, OpenAlex


def openalex_citations(oa: OpenAlex, links: dict) -> int | None:
    dois = []
    if links.get("doi"):
        dois.append(links["doi"])
    if links.get("arxiv"):
        dois.append(f"10.48550/arxiv.{links['arxiv']}")
    best = None
    for doi in dois:
        try:
            w = cached_get("openalex", f"{API}/doi:{doi}", {"select": "id,cited_by_count"},
                           secret_params=oa.secret)
        except RuntimeError:
            continue
        best = max(best or 0, w.get("cited_by_count") or 0)
    return best


def hf_downloads(ids: list[str]) -> int | None:
    total = None
    for ds in ids:
        resp = requests.get(f"https://huggingface.co/api/datasets/{ds}", timeout=60)
        if resp.ok:
            total = (total or 0) + (resp.json().get("downloads") or 0)
    return total


def github_stars(url: str | None) -> int | None:
    m = re.match(r"https?://github\.com/([^/]+/[^/#?]+)", url or "")
    if not m:
        return None
    res = subprocess.run(["gh", "api", f"repos/{m.group(1).removesuffix('.git')}"],
                         capture_output=True, text=True)
    return json.loads(res.stdout).get("stargazers_count") if res.returncode == 0 else None


def main() -> None:
    oa = OpenAlex()
    today = date.today().isoformat()
    for path in sorted((ROOT / "entries").glob("*.yaml")):
        text = path.read_text()
        e = load_yaml(text)
        links = e.get("links", {})
        old = e.get("signals", {})
        signals = {
            "citations": openalex_citations(oa, links),
            "citations_source": "OpenAlex",
            "hf_downloads": hf_downloads(links.get("huggingface", [])),
            "github_stars": github_stars(links.get("code")),
            "uptake": old.get("uptake", []),
            "updated": today,
        }
        block = yaml.safe_dump({"signals": signals}, sort_keys=False, allow_unicode=True)
        # Replace an existing signals block, or insert one before provenance.
        if re.search(r"^signals:\n(?:  .*\n)*", text, flags=re.M):
            text = re.sub(r"^signals:\n(?:  .*\n)*", block, text, flags=re.M)
        else:
            text = text.replace("\nprovenance:", "\n" + block + "provenance:", 1)
        path.write_text(text)
        print(f"{path.stem:<32} cites={signals['citations']} hf={signals['hf_downloads']} "
              f"stars={signals['github_stars']}")


if __name__ == "__main__":
    main()
