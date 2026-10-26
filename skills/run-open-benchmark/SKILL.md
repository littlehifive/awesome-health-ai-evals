---
name: run-open-benchmark
description: >-
  Use when a team wants to "run MedQA on our model", "evaluate our LLM on
  AfriMed-QA", "get HealthBench scores", or "set up lm-evaluation-harness for
  a medical benchmark". Runs an open dataset from the awesome-health-ai-evals
  catalog through an existing harness (lm-evaluation-harness, HELM/MedHELM,
  OpenAI simple-evals) or a short script, with settings recorded so results
  can be compared and reproduced. Produces scores with the exact commands,
  versions, prompts, and a note on what the benchmark does and doesn't show
  for the team's use. Not for choosing a benchmark (find-health-benchmarks)
  or scoring the team's own conversations (score-transcripts-with-rubric).
license: CC-BY-4.0
metadata:
  title: Run an open health benchmark through an existing harness
  version: "0.1.0"
  status: draft
  authors: "Zezhen Wu"
  org: TAF
  tags: "health-ai, evaluation, benchmarks, reproducibility"
  consumes: "benchmark-choice, model-access"
  produces: "benchmark-scores"
---

## What it does

Runs one open benchmark from the catalog against one or more models, through the harness that already supports it where one exists, and records every setting that changes the score.

Small choices change benchmark results a lot: the prompt template, few-shot examples, answer extraction, temperature, and which split was used. This skill fixes and records them so scores can be compared across models and over time.

## When to use it

### Use it when
- The team has chosen an open benchmark (open data in the catalog) and has API or weight access to the models
- A team needs a quick baseline before investing in its own evaluation
- Someone reports a score and the team wants to reproduce it

### Do not use it when
- The dataset is gated or closed; apply for access first or pick another entry
- The goal is to judge safety of advice to real users; benchmarks rarely show that, so use `score-transcripts-with-rubric`
- The benchmark's license forbids the intended use (check the entry)

## Before you start

1. **Required.** The catalog entry (name and link) and the split to run.
2. **Required.** The models, how they are accessed (API or local weights), and the budget.
3. **Helpful.** A score from the original paper to sanity-check against.

## How to do it

1. **Find the harness.** Check, in this order:
   - **OpenAI simple-evals** for HealthBench (and its Hard and Consensus subsets): it ships the rubric grader.
   - **EleutherAI lm-evaluation-harness** for multiple-choice sets it has tasks for (for example MedQA, MedMCQA, PubMedQA, MMLU medical subsets); list tasks with `lm_eval --tasks list | grep -i med`.
   - **HELM / MedHELM** (stanford-crfm/helm) for its suite of medical scenarios.
   - The benchmark's own repository, which often has an evaluation script.
   - If none fits, write a short script: load the dataset from Hugging Face or the repository, format each item with a fixed prompt, parse the answer deterministically, and score with the benchmark's stated metric.
2. **Fix the settings.** Record: harness name and version (or commit), dataset version or commit, split, prompt template, few-shot count, temperature (use 0 where possible), max tokens, answer-extraction rule, model names and versions, date.
3. **Smoke test.** Run 20 items; read the raw outputs and the parsed answers to catch formatting failures.
4. **Run and score.** Run the full split. Report the metric with a 95% confidence interval (bootstrap or binomial).
5. **Sanity-check.** Compare with the paper's reported numbers; explain any large gap (different prompt, split, or model version).
6. **Interpret.** Say what the score measures and what it doesn't for the team's use, using the catalog entry's item origin, languages, and scoring method.

## Output template

```
## <Benchmark> results, <date>
| Model | Metric (95% CI) | n |
|---|---|---|

Settings: harness <name@version>, dataset <version/commit>, split <..>, prompt <file or text>, shots <k>, temperature <t>, extraction <rule>

Reproduce:
<exact commands>

What this shows / doesn't show for <use>:
<2-3 sentences>
```

## What to check before relying on this

- Contamination: popular benchmarks may be in the model's training data; newer or held-out splits are safer.
- Answer parsing failures are counted as wrong and reported, not silently dropped.
- The license allows the use, and gated data stays where its terms require.

## Where it goes wrong

- Comparing scores produced with different prompts or splits.
- Reporting exam accuracy as evidence that a patient-facing bot gives safe advice.
- Running a translated benchmark and calling the result a measure of performance in that country.
