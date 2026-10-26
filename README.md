# awesome-health-ai-evals

A map of health benchmarks and evaluation frameworks for generative-AI chatbots, with attention to where the evidence comes from: low- and middle-income countries (LMICs) as well as high-income ones.

> **Work in progress.** The search is done; screening and data extraction are under way. Once entries exist, this README is regenerated from them by `scripts/build_readme.py`, with one table per evaluation type.

This is an exploratory catalog, not a systematic review. Screening and data extraction are LLM-assisted, so expect some errors; each entry will record how confident its extraction is.

## What will be here

- **Benchmarks**: test items plus a scoring method, released or described for reuse, where a model answers health questions or converses about health, in text or voice, for patients, the public, community health workers, nurses, midwives, or clinicians.
- **Evaluation frameworks**: rubrics or frameworks for judging a model's health outputs, with or without a dataset.
- **Related guidance** and **surveys and reviews**, listed for reference.

Each entry records facts, not labels: item languages, where the items came from, who rated them, whether they were written natively, adapted, or translated, who built them, and how they are scored. Income group (World Bank) and WHO region are derived from the country codes. The full scope and decisions are in [`docs/plan.md`](docs/plan.md).

## Status

| Step | Status |
|---|---|
| Search: OpenAlex (keywords plus citations of 11 anchor benchmarks), paperclip (arXiv, medRxiv, PMC, abstracts), Hugging Face, GitHub | Done: 34,283 hits, 17,087 unique records |
| Title and abstract screening (OpenAI Batch API) | Next |
| Survey and review reference lists | After screening |
| Full-text reading and entry extraction (Claude agents) | After screening |
| Generated README | After extraction |
| Construct taxonomy, site, and skills | Later |

## Repository layout

```
docs/plan.md            scope and decisions
search/queries.yaml     every search query, by track
search/log.csv          hit count for each query
search/records.csv      de-duplicated records (metadata only)
search/screening.csv    screening label and reason for each record (after screening)
entries/<id>.yaml       one file per benchmark or framework (after extraction)
schema/                 entry schema and field guide
data/countries.csv      World Bank income groups and WHO regions, pinned
scripts/                search, dedup, screening, validation, and build scripts
```

## Running the pipeline

Requires [uv](https://docs.astral.sh/uv/) and, for some steps, the [paperclip](https://paperclip.gxl.ai) CLI and `gh`. API keys go in a gitignored `.env`: `OPENALEX_API_KEY` and `OPENAI_API_KEY`.

```sh
uv run scripts/search_openalex.py      # OpenAlex keyword and citation search
uv run scripts/search_paperclip.py     # paperclip semantic search
uv run scripts/search_hf_github.py     # Hugging Face datasets and GitHub repos
uv run scripts/dedup.py                # merge into search/records.csv
uv run scripts/screen.py submit        # batch screening; then: screen.py collect
uv run scripts/search_survey_refs.py   # reference lists of screened surveys
uv run scripts/validate.py             # check entries/*.yaml
uv run scripts/fill_signals.py         # citations, downloads, stars
uv run scripts/build_readme.py         # regenerate this README
```

API responses are cached under `search/raw/` (gitignored), so re-runs don't repeat requests.

## Known gaps

- **English-language search only.** Benchmarks described only in other languages are likely missing.
- **Practice-built evaluations are undercounted.** Eval sets that implementers build for their own chatbots are rarely published. If you have one you can share, even as a description, please open an issue.
- **LLM-assisted screening and extraction.** Corrections are welcome.

## License

Code is MIT ([`LICENSE`](LICENSE)). Content (entries, data, and documentation) is CC BY 4.0 ([`LICENSE-CONTENT.md`](LICENSE-CONTENT.md)). Datasets are linked, not re-hosted; each keeps its own license.
