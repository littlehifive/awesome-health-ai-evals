"""Fill each entry's `card` block: how the test works, in plain words, from its sources.

The card answers what the pass-1 facets can't: what the model has to do, how the items were
made, one example item, how an output becomes a score, who or what judges it, on what scale,
whether the judging was checked against people, the headline result, and the authors' own
limitations. One structured request per entry to the OpenAI API, from the paper text in
paperclip, the Hugging Face dataset card, the GitHub README, or the record abstracts when
nothing else is reachable. Empty strings mean the sources don't say.

Two passes share the commands. `card` (the default) writes the nine fields above. `scoring`
adds two more to an existing card, what the scores mean and how the raters worked, from the
same cached sources trimmed to the lines about rating. By default it covers every entry that
isn't scored by multiple choice alone.

Usage:
    uv run scripts/build_cards.py fetch [--ids a,b] [--workers N]      # gather source text into search/raw/cards/
    uv run scripts/build_cards.py test --ids a,b [--pass scoring]       # synchronous check, prints the fields
    uv run scripts/build_cards.py submit [--ids a,b] [--pass scoring]   # Batch API, half price
    uv run scripts/build_cards.py collect                               # download finished batches of either pass
    uv run scripts/build_cards.py run [--workers N] [--pass scoring]    # standard API for entries still missing
    uv run scripts/build_cards.py apply [--pass scoring]                # write the fields into entries/*.yaml
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

SCORING_FIELDS = ["score_meaning", "annotation_process"]

SCORING_SYSTEM = """You add two fields to the card of one entry in a catalog of benchmarks and evaluation frameworks for health chatbots and language models. You get the entry's current facts, what its card already says about scoring, the scoring terms copied from it, and text from its sources. Fill the fields below from the provided text only.

Style: plain, specific English that a non-specialist can read. Use the numbers, names and roles the source gives (how many raters, which model grades, how many rounds). Write full sentences with no label in front. No marketing words, no "not only ... but", no "serves as", no hedging, no em dashes. Don't repeat what the card already says; add what it leaves out. When the text does not say, return an empty string. Never guess.

Fields:
- score_meaning: What the scale stands for and how the reported number is read: what each level, point or label means (the anchors of a Likert scale, the pass mark, what counts as a failure), what a higher value means, and what a score of a given size tells a reader about the model. One or two sentences.
- annotation_process: How the scoring was carried out in practice: how many raters or grader runs scored each item, how raters were recruited, trained or calibrated, the stages (for example independent rating, then discussion or adjudication), and how disagreements were resolved. Two or three sentences. If outputs are compared with an answer key or a reference text automatically, say so in one sentence.

If the only text is an abstract or a short dataset card, leave both fields empty unless that text states them. Do not fill a field from what you know about the benchmark from elsewhere."""

PASSES = {
    "card": {"prompt": "card-v1", "fields": FIELDS, "system": SYSTEM},
    "scoring": {"prompt": "scoring-v1", "fields": SCORING_FIELDS, "system": SCORING_SYSTEM},
}
PROMPT = PASSES["card"]["prompt"]


def schema_for(fields: list[str]) -> dict:
    return {"type": "object", "properties": {f: {"type": "string"} for f in fields},
            "required": list(fields), "additionalProperties": False}


def fields_of(prompt: str) -> list[str]:
    return next(p["fields"] for p in PASSES.values() if p["prompt"] == prompt)


KEYWORDS = re.compile(
    r"evaluat|scor|metric|rubric|grader|judge|rater|annotat|likert|scale|accuracy|\bf1\b|agreement|kappa|"
    r"example|collect|generat|written by|physician|clinician|expert|nurse|baseline|result|limitation|"
    r"criteri|dataset|question|conversation|vignette|construct|curat|review|valid|label|human|correct|"
    r"benchmark|framework|dimension|axis|axes|categor|prompt|respons|answer", re.I)
VALIDATION = re.compile(r"agreement|kappa|krippendorff|inter-?rater|inter-?annotator|annotator|validat|human expert|"
                        r"macro.?f1|correlat|consensus|gold label", re.I)
# The scoring pass keeps the lines about raters and scales, and caps the text lower.
SCORING_KEYWORDS = re.compile(
    r"rater|annotat|judge|grader|grading|likert|scale|anchor|rubric|criteri|scor|point|agreement|kappa|"
    r"krippendorff|adjudicat|consensus|calibrat|train|disagree|threshold|pass|label|evaluat|physician|"
    r"clinician|expert|nurse|human|independent|blind|round|review|correct|accuracy|metric|interpret", re.I)
SCORING_BOOST = re.compile(r"agreement|kappa|krippendorff|inter-?rater|inter-?annotator|adjudicat|consensus|"
                           r"calibrat|disagree|independent(ly)?|blind|likert|anchor|threshold|pass(ing)? (mark|score)", re.I)
PAPER_CAP, HF_CAP, GH_CAP, ABS_CAP = 30000, 14000, 6000, 3000
SCORING_PAPER_CAP, SCORING_HF_CAP, SCORING_GH_CAP = 20000, 10000, 4000


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


def trim_paper(raw: str, cap: int = PAPER_CAP, keywords: re.Pattern = KEYWORDS, boost: re.Pattern = VALIDATION) -> str:
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
    scored = [((len(keywords.findall(x)) + 3 * len(boost.findall(x))) / max(1, len(x) / 80), i)
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
def user_text(eid: str, e: dict, bundle: dict, terms: list[str], pass_: str = "card") -> str:
    kind = "benchmark" if e["kind"] == "benchmark" else "evaluation framework"
    parts = [f"Entry: {e['name']} ({e['year']}, {kind})",
             f"Catalog summary: {e['summary']}",
             f"Scoring terms already copied from the source: {', '.join(terms[:40]) or 'none'}",
             f"Catalog notes: {(e['provenance'].get('notes') or '')[:800]}"]
    paper, hf_cap, gh_cap = bundle["paper"], None, None
    if pass_ == "scoring":
        c = e.get("card") or {}
        parts.append("What the card already says, which the new fields must not repeat:")
        parts += [f"- {f}: {c.get(f) or '(empty)'}" for f in ("scoring", "judge", "scale", "validation")]
        paper = trim_paper(paper, SCORING_PAPER_CAP, SCORING_KEYWORDS, SCORING_BOOST) if paper else ""
        hf_cap, gh_cap = SCORING_HF_CAP, SCORING_GH_CAP
    if paper:
        parts.append(f"\n=== Paper text, excerpts ({bundle['paper_url']}) ===\n{paper}")
    for h in bundle["hf"]:
        parts.append(f"\n=== Dataset card (huggingface.co/datasets/{h['id']}) ===\n{h['text'][:hf_cap]}")
    if bundle["gh"]:
        parts.append(f"\n=== Repository README ({bundle['gh_url']}) ===\n{bundle['gh'][:gh_cap]}")
    if not bundle["paper"] and bundle["abstracts"]:
        parts.append("\n=== Abstracts (the full text could not be reached) ===\n" + "\n\n".join(bundle["abstracts"]))
    return "\n".join(parts)


def request_body(eid: str, e: dict, bundle: dict, terms: list[str], model: str, pass_: str = "card") -> dict:
    p = PASSES[pass_]
    return {
        "model": model,
        "messages": [{"role": "system", "content": p["system"]},
                     {"role": "user", "content": user_text(eid, e, bundle, terms, pass_)}],
        "response_format": {"type": "json_schema",
                            "json_schema": {"name": pass_, "strict": True, "schema": schema_for(p["fields"])}},
        "reasoning_effort": "low",
        "max_completion_tokens": 3000 if pass_ == "card" else 1200,
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


def parse_card(content: str | None, fields: list[str] = FIELDS) -> dict | None:
    try:
        out = json.loads(content or "")
    except json.JSONDecodeError:
        return None
    return {f: clean(str(out.get(f, ""))) for f in fields}


def client() -> OpenAI:
    load_env()
    return OpenAI(api_key=os.environ["OPENAI_API_KEY"])


def done_ids(prompt: str = PROMPT, entries: dict[str, dict] | None = None) -> set[str]:
    """Entries that already have this pass: a result in the work file (gitignored), or the pass's
    fields in their card in entries/*.yaml (committed), so a fresh checkout doesn't redo them.
    --force (run, submit) or --ids with --force redoes entries on purpose."""
    done = {r["id"] for r in read_jsonl(RESULTS) if r.get("prompt") == prompt and r.get("card")}
    fields = fields_of(prompt)
    for eid, e in (entries if entries is not None else load_entries()).items():
        if all(f in (e.get("card") or {}) for f in fields):
            done.add(eid)
    return done


def pending_ids(batches: list[dict], prompt: str = PROMPT) -> set[str]:
    ids = set()
    for b in batches:
        if not b["collected"] and b.get("status") not in FAILED and b.get("prompt", PROMPT) == prompt:
            ids |= {row["custom_id"] for row in read_jsonl(WORK / b["input"])}
    return ids


def default_ids(pass_: str, entries: dict[str, dict]) -> list[str]:
    """Every entry for the card pass; for the scoring pass, every entry not scored by multiple choice alone."""
    ids = sorted(entries)
    if pass_ == "scoring":
        ids = [i for i in ids if entries[i]["facets"]["eval_methods"] != ["mcq_exact_match"]]
    return ids


def append_results(rows: list[dict]) -> None:
    with RESULTS.open("a") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def requests_for(ids: list[str], model: str, pass_: str = "card") -> list[dict]:
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
                     "body": request_body(eid, entries[eid], bundle, terms.get(eid, []), model, pass_)})
    return rows


def cmd_test(args) -> None:
    p = PASSES[args.pass_]
    c = client()
    for row in requests_for(args.ids.split(","), args.model, args.pass_):
        resp = c.chat.completions.create(**row["body"])
        card = parse_card(resp.choices[0].message.content, p["fields"]) or {}
        u = resp.usage
        print(f"\n## {row['custom_id']}  (tokens in={u.prompt_tokens} out={u.completion_tokens})")
        for f in p["fields"]:
            print(f"{f}: {card.get(f, '')}")


def cmd_submit(args) -> None:
    p = PASSES[args.pass_]
    entries = load_entries()
    batches = json.loads(BATCHES.read_text()) if BATCHES.exists() else []
    ids = args.ids.split(",") if args.ids else default_ids(args.pass_, entries)
    skip = (set() if args.force else done_ids(p["prompt"], entries)) | pending_ids(batches, p["prompt"])
    todo = [i for i in ids if i not in skip]
    if not todo:
        print("nothing to submit", file=sys.stderr)
        return
    rows = requests_for(todo, args.model, args.pass_)
    c = client()
    path = WORK / f"cards_input_{int(time.time())}.jsonl"
    write_jsonl(path, rows)
    with path.open("rb") as f:
        file = c.files.create(file=f, purpose="batch")
    batch = c.batches.create(input_file_id=file.id, endpoint="/v1/chat/completions", completion_window="24h")
    batches.append({"batch_id": batch.id, "model": args.model, "prompt": p["prompt"], "n": len(rows),
                    "input": path.name, "collected": False})
    BATCHES.write_text(json.dumps(batches, indent=2))
    chars = sum(len(r["body"]["messages"][1]["content"]) for r in rows)
    print(f"submitted {batch.id} ({args.pass_}): {len(rows)} requests, about {chars // 4:,} input tokens", file=sys.stderr)


def collect_rows(text: str, model: str, prompt: str = PROMPT) -> tuple[list[dict], list[int]]:
    fields = fields_of(prompt)
    rows, usage = [], [0, 0]
    for line in text.splitlines():
        item = json.loads(line)
        resp = item["response"]
        if resp["status_code"] != 200:
            continue
        body = resp["body"]
        usage[0] += body["usage"]["prompt_tokens"]
        usage[1] += body["usage"]["completion_tokens"]
        card = parse_card(body["choices"][0]["message"]["content"], fields)
        if card:
            rows.append({"id": item["custom_id"], "model": model, "prompt": prompt, "card": card})
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
        rows, usage = collect_rows(text, b["model"], b.get("prompt", PROMPT))
        append_results(rows)
        b["collected"] = True
        b["tokens"] = {"input": usage[0], "output": usage[1]}
        print(f"  collected {len(rows)} results; tokens in={usage[0]:,} out={usage[1]:,}", file=sys.stderr)
    BATCHES.write_text(json.dumps(batches, indent=2))
    if pending:
        print(f"{pending} batch(es) still running", file=sys.stderr)
        sys.exit(2)


def cmd_run(args) -> None:
    """Standard API for entries with no result yet (twice the batch price, minutes instead of hours)."""
    p = PASSES[args.pass_]
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
    ids = args.ids.split(",") if args.ids else default_ids(args.pass_, entries)
    skip = set() if args.force else done_ids(p["prompt"], entries) | (set() if args.cancel else pending_ids(batches, p["prompt"]))
    todo = requests_for([i for i in ids if i not in skip], args.model, args.pass_)
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
            card = parse_card(resp.choices[0].message.content, p["fields"])
            if card:
                rows.append({"id": eid, "model": args.model, "prompt": p["prompt"], "card": card})
            if len(rows) >= 50 or i == len(futures):
                append_results(rows)
                rows = []
                print(f"  {i}/{len(futures)}", file=sys.stderr)
    append_results(rows)
    print(f"tokens in={usage[0]:,} out={usage[1]:,}", file=sys.stderr)


# ---------- Apply ----------
def merge_fields(existing: dict, new: dict) -> dict:
    """The new fields go right after `validation`, so every card lists its fields in the same order."""
    out = {}
    for k, v in existing.items():
        if k in new:
            continue
        out[k] = v
        if k == "validation":
            out.update(new)
    for k, v in new.items():
        out.setdefault(k, v)
    return out


def cmd_apply(args) -> None:
    p = PASSES[args.pass_]
    latest = {}
    for row in read_jsonl(RESULTS):
        if row.get("prompt") == p["prompt"] and row.get("card"):
            latest[row["id"]] = row["card"]
    written = 0
    for eid, card in sorted(latest.items()):
        path = ROOT / "entries" / f"{eid}.yaml"
        if not path.exists():
            continue
        text = path.read_text()
        m = re.search(r"^card:\n(?:  .*\n)*", text, flags=re.M)
        if args.pass_ == "scoring":
            if not m:
                print(f"  {eid}: no card block to extend, skipping", file=sys.stderr)
                continue
            block = {"card": merge_fields(load_yaml(m.group(0))["card"], {f: card[f] for f in p["fields"]})}
        else:
            bundle_path = CARDS / f"{eid}.json"
            bundle = json.loads(bundle_path.read_text()) if bundle_path.exists() else {"paper": "", "hf": [], "gh": ""}
            block = {"card": {**{f: card[f] for f in FIELDS}, "sources": sources_of(bundle),
                              "extracted": bundle.get("fetched") or date.today().isoformat()}}
        dump = yaml.safe_dump(block, sort_keys=False, allow_unicode=True, width=110)
        if m:
            text = text[:m.start()] + dump + text[m.end():]
        elif "\nsignals:" in text:
            text = text.replace("\nsignals:", "\n" + dump + "signals:", 1)
        else:
            text = text.replace("\nprovenance:", "\n" + dump + "provenance:", 1)
        path.write_text(text)
        written += 1
    print(f"wrote {args.pass_} fields into {written} entries", file=sys.stderr)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    def with_pass(sp):
        sp.add_argument("--pass", dest="pass_", choices=list(PASSES), default="card",
                        help="which fields to write: card (default) or scoring")
        return sp
    f = sub.add_parser("fetch"); f.add_argument("--ids"); f.add_argument("--workers", type=int, default=3)
    f.add_argument("--force", action="store_true")
    t = with_pass(sub.add_parser("test")); t.add_argument("--ids", required=True); t.add_argument("--model", default=MODEL)
    s = with_pass(sub.add_parser("submit")); s.add_argument("--ids"); s.add_argument("--model", default=MODEL)
    s.add_argument("--force", action="store_true", help="resubmit the given ids even if they have a result")
    sub.add_parser("collect")
    r = with_pass(sub.add_parser("run")); r.add_argument("--ids"); r.add_argument("--model", default=MODEL)
    r.add_argument("--workers", type=int, default=6); r.add_argument("--cancel", action="store_true")
    r.add_argument("--force", action="store_true", help="rerun the given ids even if they have a result")
    with_pass(sub.add_parser("apply"))
    args = ap.parse_args()
    {"fetch": cmd_fetch, "test": cmd_test, "submit": cmd_submit, "collect": cmd_collect,
     "run": cmd_run, "apply": cmd_apply}[args.cmd](args)


if __name__ == "__main__":
    main()
