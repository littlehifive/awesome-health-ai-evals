# Entry schema

Each benchmark or evaluation framework is one file, `entries/<id>.yaml`, validated against `entry.schema.json` by `scripts/validate.py`. Record facts as the source states them. Don't infer labels such as "LMIC" or "WHO region": the build scripts derive those from the country codes.

## Example (fictional)

```yaml
id: example-mch-qa
name: Example-MCH-QA
kind: benchmark
year: 2025
summary: 1,200 questions from a maternal-health hotline in Kenya and Uganda, with nurse-written reference answers, scored by an LLM judge against a rubric.
readme_section: multilingual_regional
links:
  paper: https://arxiv.org/abs/2501.00000
  arxiv: "2501.00000"
  huggingface: [example-org/example-mch-qa]
  code: https://github.com/example-org/example-mch-qa
license: CC-BY-4.0
open_data: open
geography:
  item_languages: [English, Swahili]
  item_origin_countries: [KEN, UGA]
  rater_countries: [KEN]
  localization: native
  lead_institution_countries: [KEN, USA]
  subsets:
    - {name: Swahili, languages: [Swahili], countries: [KEN, UGA], localization: native}
origin:
  builder_types: [implementer_ngo, academic]
  item_provenance: [real_user_queries]
  venue: preprint
facets:
  health_areas: [maternal_newborn]
  intended_users: [patient_public]
  eval_methods: [rubric_llm_judge, expert_human_rating]
  modality: [text]
  size: 1,200 questions
provenance:
  records: [r_0a1b2c3d4e]
  extracted: 2026-10-25
  read_full_text: true
  confidence: high
```

## Fields

**id**: lowercase slug of the name, e.g. `medqa`, `healthbench`, `afrimed-qa`.

**kind**: `benchmark` (test items plus a scoring method, released or described for reuse) or `eval_framework` (a framework or rubric for judging a model's health outputs, with or without data). A framework that ships a dataset, like HealthBench, is a `benchmark`; its rubric axes are captured in pass 2.

**year**: year of first public release (preprint or dataset).

**summary**: one plain sentence: what the items are, how many, for whom.

**readme_section**: where the entry appears in the README. Use the first that applies:
1. `frameworks`: kind is `eval_framework`.
2. `voice`: items are spoken or the model is evaluated on audio.
3. `mental_health`: mental health is the main health area.
4. `safety`: the main purpose is safety, harm, hallucination, bias, or fairness.
5. `multilingual_regional`: items are in a language other than English, or built for a specific country or region outside North America, Western Europe, and Australia.
6. `knowledge_exam`: exam-style or knowledge questions scored by exact match.
7. `open_ended`: open-ended, conversational, or multi-turn evaluation.

**links**: whatever exists. `huggingface` is a list of dataset IDs (`org/name`). `arxiv` is the bare ID as a quoted string.

**license**: the dataset license as an SPDX-style string (`CC-BY-4.0`, `MIT`, `Apache-2.0`, `CC-BY-NC-SA-4.0`), `custom` for a bespoke license, or null if none is stated.

**open_data**: `open` (downloadable without approval), `gated` (needs sign-up, approval, or credentialing), `closed` (not released), `described_only` (a framework or rubric described in a paper with no dataset).

**geography**
- `item_languages`: English names of the languages the items are written or spoken in (`English`, `Mandarin Chinese`, `Swahili`). Translations count.
- `item_origin_countries`: ISO 3166-1 alpha-3 codes for where the questions, cases, or conversations came from (the exam's country, the clinic's country, the forum's country). Use `GLOBAL` for items with no country origin (e.g., written to be general) and `UNKNOWN` when the source doesn't say. Use `item_origin_note` for anything that needs a sentence.
- `rater_countries`: where the people who wrote rubrics, reference answers, or ratings were based. Omit if not stated.
- `localization`: `native` (items created in and for that setting), `adapted` (an earlier dataset changed for a new setting beyond translation), `translated` (an earlier dataset translated only), `mixed` (subsets differ), `unknown`.
- `lead_institution_countries`: country codes of the first and last authors' institutions (or the releasing organization).
- `subsets`: language or country subsets with their own facts, when a benchmark has them.

**origin**
- `builder_types`: `academic`, `industry_lab` (AI companies and their research labs), `implementer_ngo` (organizations that run health programs or deploy chatbots), `government`, `multilateral` (WHO, UNICEF, World Bank, etc.).
- `item_provenance`: where the items came from: `real_user_queries` (from a deployed service), `clinician_written`, `exam_questions`, `llm_generated`, `adapted_dataset`, `web_forum` (public Q&A sites), `literature` (papers, guidelines, textbooks), `not_applicable` (frameworks with no items), `unknown`.
- `venue`: `peer_reviewed` (journal or peer-reviewed proceedings), `preprint`, `grey_literature` (reports, blog posts, dataset cards only).

**facets**
- `health_areas`: main areas only (one to four). `general_medicine` for broad medical knowledge.
- `intended_users`: who the evaluated system is meant to serve, as the source states or clearly implies.
- `eval_methods`: `mcq_exact_match`, `automatic_metric` (BLEU, ROUGE, BERTScore, F1), `rubric_llm_judge`, `expert_human_rating`, `simulated_multi_turn` (simulated patients or multi-turn dialogue), `real_user_data` (scored on real users' conversations).
- `modality`: `text` and/or `voice`.
- `size`: free text, e.g. `12,723 questions`.

**signals**: filled by `scripts/fill_signals.py` (citations from OpenAlex, Hugging Face downloads, GitHub stars). `uptake` lists model reports or leaderboards that use the benchmark, recorded only where a source says so.

**provenance**: the screening record IDs this entry came from, the extraction date, whether the full text was read, and confidence (`high`: facts checked in the full text; `medium`: abstract plus dataset card; `low`: thin sources, some fields guessed or unknown). Put anything uncertain in `notes`.
