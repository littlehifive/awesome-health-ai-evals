"""Title/abstract screening through the OpenAI Batch API.

Two stages. `title_abstract` labels every record with a small model and keeps
anything uncertain. `strict` re-screens the records it kept (benchmark,
eval_framework, borderline) with a larger model and a stricter prompt, so the
full-text step only reads plausible entries. A record's decision is its strict
label when it has one, else its title_abstract label.

Each record gets one label with a reason. Results are appended to
search/work/screen_results.jsonl and summarized in search/screening.csv.

Usage:
    uv run scripts/screen.py test --ids r_abc,r_def [--stage S] [--model M]  # synchronous check
    uv run scripts/screen.py submit [--stage S] [--model M] [--changed] [--rescue R ...]  # batch unscreened records
    uv run scripts/screen.py collect                                          # download finished batches
    uv run scripts/screen.py run --batch ID                                   # run a stuck batch synchronously
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time

import openai
from openai import OpenAI

from common import SEARCH, WORK, load_env, read_jsonl, write_jsonl

RESULTS = WORK / "screen_results.jsonl"
BATCHES = WORK / "screen_batches.json"
FAILED = ("failed", "expired", "cancelled")

LABELS = ["benchmark", "eval_framework", "related_guidance", "survey", "borderline", "exclude"]
EXCLUDE_REASONS = ["none", "out_of_scope_task", "not_health", "not_generative_ai",
                   "study_no_release", "training_data", "model_or_method", "other"]

SYSTEM = """You screen search records for awesome-health-ai-evals, a catalog of health benchmarks and evaluation frameworks for generative-AI chatbots and language models.

Scope: a model answers health questions or converses about health in natural language, in text or voice, for patients, the public, community health workers, nurses, midwives, pharmacists, or clinicians. In scope: exam-style multiple-choice question sets, open-ended and multi-turn evaluations, simulated-patient dialogues, safety, hallucination, bias, and mental health. Out of scope: radiology or pathology image question answering and other medical-imaging tasks, EHR documentation and coding, biomedical NLP such as named-entity recognition or relation extraction, and drug or molecule discovery.

Labels:
- benchmark: the record introduces or releases test items plus a way to score them, meant for reuse, for an in-scope task. Counts even when the paper also proposes a model. A Hugging Face dataset or GitHub repo whose purpose includes evaluating models on an in-scope task counts.
- eval_framework: the record defines a framework, rubric, or set of criteria for judging an AI model's health outputs or behavior, with or without a dataset.
- related_guidance: governance guidance, assurance standards, or reporting checklists for health AI or language models that do not define how to judge outputs (for example WHO guidance on large multimodal models, CHAI, TRIPOD-LLM, CHART).
- survey: a survey, review, scoping review, or systematic review about evaluating or benchmarking language models in health or medicine.
- borderline: it could be one of the four labels above, but the title and abstract are not enough to tell. Typical cases: an evaluation study that may release its question set or rubric; a dataset whose use for evaluation is unclear; a scope edge case.
- exclude: anything else. Set exclude_reason to one of: out_of_scope_task; not_health; not_generative_ai (classic ML or non-language AI); study_no_release (a one-off evaluation of models that releases no reusable test set or rubric); training_data (training or instruction-tuning data not meant for evaluation); model_or_method (a new model or method evaluated only on existing benchmarks); other.

When unsure whether to include or exclude, choose borderline. For any label other than exclude, set exclude_reason to "none". Give the benchmark or framework name if the record states one, otherwise an empty string. Keep the reason to one sentence."""

SCOPE = next(line for line in SYSTEM.splitlines() if line.startswith("Scope:"))

SYSTEM_STRICT = """You make the second, stricter screening pass for awesome-health-ai-evals, a catalog of reusable health benchmarks and evaluation frameworks for generative-AI chatbots and language models. A first screener, told to keep anything uncertain, flagged this record as a possible benchmark, evaluation framework, or borderline case. Decide from the title and abstract (or dataset card) whether it belongs in the catalog.

{scope}

Labels:
- benchmark: the record introduces a new set of test items (questions, cases, prompts, dialogues, or transcripts) with a way to score model outputs, for an in-scope task, and presents it as a reusable resource: it is named as a benchmark or dataset, or the record says it is released, public, or available on request, or the record is itself a Hugging Face dataset or GitHub repository for evaluation. A paper that also proposes a model counts if it introduces such a test set. A public question-answering or dialogue dataset for an in-scope task also counts when it has a test split or the record evaluates models on it, even if it is presented mainly for building systems; this matters most for datasets in languages other than English. If a public health question-answering or dialogue dataset in a language other than English, or from a low- or middle-income country, does not say whether it is used for evaluation, choose borderline rather than training_data.
- eval_framework: the record proposes a framework, rubric, scale, checklist, or set of criteria for judging AI models' health outputs or behavior, meant for others to apply. A study that only applies an existing instrument (DISCERN, a Likert accuracy scale, readability formulas) does not count.
- borderline: the record builds a substantial new test set or rubric (for example hundreds of items, several languages or countries, or a named set) but the abstract does not say whether it is released, so only the full text can tell. Do not use borderline as a default.
- survey: a survey, review, scoping review, or systematic review about evaluating or benchmarking language models in health or medicine.
- related_guidance: governance guidance, assurance standards, or reporting checklists for health AI or language models that do not define how to judge outputs.
- exclude, with exclude_reason:
  - study_no_release: a one-off evaluation of chatbots (often ChatGPT, Gemini, or similar) on questions or cases assembled for the study, such as "we asked ChatGPT 50 questions about X and rated the answers", with no sign the set is named, released, or meant for reuse. This is the most common exclusion.
  - model_or_method: a new model or method evaluated only on existing benchmarks.
  - training_data: training or instruction-tuning data not meant for evaluation.
  - out_of_scope_task, not_health, not_generative_ai, or other.

Be strict: the catalog lists resources that others can reuse. For any label other than exclude, set exclude_reason to "none". Give the benchmark or framework name if the record states one, otherwise an empty string. Keep the reason to one sentence."""

SCHEMA = {
    "type": "object",
    "properties": {
        "label": {"type": "string", "enum": LABELS},
        "exclude_reason": {"type": "string", "enum": EXCLUDE_REASONS},
        "name": {"type": "string"},
        "reason": {"type": "string"},
    },
    "required": ["label", "exclude_reason", "name", "reason"],
    "additionalProperties": False,
}

KEEP = {"benchmark", "eval_framework", "borderline"}
STAGES = {
    "title_abstract": {"model": "gpt-6-luna", "prompt": "v1", "system": SYSTEM},
    "strict": {"model": "gpt-6.1-sol", "prompt": "strict-v1",
               "system": SYSTEM_STRICT.replace("{scope}", SCOPE)},
}


def record_text(r: dict) -> str:
    if r["hf_ids"] and not r["doi"] and not r["arxiv_id"]:
        kind = "Hugging Face dataset card excerpt"
    elif r["github_repos"] and not r["doi"] and not r["arxiv_id"]:
        kind = "GitHub repository description"
    else:
        kind = "Abstract"
    lines = [
        f"Title: {r['title'] or '(none)'}",
        f"Year: {r['year'] or 'unknown'}  Venue: {r['venue'] or 'unknown'}  Type: {r['type'] or 'unknown'}",
    ]
    if r["hf_ids"]:
        lines.append("Hugging Face: " + ", ".join(r["hf_ids"][:3]))
    if r["github_repos"]:
        lines.append("GitHub: " + ", ".join(r["github_repos"][:3]))
    lines.append(f"{kind}: {(r['abstract'] or '(not available)')[:3000]}")
    return "\n".join(lines)


def request_body(r: dict, stage: str, model: str) -> dict:
    return {
        "model": model,
        "messages": [{"role": "system", "content": STAGES[stage]["system"]},
                     {"role": "user", "content": record_text(r)}],
        "response_format": {"type": "json_schema",
                            "json_schema": {"name": "screen", "strict": True, "schema": SCHEMA}},
        "reasoning_effort": "low",
        "max_completion_tokens": 2000,
    }


def client() -> OpenAI:
    load_env()
    return OpenAI(api_key=os.environ["OPENAI_API_KEY"])


def decisions() -> list[dict]:
    """Every screening result: the work file (gitignored), plus the rows of search/screening.csv
    (committed) for records the work file doesn't have, so a fresh checkout doesn't re-screen them."""
    rows = read_jsonl(RESULTS)
    seen = {r["id"] for r in rows}
    path = SEARCH / "screening.csv"
    if path.exists():
        with path.open(newline="") as f:
            for r in csv.DictReader(f):
                if r["id"] not in seen:
                    r.setdefault("prompt", STAGES.get(r["stage"], {}).get("prompt", ""))
                    rows.append(r)
    return rows


def screened_ids(stage: str, model: str) -> set[str]:
    """Records already screened at this stage with this model and prompt. A strict result also
    counts for title_abstract, since a record only reaches the strict stage through it."""
    done = set()
    for r in decisions():
        if r["stage"] == stage and r["model"] == model and r["prompt"] == STAGES[stage]["prompt"]:
            done.add(r["id"])
        elif stage == "title_abstract" and r["stage"] == "strict":
            done.add(r["id"])
    return done


def latest_decisions() -> dict[str, dict]:
    """Each record's decision: its last strict result, else its last title_abstract result."""
    latest = {}
    for row in decisions():
        if row["stage"] == "strict" or latest.get(row["id"], {}).get("stage") != "strict":
            latest[row["id"]] = row
    return latest


def pending_ids(batches: list[dict]) -> set[str]:
    """Records in submitted batches that are neither collected nor failed."""
    ids = set()
    for b in batches:
        if not b["collected"] and b.get("status") not in FAILED:
            ids |= {row["custom_id"] for row in read_jsonl(WORK / b["input"])}
    return ids


def append_results(rows: list[dict]) -> None:
    RESULTS.parent.mkdir(parents=True, exist_ok=True)
    with RESULTS.open("a") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def parse_choice(content: str | None) -> dict:
    try:
        return json.loads(content or "")
    except json.JSONDecodeError:
        return {"label": "borderline", "exclude_reason": "none", "name": "",
                "reason": "unparseable model output"}


def cmd_test(args) -> None:
    records = {r["id"]: r for r in read_jsonl(WORK / "records.jsonl")}
    c = client()
    for rid in args.ids.split(","):
        r = records[rid]
        resp = c.chat.completions.create(**request_body(r, args.stage, args.model or STAGES[args.stage]["model"]))
        out = parse_choice(resp.choices[0].message.content)
        u = resp.usage
        print(f"{rid} [{out['label']}/{out['exclude_reason']}] {out['name']!r} — {out['reason']}\n"
              f"    {r['title'][:100]}\n    tokens in={u.prompt_tokens} out={u.completion_tokens}")


def screened_texts(batches: list[dict], stage: str) -> dict[str, str]:
    """The record text each collected result was screened on, by record ID."""
    texts = {}
    for b in batches:
        if b["collected"] and b.get("stage", "title_abstract") == stage:
            for row in read_jsonl(WORK / b["input"]):
                texts[row["custom_id"]] = row["body"]["messages"][1]["content"]
    return texts


def cmd_submit(args) -> None:
    model = args.model or STAGES[args.stage]["model"]
    records = read_jsonl(args.input)
    if args.stage == "strict":
        first = {rid: row for rid, row in latest_decisions().items() if row["stage"] == "title_abstract"}
        records = [r for r in records if r["id"] in first and (
            first[r["id"]]["label"] in KEEP
            or (first[r["id"]]["label"] == "exclude" and first[r["id"]]["exclude_reason"] in args.rescue))]
    batches = json.loads(BATCHES.read_text()) if BATCHES.exists() else []
    done = screened_ids(args.stage, model) | pending_ids(batches)
    if args.changed:
        # Re-screen records whose title or abstract has been filled in since.
        texts = screened_texts(batches, args.stage)
        changed = {r["id"] for r in records if r["id"] in texts and texts[r["id"]] != record_text(r)}
        done -= changed
        print(f"{len(changed)} records changed since screening", file=sys.stderr)
    todo = [r for r in records if r["id"] not in done]
    if args.limit:
        todo = todo[:args.limit]
    if not todo:
        print("nothing to screen", file=sys.stderr)
        return
    c = client()
    for i in range(0, len(todo), 5000):
        chunk = todo[i:i + 5000]
        path = WORK / f"screen_input_{int(time.time())}_{i}.jsonl"
        write_jsonl(path, [{"custom_id": r["id"], "method": "POST", "url": "/v1/chat/completions",
                            "body": request_body(r, args.stage, model)} for r in chunk])
        with path.open("rb") as f:
            file = c.files.create(file=f, purpose="batch")
        batch = c.batches.create(input_file_id=file.id, endpoint="/v1/chat/completions",
                                 completion_window="24h")
        batches.append({"batch_id": batch.id, "stage": args.stage, "model": model,
                        "prompt": STAGES[args.stage]["prompt"], "n": len(chunk), "input": path.name,
                        "collected": False})
        print(f"submitted {batch.id} with {len(chunk)} records", file=sys.stderr)
    BATCHES.write_text(json.dumps(batches, indent=2))


def cmd_run(args) -> None:
    """Screen the records in a submitted batch's input file through the standard API.

    A fallback for batches stuck in the queue: costs twice the batch price, finishes in minutes.
    Results are appended as they arrive; the batch is cancelled first so nothing is screened twice.
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed
    c = client()
    batches = json.loads(BATCHES.read_text())
    b = next(x for x in batches if x["batch_id"] == args.batch)
    c.batches.cancel(b["batch_id"])
    done = {r["id"] for r in read_jsonl(RESULTS)
            if r["stage"] == b.get("stage", "title_abstract") and r["prompt"] == b["prompt"]}
    todo = [row for row in read_jsonl(WORK / b["input"]) if row["custom_id"] not in done]
    print(f"{len(todo)} requests from {b['input']}", file=sys.stderr)

    def call(row):
        resp = c.chat.completions.create(**row["body"])
        return row["custom_id"], resp

    rows, usage = [], [0, 0]
    with ThreadPoolExecutor(args.workers) as pool:
        futures = [pool.submit(call, row) for row in todo]
        for i, fut in enumerate(as_completed(futures), 1):
            try:
                rid, resp = fut.result()
            except Exception as err:  # a failed request stays unscreened; `submit` picks it up
                print(f"  request failed: {type(err).__name__}", file=sys.stderr)
                continue
            usage[0] += resp.usage.prompt_tokens
            usage[1] += resp.usage.completion_tokens
            rows.append({"id": rid, "model": b["model"], "prompt": b["prompt"],
                         "stage": b.get("stage", "title_abstract"),
                         **parse_choice(resp.choices[0].message.content)})
            if len(rows) >= 200 or i == len(futures):
                append_results(rows)
                rows = []
                print(f"  {i}/{len(futures)}", file=sys.stderr)
    append_results(rows)
    # Re-read: `collect` may have updated other batches while this ran.
    batches = json.loads(BATCHES.read_text())
    b = next(x for x in batches if x["batch_id"] == args.batch)
    b["collected"], b["status"] = True, "run_sync"
    b["tokens"] = {"input": usage[0], "output": usage[1]}
    BATCHES.write_text(json.dumps(batches, indent=2))
    write_csv()
    print(f"tokens in={usage[0]} out={usage[1]}", file=sys.stderr)


def cmd_collect(args) -> None:
    c = client()
    batches = json.loads(BATCHES.read_text())
    pending = 0
    for b in batches:
        if b["collected"] or b.get("status") in FAILED:
            continue
        try:
            batch = c.batches.retrieve(b["batch_id"])
            counts = batch.request_counts
            print(f"{b['batch_id']}: {batch.status} "
                  f"({counts.completed}/{counts.total} done, {counts.failed} failed)", file=sys.stderr)
            if batch.status not in ("completed", *FAILED):
                pending += 1
                continue
            text = c.files.content(batch.output_file_id).text if batch.output_file_id else ""
        except openai.APIError as err:
            print(f"{b['batch_id']}: {type(err).__name__}, will retry", file=sys.stderr)
            pending += 1
            continue
        if batch.status != "completed":
            # Records that didn't finish become unscreened again; `submit` resubmits them.
            b["status"] = batch.status
            if not text:
                continue
        rows, usage = [], [0, 0]
        for line in text.splitlines():
            item = json.loads(line)
            resp = item["response"]
            if resp["status_code"] != 200:
                continue
            body = resp["body"]
            usage[0] += body["usage"]["prompt_tokens"]
            usage[1] += body["usage"]["completion_tokens"]
            out = parse_choice(body["choices"][0]["message"]["content"])
            rows.append({"id": item["custom_id"], "model": b["model"], "prompt": b["prompt"],
                         "stage": b.get("stage", "title_abstract"), **out})
        append_results(rows)
        b["collected"] = True
        b["tokens"] = {"input": usage[0], "output": usage[1]}
        print(f"  collected {len(rows)} results; tokens in={usage[0]} out={usage[1]}", file=sys.stderr)
    BATCHES.write_text(json.dumps(batches, indent=2))
    write_csv()
    if pending:
        print(f"{pending} batch(es) still running", file=sys.stderr)
        sys.exit(2)


def write_csv() -> None:
    """search/screening.csv: the latest decision for each record, with the stage, model and prompt
    that made it, so the file can stand in for the work file on a fresh checkout."""
    titles = {r["id"]: r["title"] for r in read_jsonl(WORK / "records.jsonl")}
    latest = latest_decisions()
    with (SEARCH / "screening.csv").open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["id", "title", "label", "exclude_reason", "name",
                                          "reason", "stage", "model", "prompt"])
        w.writeheader()
        for rid in sorted(latest):
            row = latest[rid]
            w.writerow({"id": rid, "title": titles.get(rid) or row.get("title", ""), "label": row["label"],
                        "exclude_reason": row["exclude_reason"], "name": row["name"],
                        "reason": row["reason"], "stage": row["stage"], "model": row["model"],
                        "prompt": row.get("prompt", "")})


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)
    t = sub.add_parser("test")
    t.add_argument("--ids", required=True)
    t.add_argument("--stage", choices=STAGES, default="title_abstract")
    t.add_argument("--model")
    s = sub.add_parser("submit")
    s.add_argument("--stage", choices=STAGES, default="title_abstract")
    s.add_argument("--model")
    s.add_argument("--input", default=str(WORK / "records.jsonl"), type=lambda p: __import__("pathlib").Path(p))
    s.add_argument("--limit", type=int)
    s.add_argument("--rescue", nargs="*", default=[], choices=EXCLUDE_REASONS,
                   help="strict stage: also re-screen first-pass exclusions with these reasons")
    s.add_argument("--changed", action="store_true",
                   help="also re-screen records whose text changed since they were screened")
    sub.add_parser("collect")
    r = sub.add_parser("run")
    r.add_argument("--batch", required=True)
    r.add_argument("--workers", type=int, default=16)
    args = parser.parse_args()
    {"test": cmd_test, "submit": cmd_submit, "collect": cmd_collect, "run": cmd_run}[args.cmd](args)


if __name__ == "__main__":
    main()
