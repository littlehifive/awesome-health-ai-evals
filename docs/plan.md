# Plan: awesome-health-ai-evals

Decisions from the scoping interview on 2026-10-25, revised the same day after a plan review. Change a decision here before building against a different one.

## Purpose

An exploratory map of health benchmarks and evaluation frameworks for generative-AI chatbots, with attention to where the evidence comes from: low- and middle-income countries as well as high-income ones. The goal is to gather what exists, show the scope of the field, and help others working on the same question. It is not a systematic review or an academically adjudicated taxonomy, and the site says so.

## What counts as an entry

- **Benchmark**: test items plus a scoring method, released or described for reuse.
- **Evaluation framework**: a framework or rubric that defines how to judge a model's health outputs or behavior, with or without a dataset (e.g., QUEST, MedHELM's task taxonomy, HealthBench's axes).
- **Not entries**: one-off evaluation studies that release no reusable set. Governance guidance and reporting checklists (WHO LMM guidance, CHAI, TRIPOD-LLM, CHART) are listed in a "Related guidance" README section but not coded into the taxonomy.

### Scope

In: a model answers health questions or converses about health in natural language, in text or voice, for patients, the public, community health workers, nurses, midwives, or clinicians. Includes exam-style multiple-choice sets, open-ended and multi-turn evaluations, safety, hallucination, bias, and mental health.

Out: radiology and pathology image question answering, EHR documentation and coding, biomedical NLP (NER, relation extraction), drug discovery.

### Inclusion bar

Everything in scope is included. Each card shows signals instead of a cutoff: OpenAlex citations, Hugging Face downloads, open data, and uptake in model reports. A hand-picked "featured" tier leads the README.

### Granularity

- One entry per released benchmark. Language or country subsets are listed inside it with their own facts.
- A translation or adaptation by a different team is its own entry, linked with `adapted_from`.
- Time window: 2019 onward, plus older datasets still in active use (e.g., PubMedQA).

## What each entry records

Facts are recorded; labels are derived from them. No WEIRD framing.

**Pass 1 (during screening, every entry)**

- Identity: name, year, paper, dataset and code links, license, open-data status (open / gated / closed / described only).
- Geography: item languages; item-origin countries; rubric-author or rater countries; native / adapted / translated; lead-institution country.
- Origin: builder type (academic / industry lab / implementer or NGO / government / multilateral); item provenance (real user queries from a deployment / clinician-written / exam questions / LLM-generated / adapted from an earlier dataset); venue (peer-reviewed / preprint / grey literature).
- Facets: health area; intended user; eval method (multiple choice or exact match / rubric with LLM judge / expert human rating / simulated patient or multi-turn / real-user data).
- Signals: citations, downloads, uptake. Uptake is recorded only where a paper or model report states it.

**Pass 2 (included entries, for the taxonomy)**

- Every evaluation term the entry uses (axis, dimension, criterion, principle), with its verbatim definition and source location.

**Derived on the site**

- Income group from the World Bank classification current at build time (pinned in the repo): low / lower-middle / upper-middle / high, with an "LMIC" rollup. Upper-middle is shown separately so large upper-middle producers such as China do not hide gaps elsewhere.
- WHO region.
- Research vs practice, from builder type, item provenance, and venue.
- Grounding badge: native LMIC / adapted / translated only / high-income only.

## Search

Logged and re-runnable. A `search/` folder stores every query, source, date, hit count, and a screening log with the decision and reason for each record.

Tracks:

1. **paperclip**: arXiv, medRxiv, PMC, abstracts corpus.
2. **OpenAlex API**: keyword queries over journals and proceedings (including ACL Anthology venues), plus forward-citation snowballing from anchor benchmarks (e.g., MedQA, MedMCQA, PubMedQA, MultiMedQA, HealthBench, MedHELM, AfriMed-QA).
3. **Hugging Face Hub and GitHub**: health evaluation datasets and repos with no paper.
4. **Survey reference lists**: the references of every record screened as a survey or review, pulled from OpenAlex. New records go through the same screening.

API keys live in a gitignored `.env`: `OPENALEX_API_KEY` for OpenAlex and `OPENAI_API_KEY` for screening. Raw API responses are cached under `search/raw/`, so re-runs don't spend credits again.

English only. The site states this blind spot. No practitioner outreach in v1, so practice-built benchmarks are undercounted; the site says so and offers an issue form for implementers to submit theirs.

### Screening pipeline

1. Scripts retrieve records and remove duplicates by DOI, arXiv ID, or normalized title (no LLM).
2. A screening script sends titles and abstracts through the OpenAI Batch API on a small model (e.g., `gpt-5.4-mini`; final choice by current price), with the inclusion criteria above as the rubric. Each record gets one label with a reason: benchmark, eval framework, related guidance, survey or review, borderline, or exclude. When the model is unsure, it labels the record borderline instead of excluding it. Benchmarks and eval frameworks become entries; related guidance and surveys feed their README sections.
3. Claude Code agents read full text for borderline and included records, fill pass-1 fields, and spot-check a sample of exclusions. They also merge a paper, its dataset, and its code repository into one entry.

## Taxonomy

Built bottom-up from pass-2 terms.

1. Cluster the extracted terms into candidate constructs and domains.
2. Two agents review each cluster: a **proposer** (clinical informatics lens) drafts constructs, definitions, and term mappings; a **challenger** (primary-care or global-health clinician in a low-resource setting) argues against merges, splits, and constructs that only make sense in high-income health systems.
3. Claude reconciles and logs every disagreement and resolution in `taxonomy/decisions.md`.
4. Each term-to-construct mapping records a relationship (same / narrower / broader / partial) and a status (agreed / contested), shown on the site.

## Repository and site

Reuses the besci-skills conventions and tooling.

- One YAML file per entry (`entries/<slug>.yaml`) as the single source of truth, with a validator. The README and the site's detail pages are generated from the YAML.
- Datasets are linked, never re-hosted. Rubric files are copied into `rubrics/<slug>/` only where the license allows redistribution.
- Python tooling is a uv project.
- Code MIT, content CC BY 4.0.
- Static site in the besci-skills visual style, hosted on Vercel under the maintainer's account. Views:
  - **Catalog**: filterable cards with detail pages.
  - **Construct explorer**: for a construct, every framework's term mapped to it, with verbatim definitions side by side, relationship, and agreed/contested status.
  - **Frequency heatmap**: constructs by income group, health area, intended user, or eval method.
  - **Compare**: two or three entries' construct coverage side by side.
  - **World map**: where items came from.

### README layout

By eval type: Knowledge and exam QA; Open-ended and conversational; Safety, hallucination, and bias; Mental health; Multilingual and regional; Voice; Evaluation frameworks; Related guidance; Surveys and reviews. Every row has the same columns: name, year, languages, item-origin countries, income group, method, open data, builder type.

## Skills

Built last. Each entry is a YAML card, not a skill. A small set of verb-first skills works across the catalog, for example:

- `find-health-benchmarks`: given a chatbot, its users, country, and language, recommend benchmarks and constructs.
- `adapt-benchmark-rubric`: localize a rubric to a setting.
- `score-transcripts-with-rubric`: apply an open rubric (e.g., HealthBench's) to the user's own conversation logs.
- `run-open-benchmark`: run an open dataset through an existing harness (lm-evaluation-harness, HELM/MedHELM, OpenAI simple-evals).

Packaged as a Claude Code plugin, as besci-skills is.

## Build order

Breadth first:

1. Search and screen everything; fill pass-1 fields.
2. Ship the generated README.
3. Pass-2 term extraction on included entries.
4. Taxonomy with proposer and challenger agents.
5. Site.
6. Skills.

No scheduled re-runs in v1; the search scripts can be re-run by hand.
