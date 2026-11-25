# Updating the catalog

What to run when new benchmarks and frameworks appear, and why each step only pays for new work.

Every stage that calls a model keeps its "already done" set in a committed file, so a re-run sends only
new records, candidates, entries or terms. This holds on a fresh checkout too. The gitignored
`search/raw/` (API responses) and `search/work/` (full records with abstracts, batch inputs and
results) are caches: losing them costs time and free API calls, never model calls.

Record IDs are content hashes (DOI, arXiv ID, OpenAlex ID, PMC ID, Hugging Face ID, repo, or the
normalized title), so a record keeps its ID across runs and the indexes below stay valid.

## Order

1. **Search.** `uv run scripts/search_openalex.py`, `search_paperclip.py`, `search_hf_github.py`,
   then `search_survey_refs.py`. Queries live in `search/queries.yaml`; `search/log.csv` records
   each query's date and hit count, replacing the earlier row. Responses are cached in `search/raw/`.
2. **Dedup.** `uv run scripts/dedup.py` merges every track into one record per work and writes
   `search/records.csv` (committed, no abstracts) and `search/work/records.jsonl` (with abstracts).
3. **Screening.** `uv run scripts/screen.py submit --stage title_abstract`, `collect`, then
   `submit --stage strict`, `collect`. Skips every record in `search/screening.csv`, which holds
   each record's latest label with the stage, model and prompt that produced it. A record with a
   strict decision is skipped at both stages. A new prompt name in `STAGES` re-screens the records
   that never reached the strict stage.
4. **Candidates.** `uv run scripts/candidates.py --round N`, with N one past the last round in
   `search/candidates.csv`. Records already grouped in an earlier round, per that file, are skipped.
5. **Extraction.** Agents work the batches in `search/work/rounds/rN/` as `docs/extraction.md`
   says, logging one decision per candidate in `search/extraction/rN-bXXX.jsonl` and writing
   `entries/*.yaml` with `provenance.records`. `uv run scripts/extraction_status.py` shows progress.
6. **Review.** `uv run scripts/review_lists.py` lists the weak entries with no row yet in
   `search/extraction/review-*.jsonl`; agents follow `docs/review.md`.
7. **Terms.** `uv run scripts/terms_mcq.py` writes the generated Accuracy term for multiple-choice
   entries (only files it generated are rewritten). `uv run scripts/pass2_lists.py` lists entries
   with no `terms/<id>.yaml`; agents follow `docs/pass2.md`.
8. **Taxonomy.** `uv run scripts/cluster_terms.py` re-clusters every term (embeddings are cached
   per text, and the step is cheap). Re-clustering renumbers the clusters; after a small addition
   use `--append`, which adds the new terms and leaves the clusters alone. `uv run scripts/map_terms.py` maps only the terms with no
   mapping in `taxonomy/constructs.yaml`. Its `mapping_key` records the constructs and model the
   mappings came from; a change to either, or `--all`, re-maps every term. Review new constructs
   against `taxonomy/decisions.md` if the clusters shift.
9. **Cards.** `uv run scripts/build_cards.py fetch`, then `submit` and `collect` (or `run` for
   minutes instead of hours at twice the price), then `apply`; repeat with `--pass scoring` for
   the two rating fields. An entry whose card already carries the pass's fields is skipped;
   `--force` redoes the given IDs. Source bundles are cached in `search/raw/cards/`.
10. **Signals and related work.** `uv run scripts/fill_signals.py` refreshes citations, downloads
    and stars for every entry from cached responses. `uv run scripts/build_related.py` rebuilds
    `data/related.yaml` from the screening decisions.
11. **Check and build.** `uv run scripts/validate.py`, `build_site.py`, `build_readme.py`,
    `build_skills_data.py`.

## Adding entries by hand

Some benchmarks never reach the search: a program publishes them on its own website, with no paper,
dataset card or repository to find. The nine Global Health AI Benchmarks entries were added this way
on 2026-11-25. No model calls are needed except the term mapping.

1. **Entry.** Write `entries/<id>.yaml` as `docs/extraction.md` says, with `provenance.records: []`
   and a note saying where the facts came from. Check every link and set `open_data` from what you
   can reach today, not from what a report plans. Write the `card` block by hand from the source:
   `build_cards.py` fetches only papers, Hugging Face cards and GitHub READMEs, and it skips an
   entry whose card is already filled.
2. **Terms.** Write `terms/<id>.yaml` as `docs/pass2.md` says.
3. **Log.** Add one line per entry to `search/extraction/manual-<source>.jsonl` with the entry id
   and the page it came from.
4. **Constructs.** `uv run scripts/cluster_terms.py --append` adds the new terms to
   `taxonomy/terms.jsonl` without re-clustering, so the cluster ids cited in `taxonomy/decisions.md`
   stay valid. Then `uv run scripts/map_terms.py` maps them (a few requests). Read the new mappings
   and correct any that are wrong in `taxonomy/constructs.yaml`.
5. **Featured sets.** To list entries together under "Start here" in the README and on the About
   page, set `featured: true` on each and add the set to `collections` in `data/about.yaml`.
6. **Check and build.** Step 11 above.

The headline counts treat an entry with no screening record as added by hand.

## Where each stage's state lives

| Stage | Committed (the done-set) | Local cache (gitignored) |
|---|---|---|
| Search | `search/queries.yaml`, `search/log.csv` | `search/raw/<track>/`, `search/work/<track>.jsonl` |
| Dedup | `search/records.csv` | `search/work/records.jsonl` |
| Screening | `search/screening.csv` | `search/work/screen_results.jsonl`, batch inputs |
| Candidates | `search/candidates.csv` | `search/work/rounds/` |
| Extraction, review | `search/extraction/*.jsonl`, `entries/*.yaml` | |
| Terms | `terms/*.yaml` | |
| Taxonomy | `taxonomy/constructs.yaml` (`mappings`, `mapping_key`), `taxonomy/terms.jsonl` | `search/raw/map_terms/`, `search/work/term_embeddings.npz` |
| Cards | `card` block in `entries/*.yaml` | `search/raw/cards/`, `search/work/cards_results.jsonl` |
| Signals | `signals` block in `entries/*.yaml` | `search/raw/openalex/`, `search/raw/hf/`, `search/raw/github/` |
