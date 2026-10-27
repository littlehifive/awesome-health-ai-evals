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

Everything in scope is included, except dataset-only uploads with no paper and fewer than 50 items (added during the build, after one uploader's stream of 10-20-row sets). Each card shows signals instead of a cutoff: OpenAlex citations, Hugging Face downloads, open data, and uptake in model reports. A hand-picked "featured" tier leads the README.

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
2. A screening script sends titles and abstracts through the OpenAI Batch API on a small model (`gpt-6-luna`), with the inclusion criteria above as the rubric. Each record gets one label with a reason: benchmark, eval framework, related guidance, survey or review, borderline, or exclude. When the model is unsure, it labels the record borderline instead of excluding it. Benchmarks and eval frameworks become entries; related guidance and surveys feed their README sections.
   - Added during the build: the first pass kept about 30% of records, too many to read in full, so a second, stricter pass re-screens the kept records with a larger model (`gpt-6.1-sol`). It excludes one-off studies that release nothing, and it keeps borderline only for substantial test sets whose release is unclear. Public health QA or dialogue datasets in languages other than English, or from LMICs, stay borderline rather than being excluded as training data. A record's decision is its strict label when it has one.
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
- Static site, hosted on Vercel at https://awesome-health-ai-evals-iota.vercel.app. Plain HTML, CSS and ES-module JavaScript with no Node build step (Docusaurus was considered on 2026-10-26 and rejected: the problems were structure and design, not framework). It has its own look (a personal project, not Agency Fund branding), redesigned on 2026-10-26 along the lines of Our World in Data's evidence-first style: warm paper, ink text, one deep blue for data and for things you can click, Source Serif 4 for titles and Source Sans 3 for everything else (self-hosted in `site/src/fonts`), hairlines instead of boxes, one 3px radius, no shadows, light and dark. Views:
  - **Home**: the headline, the map (hover for counts, click for a country's entries), and four numbers. Nothing that lives in another tab. The map had its own tab until 2026-10-27; `#/map` now redirects home.
  - **Catalog**: a calm filter rail (type, origin, health area, who it's for, how it's scored, then "More filters"), search above the results, cards or a list, an active-filter bar, a banner when another view set the filters, and adaptations grouped under their original. Each card carries what a reader compares on: where the questions come from, languages, who it's for, how it's scored, size, data access, and the domains it judges, with Details and Compare buttons.
  - **Entry pages**: a model-card template borrowed from BenchmarkCards, the Hugging Face dataset card and Datasheets for Datasets. Sections in a fixed order (what it tests, what's in it, how answers are scored, access and license, who built it, related entries including computed similar entries, sources), each fact shown once, with the table of contents in the rail. The prose facts (task, how the items were made, an example item, the scoring procedure, the judge, the scale, how the judging was checked against people, the headline result, the authors' own limitations) come from each entry's `card` block, written by `scripts/build_cards.py` from the paper, dataset card or README; an empty field shows as "Not stated in the source" so every entry has the same rows. Scoring terms are one table per entry, nested as the source nests them, with definitions in quotation marks when they are the source's own words. No confidence grade: the Sources section names the documents and the extraction date instead.
  - **Constructs**: a Browse view (a treemap of the 13 domains and 76 constructs, then a ruled list by domain) and a Matrix view (the former Coverage heatmap). `#/coverage` redirects to the matrix.
  - **Compare**: up to three entries in fixed colour-and-shape slots, chosen by typing or from a list; cells name each entry's own term, and the popover quotes its definition with the match type in plain words.
  - **Glossary**: domain terms only, A to Z with search, from `data/glossary.yaml`. The website's own label help lives in `data/labels.yaml` and shows as dotted-underline popovers.
  - **About**: the same story as the README, from `data/about.yaml`, which `scripts/build_readme.py` also renders; headline numbers come from `scripts/counts.py` for both.
- Display labels are plain language (for example "LMIC" for the native-LMIC grounding label and "Region" for WHO region). Data values in the entries stay as they are, so the skills' reference catalog doesn't change.
- Design directions considered on 2026-10-26 are kept as mockups in `site/design-demos/` (not deployed; the build copies `site/src` only). Direction C was chosen.

### README layout

The README describes what the catalog is and how it was built (a flowchart and one paragraph per stage), lists the 13 featured entries, and sends readers to the website for everything else. It has no entry tables. Related guidance and surveys moved to the site's About page.

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

No scheduled re-runs in v1. `docs/updating.md` gives the order for a re-run by hand; every stage that calls a model skips the work recorded in its committed index.

## Status (2026-10-26)

All six build steps have a first version.

1. **Search and screen.** 27,750 records were screened in two stages. Extraction produced 994 entries, and review agents re-checked the weakest of them.
2. **README.** Generated by `scripts/build_readme.py`: the process, the 13 featured entries, and links to the site.
3. **Pass 2.** 818 terms files, about 5,950 terms. These cover every framework and every benchmark scored by rubric, expert rating, multi-turn simulation, or real-user data. Multiple-choice-only benchmarks get a generated "Accuracy" term. On 2026-10-27 a third pass (`scripts/build_cards.py`, one structured request per entry to the OpenAI API, from the paper text in paperclip, the dataset card and the README) wrote each entry's `card` block: task, how the items were made, an example item, the scoring procedure, judge, scale, validation against people, headline result and the authors' stated limitations.
4. **Taxonomy.** `taxonomy/constructs.yaml` has 13 domains and 76 constructs, 3 of them contested. It was reconciled from the proposer's draft and the challenger's 18 objections, and the decisions are in `taxonomy/decisions.md`. Every term is mapped to constructs by `scripts/map_terms.py`. One change from the targets above: there are 13 domains rather than 8 to 12, because measured effects on users got their own domain.
5. **Site.** `site/src` is built by `scripts/build_site.py` into `site/dist` and deployed on Vercel. It was redesigned on 2026-10-26 (see Repository and site).
6. **Skills.** `skills/` has four draft skills with evals, packaged as a Claude Code plugin (`.claude-plugin/`). Their reference catalog is rebuilt with `scripts/build_skills_data.py`.

Not done:
- Copying rubric files into `rubrics/<slug>/`. Each one needs its license checked first.
- Recording, per term, whose guideline or standard of care the reference represents (see `taxonomy/decisions.md`).
- Human review of the skills.
