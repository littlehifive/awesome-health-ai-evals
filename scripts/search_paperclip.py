"""paperclip track: semantic search over arXiv, medRxiv, PMC, and the abstracts corpus.

paperclip's CLI needs Python 3.10+, so it runs through uv with its own
dependencies. Search output is parsed from text; abstracts come from each
paper's meta.json.

Usage:
    uv run scripts/search_paperclip.py
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from common import WORK, cache_get, cache_put, load_queries, log_query, new_record

PAPERCLIP = [
    "uv", "run", "-q", "--no-project", "--python", "3.12",
    "--with", "requests,pyyaml,click,rookiepy",
    "python", str(Path.home() / ".local/bin/paperclip"),
]

RESULT_RE = re.compile(r"^\s{1,4}(\d+)\.\s+(.*)$")
ID_RE = re.compile(r"^\s+(\S+) · ([^·]+?) · ([^·]+?)(?: · (\d+) citations.*)?$")
RESULT_LINE = re.compile(r'"document_id"|^Found \d+ papers', re.M)
DOI_RE = re.compile(r"https?://doi\.org/(\S+)")
ARXIV_RE = re.compile(r"arxiv\.org/abs/(\d{4}\.\d{4,5})")


def run(args: list[str]) -> str:
    """Run a paperclip command, waiting out its rate limit (up to 5 tries)."""
    for _ in range(5):
        out = subprocess.run(PAPERCLIP + args, capture_output=True, text=True, timeout=600)
        if "rate limit" in (out.stderr + out.stdout)[-2000:] and not RESULT_LINE.search(out.stdout):
            time.sleep(60)
            continue
        if out.returncode != 0 and not out.stdout:
            raise RuntimeError(f"paperclip {' '.join(args[:3])} failed: {out.stderr[-500:]}")
        return out.stdout
    raise RuntimeError(f"paperclip {' '.join(args[:3])} kept hitting the rate limit")


_last_search = [0.0]


def search(source: str, query: str, limit: int, since_year: int) -> str:
    """One search, cached. paperclip allows 25 search starts a minute, so uncached
    searches are spaced 2.6 s apart."""
    key = json.dumps(["search", source, query, limit, since_year])
    text = cache_get("paperclip", key)
    if text is not None:
        return text
    time.sleep(max(0.0, _last_search[0] + 2.6 - time.time()))
    _last_search[0] = time.time()
    text = run(["search", "-s", source, "-n", str(limit), "--min-year", str(since_year), query])
    cache_put("paperclip", key, text)
    return text


def parse_results(text: str) -> list[dict]:
    hits, cur = [], None
    for line in text.splitlines():
        m = RESULT_RE.match(line)
        if m and not line.strip().startswith(("Found", "[")):
            cur = {"title": m.group(2).strip(), "lines": []}
            hits.append(cur)
            continue
        if cur is not None:
            cur["lines"].append(line)
    out = []
    for h in hits:
        rec = {"title": h["title"]}
        for line in h["lines"]:
            m = ID_RE.match(line)
            if m and "id" not in rec:
                rec.update(id=m.group(1), source=m.group(2).strip(), date=m.group(3).strip(),
                           cited_by=int(m.group(4)) if m.group(4) else None)
            m = DOI_RE.search(line)
            if m and "doi" not in rec and "arxiv" not in m.group(1).lower():
                rec["doi"] = m.group(1)
            m = ARXIV_RE.search(line)
            if m:
                rec["arxiv"] = m.group(1)
        if "id" in rec:
            out.append(rec)
    return out


def fetch_meta(ids: list[str]) -> dict[str, dict]:
    """meta.json for each paperclip ID, cached, fetched 40 at a time.

    IDs from the abstracts-only corpus (bare numbers) have no meta.json; their
    abstracts are filled from OpenAlex by DOI during dedup.
    """
    metas, missing = {}, []
    ids = [pid for pid in ids if re.match(r"^(arx_|med_|bio_|PMC)", pid)]
    for pid in ids:
        cached = cache_get("paperclip", json.dumps(["meta", pid]))
        if cached is not None:
            metas[pid] = cached
        else:
            missing.append(pid)

    def batch(chunk: list[str]) -> dict[str, dict]:
        try:
            text = run(["cat"] + [f"/papers/{pid}/meta.json" for pid in chunk])
        except RuntimeError:
            text = "ERR:"
        if "ERR:" in text and len(chunk) > 1:
            # One missing file fails the whole cat; fall back to one at a time.
            found = {}
            for pid in chunk:
                found.update(batch([pid]))
            return found
        found, dec, pos = {}, json.JSONDecoder(), 0
        objs = []
        while True:
            start = text.find("{", pos)
            if start < 0:
                break
            try:
                obj, end = dec.raw_decode(text, start)
            except json.JSONDecodeError:
                pos = start + 1
                continue
            objs.append(obj)
            pos = end
        # meta.json carries the bare document ID; match it back to the paperclip ID.
        for pid in chunk:
            bare = re.sub(r"^(arx_|med_|bio_)", "", pid)
            for obj in objs:
                if str(obj.get("document_id")) in (pid, bare):
                    found[pid] = obj
                    break
        for pid in chunk:
            cache_put("paperclip", json.dumps(["meta", pid]), found.get(pid, {}))
        return found

    chunks = [missing[i:i + 40] for i in range(0, len(missing), 40)]
    with ThreadPoolExecutor(4) as pool:
        for found in pool.map(batch, chunks):
            metas.update(found)
    return metas


def main() -> None:
    cfg = load_queries()
    pc = cfg["paperclip"]
    since_year = int(cfg["since"][:4])
    jobs = [(q, s) for q in pc["queries"] for s in pc["sources"]]

    def do(job):
        q, source = job
        return q, source, parse_results(search(source, q["q"], pc["limit"], since_year))

    hits = []
    for q, source, results in map(do, jobs):
        log_query("paperclip", q["id"], source, q["q"], len(results))
        hits += [(q["id"], r) for r in results]
        print(f"{q['id']:<24} {source:<10} {len(results):>4}", file=sys.stderr)

    metas = fetch_meta(sorted({r["id"] for _, r in hits}))
    records = []
    for query_id, r in hits:
        meta = metas.get(r["id"], {})
        year = (meta.get("pub_date") or r.get("date") or "")[:4]
        records.append(new_record(
            "paperclip", query_id,
            title=meta.get("title") or r["title"],
            abstract=meta.get("abstract"),
            year=int(year) if year.isdigit() else None,
            doi=meta.get("doi") or r.get("doi"),
            arxiv_id=r.get("arxiv"),
            pmcid=r["id"] if r["id"].startswith("PMC") else None,
            paperclip_id=r["id"],
            url=f"https://arxiv.org/abs/{r['arxiv']}" if r.get("arxiv") else None,
            venue=r.get("source"),
            authors=meta.get("authors"),
            cited_by=r.get("cited_by"),
        ))
    WORK.mkdir(parents=True, exist_ok=True)
    with (WORK / "paperclip.jsonl").open("w") as f:
        for rec in records:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    with_abs = sum(1 for r in records if r["abstract"])
    print(f"wrote {len(records)} hits ({with_abs} with abstracts) to search/work/paperclip.jsonl",
          file=sys.stderr)


if __name__ == "__main__":
    main()
