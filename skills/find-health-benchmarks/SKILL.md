---
name: find-health-benchmarks
description: >-
  Use when a team building or buying a health chatbot or LLM feature asks
  "which benchmarks should we use?", "how do we evaluate our health bot?",
  "is there an eval set for maternal health in Swahili?", or "what do other
  groups measure?". Matches the chatbot's users, country, language, health
  area, and risks to entries in the awesome-health-ai-evals catalog and to
  the constructs those entries judge, and says plainly where no grounded
  benchmark exists. Produces a short list of benchmarks and frameworks with
  why each fits, what it misses for this setting, and the constructs left
  uncovered. Not for writing a new rubric (adapt-benchmark-rubric), scoring
  the team's own transcripts (score-transcripts-with-rubric), or running a
  dataset (run-open-benchmark).
license: CC-BY-4.0
metadata:
  title: Find health benchmarks that fit a chatbot and its setting
  version: "0.1.0"
  status: draft
  authors: "Zezhen Wu"
  org: TAF
  tags: "health-ai, evaluation, benchmarks, lmic"
  consumes: "chatbot-description"
  produces: "benchmark-shortlist"
---

## What it does

Finds the benchmarks and evaluation frameworks in the awesome-health-ai-evals catalog that fit one health chatbot, and shows what they would and would not tell the team.

Most health benchmarks are exam questions in English from the United States or China. A team serving community health workers in Malawi, or mothers texting in Hausa, usually finds that nothing fits exactly. This skill says that clearly, picks the closest entries, and names the gaps, so the team knows what it still has to build or adapt.

## When to use it

### Use it when
- A team asks which benchmarks or eval sets to use for a health chatbot, triage bot, symptom checker, or LLM feature
- Someone wants to know whether an eval exists for a specific language, country, health area, or user group
- A funder or reviewer asks "how was this bot evaluated, and against what?"
- A team is about to report MedQA scores as evidence that a patient-facing bot is safe

### Do not use it when
- The team already knows which benchmark it wants and needs to run it; use `run-open-benchmark`
- The team needs a rubric for its own setting; use `adapt-benchmark-rubric`
- The team has conversation logs and wants them scored; use `score-transcripts-with-rubric`
- The question is about imaging, EHR documentation or coding, or drug discovery: those are out of the catalog's scope

## Before you start

Ask for anything the user hasn't said. Don't ask for what they have.

1. **Required.** Who uses the chatbot (patients or public, community health workers, nurses or midwives, pharmacists, clinicians) and what they ask it.
2. **Required.** Country or countries, and the languages people actually write or speak in (including code-switching).
3. **Required.** Health areas (for example maternal and newborn, HIV, mental health, NCDs, general triage) and the worst thing the bot could get wrong.
4. **Helpful.** Text or voice; whether the team can share conversation logs; whether they need open data or can apply for gated sets.

## What it draws on

- `references/catalog.csv`: every catalog entry with its item languages, item-origin countries, World Bank income group, WHO region, item-origin label (native LMIC, adapted, translated only, high-income only, global or unknown), scoring methods, intended users, health areas, open-data status, license, link, entry URL, the constructs it judges, and extraction confidence. Regenerate it from the repository with `uv run scripts/build_skills_data.py`.
- `scripts/filter_catalog.py`: ranks the catalog for a setting.
- `references/constructs.md`: the construct taxonomy (what evaluations judge) with definitions, built from the terms entries use.
- The live catalog at the project site, if available, for detail pages.

## How to do it

1. **Write the profile.** One line each: users, country and income group, languages, health areas, modality, the top three risks.
2. **Filter the catalog.** `references/catalog.csv` has about 1,000 rows, too many to read whole. Rank it with `python scripts/filter_catalog.py` (in this skill's folder; standard library only), passing the profile, for example `--countries Nigeria --regions AFR --income lower-middle --languages Hausa English --areas maternal_newborn primary_care --users patient_public`. It scores place, language, area, user, scoring method, and open data, and prints the top rows. Read the top 20 to 30, then look up any other rows you need in the CSV. List-valued columns are separated by `; `. Blank `income_groups` and `who_regions` mean the entry's items have no country (global) or an unknown one. Values:
   - `health_areas`: general_medicine, primary_care, maternal_newborn, child_health, srh, hiv, tb, malaria, infectious_other, ncd, oncology, cardiology, mental_health, nutrition, pharmacy_medication, nursing, dentistry, ophthalmology, emergency_triage, public_health, traditional_medicine, other_specialty
   - `intended_users`: patient_public, chw, nurse_midwife, pharmacist, clinician, medical_student, unspecified
   - `eval_methods`: mcq_exact_match, automatic_metric, rubric_llm_judge, expert_human_rating, simulated_multi_turn, real_user_data
   - `item_origin`: native LMIC, adapted, translated only, high-income only, global or unknown
   - `open_data`: open, gated, closed, described_only, unknown

   Then judge the ranking yourself, best first:
   - item origin in the same country, then the same WHO region, then the same income group (native LMIC beats adapted beats translated only);
   - item languages that match;
   - scoring that fits the risks (rubric or expert rating for advice quality and safety; multiple choice only tests recall);
   - open data, then gated, then closed.
3. **Check constructs, not just topics.** For the top candidates, list the constructs each judges (the `constructs` column; definitions in `references/constructs.md`). Compare against what the risks need (for example danger-sign recognition and escalation, care-level disposition, local context fit, parity across languages). Constructs no candidate covers are gaps. A blank `constructs` cell means no terms were recorded for that entry (common for multiple-choice or automatic-metric benchmarks), not that it judges nothing: read its summary and say "not recorded" rather than counting it as a gap.
4. **Be honest about fit.** For each pick, write one line on why it fits and one on what it misses here (for example "Nigerian and Kenyan exam questions in English; no Hausa, no consumer phrasing").
5. **Name the gaps and the next step.** If no entry has items from the setting, say so first. Point to `adapt-benchmark-rubric` for a rubric and to `score-transcripts-with-rubric` for scoring real conversations, which is usually the most valid test.

## Output template

```
## Setting
<one-line profile>

## Closest matches (best first)
| Benchmark | Why it fits | What it misses here | Data |
|---|---|---|---|
| <name (year)> | <items/language/country/scoring> | <gap> | open / gated / closed / described only / unknown |

Considered but not shortlisted: <name: one-line reason>, ...

## Constructs these cover / don't cover
Covered: <constructs>
Not covered by anything in the catalog: <constructs>

## Recommendation
<2-4 sentences: what to run first, what to adapt, what to build from the team's own logs>
```

## What to check before relying on this

- Open each pick's entry (the `entry_url` column): the catalog was built with LLM assistance, and `confidence` is how sure the extraction agent was of the entry's facts (high: facts checked in the full text; medium: abstract plus dataset card; low: thin sources, some fields guessed or unknown). Treat `low` entries as leads, not facts. When `open_data` is `unknown` or `license` is blank, say the team must check access before planning on it.
- Check the license before using a dataset in a product.
- A benchmark score is not a deployment decision. Exam accuracy says little about advice to patients in another country.

## Where it goes wrong

- Recommending MedQA or MMLU for a patient-facing bot because they are popular. They test exam recall, not safe advice.
- Treating a translated benchmark as grounded in the target setting. Translation keeps the high-income clinical context.
- Missing the gap: if nothing is grounded in the setting, the most useful output is saying so and pointing to the team's own logs.
