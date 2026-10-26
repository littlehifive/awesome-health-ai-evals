---
name: adapt-benchmark-rubric
description: >-
  Use when a team wants to "adapt the HealthBench rubric for our setting",
  "localize an evaluation rubric", "make a scoring guide for our health bot
  in Kenya", or has found a rubric in the awesome-health-ai-evals catalog
  that was written for a high-income health system. Rewrites the criteria
  so they judge what matters where the bot is used: medicines and tests
  actually available, national guidelines, referral to care that exists,
  language and literacy, cost, and culture, and records every change and why.
  Produces an adapted rubric with anchors, a change log, and a plan to check
  it with local clinicians. Not for choosing benchmarks
  (find-health-benchmarks) or for applying a finished rubric to logs
  (score-transcripts-with-rubric).
license: CC-BY-4.0
metadata:
  title: Adapt a health-AI evaluation rubric to a local setting
  version: "0.1.0"
  status: draft
  authors: "Zezhen Wu"
  org: TAF
  tags: "health-ai, evaluation, rubrics, localization, lmic"
  consumes: "source-rubric, setting-profile"
  produces: "adapted-rubric"
---

## What it does

Takes an open rubric or evaluation framework (for example HealthBench's axes, QUEST, or a benchmark's expert-rating scale) and adapts it to one setting, so that a response that would be good there scores well, and one that would be good only in a well-resourced hospital does not.

Rubrics written in high-income settings often reward advice like "get an MRI" or "see a specialist today", assume 24-hour emergency care, and say nothing about whether a medicine is on the national essential list. This skill rewrites those criteria, adds what the setting needs, and keeps a log so the adaptation can be reviewed and cited.

## When to use it

### Use it when
- A team has chosen a rubric from the catalog and serves a population outside the setting it was written for
- A rubric must be translated and the team wants more than a word-for-word translation
- Local clinicians say the rubric "rewards the wrong answers here"

### Do not use it when
- The team hasn't chosen a starting rubric; run `find-health-benchmarks` first
- The rubric is fine and the team needs to score logs; use `score-transcripts-with-rubric`
- The license forbids derivatives; say so and stop (check the entry's license)

## Before you start

1. **Required.** The source rubric: its criteria, definitions, and scale (from the paper or repository, or the entry's terms file in the awesome-health-ai-evals repository, `terms/<id>.yaml`), and its license.
2. **Required.** The setting: country, level of care (community, primary, hospital), users, languages, and literacy.
3. **Required.** The national or WHO guidelines the bot should follow, and the essential medicines and tests available at that level of care.
4. **Helpful.** Two or three real conversations from the bot, and access to local clinicians for review.

## What it draws on

- The catalog's construct taxonomy (`../find-health-benchmarks/references/constructs.md`), especially constructs about resource-appropriate advice, guideline adherence, referral, language and literacy fit, and cultural appropriateness.
- WHO guidance for the health area (for example WHO IMCI, mhGAP, or antenatal care guidelines) and the country's essential medicines list.

## How to do it

1. **Map each criterion.** List every criterion in the source rubric with its definition and the construct it measures. Note the constructs the taxonomy marks as contested (scope boundaries, test use and cost of care, fairness across groups): these are where high-income rubrics most often reward the wrong answer for a low-resource setting.
2. **Mark each one keep, rewrite, or drop.** Rewrite criteria that assume resources the setting lacks (imaging, specialists, lab tests, ambulances, paid leave), that cite another country's guideline, or that judge tone by another culture's norms. Drop criteria that cannot be judged in this setting. Keep the rest unchanged.
3. **Add what is missing.** Add criteria for constructs the setting needs and the source lacks. Common ones: recommends only medicines and tests available at this level of care; follows the national guideline; refers to care that exists and says how to reach it; matches the user's language and reading level; avoids costly or unnecessary steps; respects local beliefs without endorsing harmful practice.
4. **Write anchors.** For each criterion, write what a 1 (or "fail") and a top score look like, with an example drawn from the setting.
5. **Keep a change log.** One line per change: source criterion, what changed, why, and the guideline or local fact behind it.
6. **Plan a check.** Have two local clinicians score the same 20 to 30 responses with the adapted rubric; compute agreement and revise criteria they disagree on before using it at scale.

## Output template

```
## Adapted rubric: <name> for <setting>
Source: <rubric, version, license>

| # | Criterion | Definition | Anchors (fail / pass) | Construct | Status |
|---|---|---|---|---|---|
| 1 | ... | ... | ... | ... | kept / rewritten / new |

## Change log
- <criterion>: <change> because <reason> (<guideline or fact>)

## Review plan
<who reviews, how many responses, agreement threshold>
```

## What to check before relying on this

- Every rewritten criterion cites a guideline or a stated local fact, not a guess.
- Local clinicians, not the model, have the last word on what good advice is.
- If the source license requires attribution or share-alike, the adapted rubric carries it.

## Where it goes wrong

- Translating the words but keeping the assumptions (a Swahili rubric that still rewards "go to the emergency department").
- Lowering the bar for safety: adapting to scarce resources must never mean accepting unsafe advice.
- Adding so many criteria that raters can't apply them consistently.
