"""Title/abstract screening through the OpenAI Batch API.

Each record gets one label with a reason. Results are appended to
search/work/screen_results.jsonl and summarized in search/screening.csv.

Usage:
    uv run scripts/screen.py test --ids r_abc,r_def [--model M]   # synchronous check
    uv run scripts/screen.py submit [--model M] [--input FILE]    # batch the unscreened records
    uv run scripts/screen.py collect                              # download finished batches
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time

from openai import OpenAI

from common import SEARCH, WORK, load_env, read_jsonl, write_jsonl

MODEL = "gpt-6-luna"
PROMPT_VERSION = "v1"
RESULTS = WORK / "screen_results.jsonl"
BATCHES = WORK / "screen_batches.json"

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


def request_body(r: dict, model: str) -> dict:
    return {
        "model": model,
        "messages": [{"role": "system", "content": SYSTEM},
                     {"role": "user", "content": record_text(r)}],
        "response_format": {"type": "json_schema",
                            "json_schema": {"name": "screen", "strict": True, "schema": SCHEMA}},
        "reasoning_effort": "low",
        "max_completion_tokens": 2000,
    }


def client() -> OpenAI:
    load_env()
    return OpenAI(api_key=os.environ["OPENAI_API_KEY"])


def screened_ids(model: str) -> set[str]:
    return {r["id"] for r in read_jsonl(RESULTS)
            if r["model"] == model and r["prompt"] == PROMPT_VERSION}


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
        resp = c.chat.completions.create(**request_body(r, args.model))
        out = parse_choice(resp.choices[0].message.content)
        u = resp.usage
        print(f"{rid} [{out['label']}/{out['exclude_reason']}] {out['name']!r} — {out['reason']}\n"
              f"    {r['title'][:100]}\n    tokens in={u.prompt_tokens} out={u.completion_tokens}")


def cmd_submit(args) -> None:
    records = read_jsonl(args.input)
    done = screened_ids(args.model)
    todo = [r for r in records if r["id"] not in done]
    if args.limit:
        todo = todo[:args.limit]
    if not todo:
        print("nothing to screen", file=sys.stderr)
        return
    c = client()
    batches = json.loads(BATCHES.read_text()) if BATCHES.exists() else []
    for i in range(0, len(todo), 5000):
        chunk = todo[i:i + 5000]
        path = WORK / f"screen_input_{int(time.time())}_{i}.jsonl"
        write_jsonl(path, [{"custom_id": r["id"], "method": "POST", "url": "/v1/chat/completions",
                            "body": request_body(r, args.model)} for r in chunk])
        with path.open("rb") as f:
            file = c.files.create(file=f, purpose="batch")
        batch = c.batches.create(input_file_id=file.id, endpoint="/v1/chat/completions",
                                 completion_window="24h")
        batches.append({"batch_id": batch.id, "model": args.model, "prompt": PROMPT_VERSION,
                        "n": len(chunk), "collected": False})
        print(f"submitted {batch.id} with {len(chunk)} records", file=sys.stderr)
    BATCHES.write_text(json.dumps(batches, indent=2))


def cmd_collect(args) -> None:
    c = client()
    batches = json.loads(BATCHES.read_text())
    pending = 0
    for b in batches:
        if b["collected"]:
            continue
        batch = c.batches.retrieve(b["batch_id"])
        counts = batch.request_counts
        print(f"{b['batch_id']}: {batch.status} "
              f"({counts.completed}/{counts.total} done, {counts.failed} failed)", file=sys.stderr)
        if batch.status != "completed":
            pending += batch.status not in ("failed", "expired", "cancelled")
            continue
        rows, usage = [], [0, 0]
        text = c.files.content(batch.output_file_id).text
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
                         "stage": "title_abstract", **out})
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
    """search/screening.csv: the latest decision for each record."""
    titles = {r["id"]: r["title"] for r in read_jsonl(WORK / "records.jsonl")}
    latest = {}
    for row in read_jsonl(RESULTS):
        latest[row["id"]] = row
    with (SEARCH / "screening.csv").open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["id", "title", "label", "exclude_reason", "name",
                                          "reason", "stage", "model"])
        w.writeheader()
        for rid in sorted(latest):
            row = latest[rid]
            w.writerow({"id": rid, "title": titles.get(rid, ""), "label": row["label"],
                        "exclude_reason": row["exclude_reason"], "name": row["name"],
                        "reason": row["reason"], "stage": row["stage"], "model": row["model"]})


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)
    t = sub.add_parser("test")
    t.add_argument("--ids", required=True)
    t.add_argument("--model", default=MODEL)
    s = sub.add_parser("submit")
    s.add_argument("--model", default=MODEL)
    s.add_argument("--input", default=str(WORK / "records.jsonl"), type=lambda p: __import__("pathlib").Path(p))
    s.add_argument("--limit", type=int)
    sub.add_parser("collect")
    args = parser.parse_args()
    {"test": cmd_test, "submit": cmd_submit, "collect": cmd_collect}[args.cmd](args)


if __name__ == "__main__":
    main()
