"""Shared helpers for the search, screening, and build scripts."""

from __future__ import annotations

import csv
import hashlib
import json
import os
import re
import time
import unicodedata
from datetime import date
from pathlib import Path

import requests
import yaml

ROOT = Path(__file__).resolve().parent.parent
SEARCH = ROOT / "search"
RAW = SEARCH / "raw"  # cached API responses (gitignored)
WORK = SEARCH / "work"  # full records with abstracts (gitignored)
LOG = SEARCH / "log.csv"

LOG_FIELDS = ["date", "track", "query_id", "source", "query", "hits"]


def load_env() -> None:
    """Load KEY=VALUE lines from .env into os.environ without overwriting."""
    path = ROOT / ".env"
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


class _NoDateLoader(yaml.SafeLoader):
    """SafeLoader that keeps dates as strings, as the entry schema expects."""


_NoDateLoader.yaml_implicit_resolvers = {
    k: [r for r in v if r[0] != "tag:yaml.org,2002:timestamp"]
    for k, v in yaml.SafeLoader.yaml_implicit_resolvers.items()
}


def load_yaml(text: str):
    return yaml.load(text, Loader=_NoDateLoader)


def load_queries() -> dict:
    return yaml.safe_load((SEARCH / "queries.yaml").read_text())


def _cache_path(track: str, key: str) -> Path:
    digest = hashlib.sha1(key.encode()).hexdigest()[:16]
    return RAW / track / f"{digest}.json"


def cached_get(track: str, url: str, params: dict | None = None,
               secret_params: dict | None = None, headers: dict | None = None,
               pause: float = 0.0, retries: int = 4) -> dict | list:
    """GET a JSON resource, caching it under search/raw/<track>/.

    Secret params (API keys) are sent but left out of the cache key.
    """
    params = params or {}
    key = url + "?" + json.dumps(params, sort_keys=True)
    path = _cache_path(track, key)
    if path.exists():
        return json.loads(path.read_text())["body"]
    resp = None
    for attempt in range(retries):
        resp = requests.get(url, params={**params, **(secret_params or {})},
                            headers=headers, timeout=60)
        if resp.status_code in (429, 500, 502, 503, 504):
            time.sleep(2 ** attempt * 2)
            continue
        if not resp.ok:
            break
        body = resp.json()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"url": url, "params": params,
                                    "fetched": date.today().isoformat(),
                                    "body": body}))
        if pause:
            time.sleep(pause)
        return body
    # Never echo the request URL: it carries secret params.
    raise RuntimeError(f"GET {url} failed with HTTP {resp.status_code} "
                       f"for params {json.dumps(params)[:300]}: {resp.text[:300]}")


def cache_put(track: str, key: str, body) -> None:
    path = _cache_path(track, key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"key": key, "fetched": date.today().isoformat(),
                                "body": body}))


def cache_get(track: str, key: str):
    path = _cache_path(track, key)
    if path.exists():
        return json.loads(path.read_text())["body"]
    return None


def log_query(track: str, query_id: str, source: str, query: str, hits: int) -> None:
    """Append one row to search/log.csv, replacing an earlier row for the same query."""
    rows = []
    if LOG.exists():
        with LOG.open() as f:
            rows = [r for r in csv.DictReader(f)
                    if (r["track"], r["query_id"], r["source"]) != (track, query_id, source)]
    rows.append({"date": date.today().isoformat(), "track": track, "query_id": query_id,
                 "source": source, "query": query, "hits": hits})
    with LOG.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=LOG_FIELDS)
        w.writeheader()
        w.writerows(rows)


def read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def norm_title(title: str | None) -> str:
    if not title:
        return ""
    t = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", t.lower()).strip()


def norm_doi(doi: str | None) -> str | None:
    if not doi:
        return None
    doi = doi.strip().lower()
    doi = re.sub(r"^https?://(dx\.)?doi\.org/", "", doi)
    return doi or None


ARXIV_RE = re.compile(r"(\d{4}\.\d{4,5})(v\d+)?")


def arxiv_id_from(*values: str | None) -> str | None:
    """Pull a modern arXiv ID out of a DOI, URL, or paperclip ID."""
    for v in values:
        if not v:
            continue
        v = v.lower()
        if "arxiv" in v or v.startswith("arx_"):
            m = ARXIV_RE.search(v)
            if m:
                return m.group(1)
    return None


def new_record(track: str, query_id: str, **fields) -> dict:
    """A search hit in the common shape used by dedup and screening."""
    rec = {
        "track": track,
        "query_id": query_id,
        "title": None,
        "abstract": None,
        "year": None,
        "doi": None,
        "arxiv_id": None,
        "openalex_id": None,
        "pmcid": None,
        "paperclip_id": None,
        "hf_id": None,
        "github_repo": None,
        "url": None,
        "venue": None,
        "authors": None,
        "type": None,
        "cited_by": None,
    }
    rec.update(fields)
    rec["doi"] = norm_doi(rec["doi"])
    if not rec["arxiv_id"]:
        rec["arxiv_id"] = arxiv_id_from(rec["doi"], rec["url"], rec["paperclip_id"])
    return rec
