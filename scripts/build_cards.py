"""Fill each entry's `card` block: how the test works, in plain words, from its sources.

The card answers what the pass-1 facets can't: what the model has to do, how the items were
made, one example item, how an output becomes a score, who or what judges it, on what scale,
whether the judging was checked against people, the headline result, and the authors' own
limitations. One structured request per entry to the OpenAI API, from the paper text in
paperclip, the Hugging Face dataset card, the GitHub README, or the record abstracts when
nothing else is reachable. Empty strings mean the sources don't say.

Usage:
    uv run scripts/build_cards.py fetch [--ids a,b] [--workers N]   # gather source text into search/raw/cards/
    uv run scripts/build_cards.py test --ids a,b                     # synchronous check, prints the card
    uv run scripts/build_cards.py submit [--ids a,b] [--model M]     # Batch API, half price
    uv run scripts/build_cards.py collect                            # download finished batches
    uv run scripts/build_cards.py run [--workers N]                  # standard API for entries still missing
    uv run scripts/build_cards.py apply                              # write card blocks into entries/*.yaml
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from pathlib import Path

import requests
import yaml
from openai import OpenAI

from common import RAW, ROOT, WORK, load_env, load_yaml, read_jsonl, write_jsonl
from validate import load_entries

CARDS = RAW / "cards"
RESULTS = WORK / "cards_results.jsonl"
BATCHES = WORK / "cards_batches.json"
MODEL = "gpt-6.1-sol"
PROMPT = "card-v1"
FAILED = ("failed", "expired", "cancelled")
PC = ["uv", "run", "-q", "--no-project", "--python", "3.12", "--with", "requests,pyyaml,click,rookiepy",
      "python", str(Path.home() / ".local/bin/paperclip")]

FIELDS = ["task", "items_built", "example", "scoring", "judge", "scale", "validation", "results", "limitations"]

SYSTEM = """You write the card for one entry in a catalog of benchmarks and evaluation frameworks for health chatbots and language models. You get the entry's current facts, the scoring terms already copied from it, and text from its sources. Fill the fields below from the provided text only.

Style: plain, specific English that a non-specialist can read. Use the numbers, names and roles the source gives (how many items, which model grades, how many physicians rated). Write full sentences with no label in front. No marketing words, no "not only ... but", no "serves as", no hedging, no em dashes. Don't repeat the catalog summary; add what it leaves out. When the text does not say, return an empty string. Never guess.

Fields:
- task: What any model under test has to do with each item, in one sentence. Describe the test, not the authors' own model, prompting or retrieval setup. Example: "Answer four-option multiple-choice questions from Indian medical entrance exams." or "Hold a text conversation with a simulated patient and name the most likely diagnosis."
- items_built: How the test items (questions, cases, conversations, prompts) were created: by whom, from what sources, how many, and how they were checked. One or two sentences. For a framework with no items, say what it is meant to be applied to and how it was developed.
- example: One example item quoted from the source, at most 350 characters, cut with "..." if longer. Empty if the text gives none.
- scoring: How a model's output turns into a score: what is compared with what, by whom or what, and how item scores are combined into the reported number. One or two sentences.
- judge: Who or what assigns the scores, as specifically as the text says: model names used as graders, the number and qualifications of human raters, or "exact match with the answer key". One short sentence.
- scale: The per-item scale and the final metric, as a short phrase. Example: "Each criterion is met or not; points are summed and normalized to 0 to 100 per conversation."
- validation: How the scoring was checked, such as agreement between a model grader and human experts, or between raters, with the numbers reported. Empty if not reported.
- results: The headline result at release: the best model and its score, and a human baseline if reported. At most two sentences. Empty if none.
- limitations: Limitations the authors state themselves, in one sentence. Empty if none stated.

If the only text is an abstract or a short dataset card, leave scoring, judge, scale, validation and results empty unless that text states them. Do not fill a field from what you know about the benchmark from elsewhere."""

SCHEMA = {
    "type": "object",
    "properties": {f: {"type": "string"} for f in FIELDS},
    "required": FIELDS,
    "additionalProperties": False,
}

KEYWORDS = re.compile(
    r"evaluat|scor|metric|rubric|grader|judge|rater|annotat|likert|scale|accuracy|\bf1\b|agreement|kappa|"
    r"example|collect|generat|written by|physician|clinician|expert|nurse|baseline|result|limitation|"
    r"criteri|dataset|question|conversation|vignette|construct|curat|review|valid|label|human|correct|"
    r"benchmark|framework|dimension|axis|axes|categor|prompt|respons|answer", re.I)
VALIDATION = re.compile(r"agreement|kappa|krippendorff|inter-?rater|inter-?annotator|annotator|validat|human expert|"
                        r"macro.?f1|correlat|consensus|gold label", re.I)
PAPER_CAP, HF_CAP, GH_CAP, ABS_CAP = 30000, 14000, 6000, 3000


# ---------- Sources ----------
def paperclip_text(pid: str) -> str:
    """The full text of one paperclip paper, or "" if it isn't there."""
    for attempt in range(2):
        try:
            res = subprocess.run([*PC, "cat", f"/papers/{pid}/content.lines", "--lines", "1-6000"],
                                 capture_output=True, text=True, timeout=120)
        except subprocess.TimeoutExpired:
            return ""
        out = res.stdout
        if res.returncode == 0 and out.count("\n") > 5:
            return out
        if "rate" in (res.stderr + out).lower() and attempt == 0:
            time.sleep(60)
            continue
        return ""
    return ""


def arxiv_html_text(arxiv_id: str) -> str:
    """Full text from arXiv's HTML rendering, for papers paperclip doesn't have."""
    try:
        r = requests.get(f"https://arxiv.org/html/{arxiv_id}", timeout=60,
                         headers={"User-Agent": "awesome-health-ai-evals/0.1 (catalog build)"})
    except requests.RequestException:
        return ""
    if not r.ok or "<html" not in r.text[:2000].lower():
        return ""
    html = re.sub(r"<(script|style|math)[^>]*>.*?</\1>", " ", r.text, flags=re.S | re.I)
    html = re.sub(r"<(p|div|h\d|li|tr|br)[^>]*>", "\n", html, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n", text)
    time.sleep(3)  # arXiv asks for a gentle pace
    return text if text.count("\n") > 20 and len(text) > 4000 else ""


def trim_paper(raw: str, cap: int = PAPER_CAP) -> str:
    """Keep the abstract and the lines most likely to describe the evaluation, in order."""
    lines = []
    for line in raw.splitlines():
        line = re.sub(r"^\s*>?\s*L\d+:\s?", "", line).strip()
        if not line or re.match(r"^\[(Figure|Table|Image) on page", line):
            continue
        if re.match(r"^(references|bibliography)\s*$", line, re.I):
            break
        lines.append(line)
    head = "\n".join(lines[:12])[:2500]
    body = lines[12:]
    if sum(len(x) for x in body) + len(head) <= cap:
        return head + "\n" + "\n".join(body)
    # Lines about how the scoring was checked against people are the ones most often lost
    # (appendices, table captions), so they count triple.
    scored = [((len(KEYWORDS.findall(x)) + 3 * len(VALIDATION.findall(x))) / max(1, len(x) / 80), i)
              for i, x in enumerate(body)]
    keep, size = set(), len(head)
    for _, i in sorted(scored, reverse=True):
        if size >= cap:
            break
        keep.add(i)
        size += len(body[i]) + 1
    return head + "\n" + "\n".join(body[i] for i in sorted(keep))


def hf_readme(ds: str) -> str:
    try:
        r = requests.get(f"https://huggingface.co/datasets/{ds}/raw/main/README.md", timeout=60)
    except requests.RequestException:
        return ""
    if not r.ok:
        return ""
    text = re.sub(r"^---\n.*?\n---\n", "", r.text, count=1, flags=re.S)
    return text.strip()[:HF_CAP]


def gh_readme(url: str) -> str:
    m = re.match(r"https?://github\.com/([^/]+/[^/#?]+)", url or "")
    if not m:
        return ""
    res = subprocess.run(["gh", "api", f"repos/{m.group(1).removesuffix('.git')}/readme",
                          "-H", "Accept: application/vnd.github.raw"], capture_output=True, text=True)
    return res.stdout.strip()[:GH_CAP] if res.returncode == 0 else ""


def paper_ids(e: dict, records: dict) -> list[tuple[str, str]]:
    """Candidate (paperclip id, url) pairs for an entry's paper, best first."""
    out, seen = [], set()
    L = e.get("links") or {}
    recs = [records[r] for r in e["provenance"].get("records", []) if r in records]

    def add(pid, url):
        if pid and pid not in seen:
            seen.add(pid)
            out.append((pid, url))
    for r in recs:
        add(r.get("paperclip_id"), r.get("url") or "")
    if L.get("arxiv"):
        add(f"arx_{L['arxiv']}", f"https://arxiv.org/abs/{L['arxiv']}")
    if L.get("pmcid"):
        add(L["pmcid"], f"https://pmc.ncbi.nlm.nih.gov/articles/{L['pmcid']}/")
    for r in recs:
        if r.get("arxiv_id"):
            add(f"arx_{r['arxiv_id']}", f"https://arxiv.org/abs/{r['arxiv_id']}")
        if r.get("pmcid"):
            add(r["pmcid"], f"https://pmc.ncbi.nlm.nih.gov/articles/{r['pmcid']}/")
    return out


def fetch_one(eid: str, e: dict, records: dict) -> dict:
    L = e.get("links") or {}
    bundle = {"entry": eid, "fetched": date.today().isoformat(), "paper": "", "paper_url": "",
              "hf": [], "gh": "", "gh_url": "", "abstracts": []}
    for pid, url in paper_ids(e, records):
        text = paperclip_text(pid)
        if text:
            bundle["paper"], bundle["paper_url"] = trim_paper(text), url or url_of(pid) or pid
            break
    if not bundle["paper"]:
        for pid, _url in paper_ids(e, records):
            if pid.startswith("arx_"):
                text = arxiv_html_text(pid[4:])
                if text:
                    bundle["paper"], bundle["paper_url"] = trim_paper(text), f"https://arxiv.org/abs/{pid[4:]}"
                    break
    for ds in (L.get("huggingface") or [])[:2]:
        text = hf_readme(ds)
        if text:
            bundle["hf"].append({"id": ds, "text": text})
    if L.get("code"):
        bundle["gh"], bundle["gh_url"] = gh_readme(L["code"]), L["code"]
    if not bundle["paper"]:
        for r in e["provenance"].get("records", []):
            rec = records.get(r)
            if rec and rec.get("abstract"):
                bundle["abstracts"].append(f"{rec.get('title') or ''}\n{rec['abstract'][:ABS_CAP]}")
                if rec.get("url") and not bundle.get("abstract_url"):
                    bundle["abstract_url"] = rec["url"]
        bundle["abstracts"] = bundle["abstracts"][:3]
        if not bundle.get("abstract_url"):
            bundle["abstract_url"] = (L.get("paper") or (L.get("doi") and f"https://doi.org/{L['doi']}") or "")
    return bundle


def cmd_fetch(args) -> None:
    entries = load_entries()
    records = {r["id"]: r for r in read_jsonl(WORK / "records.jsonl")}
    CARDS.mkdir(parents=True, exist_ok=True)
    ids = args.ids.split(",") if args.ids else sorted(entries)
    todo = [i for i in ids if args.force or not (CARDS / f"{i}.json").exists()]
    print(f"{len(todo)} entries to fetch", file=sys.stderr)
    with ThreadPoolExecutor(args.workers) as pool:
        futures = {pool.submit(fetch_one, i, entries[i], records): i for i in todo}
        for n, fut in enumerate(as_completed(futures), 1):
            eid = futures[fut]
            try:
                bundle = fut.result()
            except Exception as err:
                print(f"  {eid}: {type(err).__name__}: {err}", file=sys.stderr)
                continue
            (CARDS / f"{eid}.json").write_text(json.dumps(bundle, ensure_ascii=False))
            if n % 25 == 0 or n == len(futures):
                print(f"  {n}/{len(futures)}", file=sys.stderr)
    have = [json.loads(p.read_text()) for p in CARDS.glob("*.json")]
    print(f"paper text: {sum(bool(b['paper']) for b in have)}, card: {sum(bool(b['hf']) for b in have)}, "
          f"readme: {sum(bool(b['gh']) for b in have)}, abstracts only: "
          f"{sum(1 for b in have if not b['paper'] and not b['hf'] and not b['gh'] and b['abstracts'])}, "
          f"nothing: {sum(1 for b in have if not b['paper'] and not b['hf'] and not b['gh'] and not b['abstracts'])}",
          file=sys.stderr)


# ---------- Requests ----------
def user_text(eid: str, e: dict, bundle: dict, terms: list[str]) -> str:
    kind = "benchmark" if e["kind"] == "benchmark" else "evaluation framework"
    parts = [f"Entry: {e['name']} ({e['year']}, {kind})",
             f"Catalog summary: {e['summary']}",
             f"Scoring terms already copied from the source: {', '.join(terms[:40]) or 'none'}",
             f"Catalog notes: {(e['provenance'].get('notes') or '')[:800]}"]
    if bundle["paper"]:
        parts.append(f"\n=== Paper text, excerpts ({bundle['paper_url']}) ===\n{bundle['paper']}")
    for h in bundle["hf"]:
        parts.append(f"\n=== Dataset card (huggingface.co/datasets/{h['id']}) ===\n{h['text']}")
    if bundle["gh"]:
        parts.append(f"\n=== Repository README ({bundle['gh_url']}) ===\n{bundle['gh']}")
    if not bundle["paper"] and bundle["abstracts"]:
        parts.append("\n=== Abstracts (the full text could not be reached) ===\n" + "\n\n".join(bundle["abstracts"]))
    return "\n".join(parts)


def request_body(eid: str, e: dict, bundle: dict, terms: list[str], model: str) -> dict:
    return {
        "model": model,
        "messages": [{"role": "system", "content": SYSTEM},
                     {"role": "user", "content": user_text(eid, e, bundle, terms)}],
        "response_format": {"type": "json_schema",
                            "json_schema": {"name": "card", "strict": True, "schema": SCHEMA}},
        "reasoning_effort": "low",
        "max_completion_tokens": 3000,
    }


def term_names() -> dict[str, list[str]]:
    out = {}
    for path in (ROOT / "terms").glob("*.yaml"):
        doc = load_yaml(path.read_text()) or {}
        out[path.stem] = [t["term"] for t in doc.get("terms", [])]
    return out


def url_of(ref: str) -> str:
    """A bare paperclip id becomes a link; anything else is returned as it is."""
    if ref.startswith("arx_"):
        return f"https://arxiv.org/abs/{ref[4:]}"
    if re.match(r"^PMC\d+$", ref):
        return f"https://pmc.ncbi.nlm.nih.gov/articles/{ref}/"
    return ref if ref.startswith("http") else ""


def sources_of(bundle: dict) -> list[str]:
    urls = []
    if bundle["paper"] and url_of(bundle["paper_url"]):
        urls.append(url_of(bundle["paper_url"]))
    urls += [f"https://huggingface.co/datasets/{h['id']}" for h in bundle["hf"]]
    if bundle["gh"]:
        urls.append(bundle["gh_url"])
    if not bundle["paper"] and bundle.get("abstracts") and bundle.get("abstract_url", "").startswith("http"):
        urls.append(bundle["abstract_url"])
    return list(dict.fromkeys(urls))


EMPTY = re.compile(r"^(n/?a|none|not (stated|reported|specified|described|given|available|applicable)"
                   r"( in the (source|text|paper))?|the (source|text|paper) does not (say|state|report|specify)"
                   r"[^.]*|unknown|empty|)\.?$", re.I)


def clean(text: str) -> str:
    """Straight quotes, no dashes, one space; a placeholder for "not stated" becomes empty."""
    text = text.replace("—", ",").replace("–", "-").replace("’", "'").replace("‘", "'")
    text = text.replace("“", '"').replace("”", '"')
    text = re.sub(r"\s*,\s*,", ",", text)
    text = re.sub(r"\s+", " ", text).strip()
    return "" if EMPTY.match(text) else text


def parse_card(content: str | None) -> dict | None:
    try:
        out = json.loads(content or "")
    except json.JSONDecodeError:
        return None
    return {f: clean(str(out.get(f, ""))) for f in FIELDS}


def client() -> OpenAI:
    load_env()
    return OpenAI(api_key=os.environ["OPENAI_API_KEY"])


def done_ids() -> set[str]:
    return {r["id"] for r in read_jsonl(RESULTS) if r.get("prompt") == PROMPT and r.get("card")}


def pending_ids(batches: list[dict]) -> set[str]:
    ids = set()
    for b in batches:
        if not b["collected"] and b.get("status") not in FAILED:
            ids |= {row["custom_id"] for row in read_jsonl(WORK / b["input"])}
    return ids


def append_results(rows: list[dict]) -> None:
    with RESULTS.open("a") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def requests_for(ids: list[str], model: str) -> list[dict]:
    entries = load_entries()
    terms = term_names()
    rows = []
    for eid in ids:
        path = CARDS / f"{eid}.json"
        if not path.exists():
            print(f"  {eid}: no sources fetched, skipping", file=sys.stderr)
            continue
        bundle = json.loads(path.read_text())
        rows.append({"custom_id": eid, "method": "POST", "url": "/v1/chat/completions",
                     "body": request_body(eid, entries[eid], bundle, terms.get(eid, []), model)})
    return rows


def cmd_test(args) -> None:
    c = client()
    for row in requests_for(args.ids.split(","), args.model):
        resp = c.chat.completions.create(**row["body"])
        card = parse_card(resp.choices[0].message.content) or {}
        u = resp.usage
        print(f"\n## {row['custom_id']}  (tokens in={u.prompt_tokens} out={u.completion_tokens})")
        for f in FIELDS:
            print(f"{f}: {card.get(f, '')}")


def cmd_submit(args) -> None:
    entries = load_entries()
    batches = json.loads(BATCHES.read_text()) if BATCHES.exists() else []
    ids = args.ids.split(",") if args.ids else sorted(entries)
    skip = done_ids() | pending_ids(batches)
    todo = [i for i in ids if i not in skip]
    if not todo:
        print("nothing to submit", file=sys.stderr)
        return
    rows = requests_for(todo, args.model)
    c = client()
    path = WORK / f"cards_input_{int(time.time())}.jsonl"
    write_jsonl(path, rows)
    with path.open("rb") as f:
        file = c.files.create(file=f, purpose="batch")
    batch = c.batches.create(input_file_id=file.id, endpoint="/v1/chat/completions", completion_window="24h")
    batches.append({"batch_id": batch.id, "model": args.model, "prompt": PROMPT, "n": len(rows),
                    "input": path.name, "collected": False})
    BATCHES.write_text(json.dumps(batches, indent=2))
    chars = sum(len(r["body"]["messages"][1]["content"]) for r in rows)
    print(f"submitted {batch.id}: {len(rows)} requests, about {chars // 4:,} input tokens", file=sys.stderr)


def collect_rows(text: str, model: str) -> tuple[list[dict], list[int]]:
    rows, usage = [], [0, 0]
    for line in text.splitlines():
        item = json.loads(line)
        resp = item["response"]
        if resp["status_code"] != 200:
            continue
        body = resp["body"]
        usage[0] += body["usage"]["prompt_tokens"]
        usage[1] += body["usage"]["completion_tokens"]
        card = parse_card(body["choices"][0]["message"]["content"])
        if card:
            rows.append({"id": item["custom_id"], "model": model, "prompt": PROMPT, "card": card})
    return rows, usage


def cmd_collect(args) -> None:
    c = client()
    batches = json.loads(BATCHES.read_text())
    pending = 0
    for b in batches:
        if b["collected"] or b.get("status") in FAILED:
            continue
        batch = c.batches.retrieve(b["batch_id"])
        counts = batch.request_counts
        print(f"{b['batch_id']}: {batch.status} ({counts.completed}/{counts.total} done, {counts.failed} failed)",
              file=sys.stderr)
        if batch.status not in ("completed", *FAILED):
            pending += 1
            continue
        text = c.files.content(batch.output_file_id).text if batch.output_file_id else ""
        if batch.status != "completed":
            b["status"] = batch.status
            if not text:
                continue
        rows, usage = collect_rows(text, b["model"])
        append_results(rows)
        b["collected"] = True
        b["tokens"] = {"input": usage[0], "output": usage[1]}
        print(f"  collected {len(rows)} cards; tokens in={usage[0]:,} out={usage[1]:,}", file=sys.stderr)
    BATCHES.write_text(json.dumps(batches, indent=2))
    if pending:
        print(f"{pending} batch(es) still running", file=sys.stderr)
        sys.exit(2)


def cmd_run(args) -> None:
    """Standard API for entries with no card yet (twice the batch price, minutes instead of hours)."""
    entries = load_entries()
    batches = json.loads(BATCHES.read_text()) if BATCHES.exists() else []
    if args.cancel:
        c0 = client()
        for b in batches:
            if not b["collected"] and b.get("status") not in FAILED:
                try:
                    c0.batches.cancel(b["batch_id"])
                except Exception as err:  # already finished or cancelled
                    print(f"  {b['batch_id']}: {type(err).__name__}", file=sys.stderr)
                b["status"] = "cancelled"
        BATCHES.write_text(json.dumps(batches, indent=2))
    ids = args.ids.split(",") if args.ids else sorted(entries)
    skip = set() if args.force else done_ids() | (set() if args.cancel else pending_ids(batches))
    todo = requests_for([i for i in ids if i not in skip], args.model)
    print(f"{len(todo)} requests", file=sys.stderr)
    c = client()

    def call(row):
        return row["custom_id"], c.chat.completions.create(**row["body"])

    rows, usage = [], [0, 0]
    with ThreadPoolExecutor(args.workers) as pool:
        futures = [pool.submit(call, row) for row in todo]
        for i, fut in enumerate(as_completed(futures), 1):
            try:
                eid, resp = fut.result()
            except Exception as err:
                print(f"  request failed: {type(err).__name__}", file=sys.stderr)
                continue
            usage[0] += resp.usage.prompt_tokens
            usage[1] += resp.usage.completion_tokens
            card = parse_card(resp.choices[0].message.content)
            if card:
                rows.append({"id": eid, "model": args.model, "prompt": PROMPT, "card": card})
            if len(rows) >= 50 or i == len(futures):
                append_results(rows)
                rows = []
                print(f"  {i}/{len(futures)}", file=sys.stderr)
    append_results(rows)
    print(f"tokens in={usage[0]:,} out={usage[1]:,}", file=sys.stderr)


# ---------- Apply ----------
def cmd_apply(args) -> None:
    latest = {}
    for row in read_jsonl(RESULTS):
        if row.get("prompt") == PROMPT and row.get("card"):
            latest[row["id"]] = row["card"]
    written = 0
    for eid, card in sorted(latest.items()):
        path = ROOT / "entries" / f"{eid}.yaml"
        if not path.exists():
            continue
        bundle_path = CARDS / f"{eid}.json"
        bundle = json.loads(bundle_path.read_text()) if bundle_path.exists() else {"paper": "", "hf": [], "gh": ""}
        block = {"card": {**{f: card[f] for f in FIELDS}, "sources": sources_of(bundle),
                          "extracted": bundle.get("fetched") or date.today().isoformat()}}
        text = path.read_text()
        dump = yaml.safe_dump(block, sort_keys=False, allow_unicode=True, width=110)
        if re.search(r"^card:\n(?:  .*\n)*", text, flags=re.M):
            text = re.sub(r"^card:\n(?:  .*\n)*", lambda m: dump, text, flags=re.M)
        elif "\nsignals:" in text:
            text = text.replace("\nsignals:", "\n" + dump + "signals:", 1)
        else:
            text = text.replace("\nprovenance:", "\n" + dump + "provenance:", 1)
        path.write_text(text)
        written += 1
    print(f"wrote card blocks into {written} entries", file=sys.stderr)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fetch"); f.add_argument("--ids"); f.add_argument("--workers", type=int, default=3)
    f.add_argument("--force", action="store_true")
    t = sub.add_parser("test"); t.add_argument("--ids", required=True); t.add_argument("--model", default=MODEL)
    s = sub.add_parser("submit"); s.add_argument("--ids"); s.add_argument("--model", default=MODEL)
    sub.add_parser("collect")
    r = sub.add_parser("run"); r.add_argument("--ids"); r.add_argument("--model", default=MODEL)
    r.add_argument("--workers", type=int, default=6); r.add_argument("--cancel", action="store_true")
    r.add_argument("--force", action="store_true", help="rerun the given ids even if they have a card")
    sub.add_parser("apply")
    args = ap.parse_args()
    {"fetch": cmd_fetch, "test": cmd_test, "submit": cmd_submit, "collect": cmd_collect,
     "run": cmd_run, "apply": cmd_apply}[args.cmd](args)


if __name__ == "__main__":
    main()
