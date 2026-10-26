---
name: score-transcripts-with-rubric
description: >-
  Use when a team has real conversation logs from its health chatbot and
  asks "can we score our transcripts with the HealthBench rubric?", "grade
  our bot's answers", "set up an LLM judge for our health conversations",
  or "how good are our bot's replies?". Applies an open rubric from the
  awesome-health-ai-evals catalog (or an adapted one) to a sample of the
  team's own conversations, with an LLM judge checked against clinician
  ratings, and reports scores by criterion with uncertainty and the worst
  cases. Not for choosing a rubric (find-health-benchmarks), localizing it
  (adapt-benchmark-rubric), or running a public dataset (run-open-benchmark).
license: CC-BY-4.0
metadata:
  title: Score a chatbot's real conversations with an open rubric
  version: "0.1.0"
  status: draft
  authors: "Zezhen Wu"
  org: TAF
  tags: "health-ai, evaluation, llm-judge, rubrics, transcripts"
  consumes: "conversation-logs, rubric"
  produces: "transcript-scores"
---

## What it does

Scores a sample of a health chatbot's real conversations against an open rubric, so the team learns how its bot does with its own users, in their language, on their questions. That is usually more informative than any public benchmark.

An LLM judge applies the rubric to each conversation; clinicians score a subset so the judge's agreement can be measured before its scores are trusted.

## When to use it

### Use it when
- A team has de-identified conversation logs and a rubric (from the catalog, or adapted with `adapt-benchmark-rubric`)
- A team wants to monitor quality over time or compare two versions of its bot on real traffic
- Public benchmarks don't reflect the bot's users or languages

### Do not use it when
- There are no logs yet; use `find-health-benchmarks` and `run-open-benchmark` on public data, or write test cases first
- Logs contain identifiable health data that hasn't been cleared for this use; stop and get that resolved
- The rubric hasn't been checked for this setting and the team's users are far from the rubric's origin; adapt it first

## Before you start

1. **Required.** Where the logs come from, how many there are, and whether consent and de-identification cover evaluation.
2. **Required.** The rubric: criteria, definitions, scale, and license.
3. **Required.** Who can rate a calibration subset (at least two clinicians or trained raters who know the setting and language).
4. **Helpful.** What decision the scores feed (launch, model choice, monitoring) and what score would change it.

## How to do it

1. **Sample.** Draw a random sample (200 to 500 conversations is usually enough), stratified by language, topic, and user type if those vary. Add a purposive set of known-hard cases (emergencies, self-harm, pregnancy danger signs) and report it separately.
2. **De-identify.** Remove names, phone numbers, locations, and dates before anything leaves the team's systems.
3. **Write the judge prompt.** For each criterion: definition, anchors, and the instruction to quote the part of the reply that justifies the score. Score criteria one at a time rather than asking for one overall grade.
4. **Calibrate.** Clinicians score 50 to 100 conversations blind to the judge. Compute agreement per criterion (Cohen's or weighted kappa, or percent agreement for binary criteria). Revise the prompt and re-check criteria with low agreement; don't use the judge for criteria that stay unreliable, and score those by hand.
5. **Score the sample.** Run the judge, keeping its quoted evidence.
6. **Report.** Per criterion: mean or pass rate with a 95% confidence interval; breakdown by language and user type; the 10 worst conversations with the judge's evidence. Report judge-clinician agreement next to every score.

## Output template

```
## Scores: <bot>, <period>, n=<sample>
Rubric: <name/version>; judge: <model>; calibration: <n> conversations, <raters>

| Criterion | Score (95% CI) | Judge–clinician agreement |
|---|---|---|

## By language / user type
...

## Worst cases
1. <conversation id>: <criterion failed>, "<quoted reply>", <why it matters>

## Limits
<sample, judge reliability, criteria scored by hand>
```

## What to check before relying on this

- Agreement is reported for every criterion, and unreliable criteria are not reported as judge scores.
- The judge model isn't the model that powers the bot, or the report says so.
- Danger-sign and self-harm cases were reviewed by a clinician, whatever the judge said.

## Where it goes wrong

- Trusting an uncalibrated judge, especially in languages the judge model handles poorly.
- One overall score that hides a safety failure in a minority of conversations.
- Sending identifiable health conversations to a third-party API.
