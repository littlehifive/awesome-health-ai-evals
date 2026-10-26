# Term extraction instructions (pass 2)

Pass 2 collects the evaluation terms each entry uses, as raw material for the construct taxonomy. Each agent gets a list of entry IDs and writes one file per entry, `terms/<entry-id>.yaml`, validated against `schema/terms.schema.json`.

## Which entries

Every entry except benchmarks scored only by multiple choice or exact match; those get a one-term file (accuracy) from `scripts/terms_mcq.py`, so don't write them by hand. Entries scored by automatic metrics are included, and their terms are the named metrics (BLEU, ROUGE-L, BERTScore).

## What a term is

Any named thing the entry judges a model's output on: an axis (HealthBench's "accuracy", "completeness"), a dimension or principle (QUEST's "trust"), a rubric criterion, a rating-scale item, a safety category, a harm type, or a named metric. Not task categories or topic areas (cardiology, pediatrics) unless the entry scores them as evaluation criteria.

For each term record:

- `term`: the name exactly as the source writes it.
- `level`: `axis`, `dimension`, `criterion`, `principle`, `metric`, `category` (for example a harm category), or `other`, as the source frames it.
- `parent`: the term it sits under, if the source nests them (criterion under axis).
- `definition`: the source's own definition, copied verbatim, with `definition_verbatim: true`. If the source gives no definition, write a one-sentence paraphrase of how it is used and set `definition_verbatim: false`.
- `location`: where it is defined (section, table, appendix, page, or URL anchor).
- `scale`: how it is scored if stated (`binary`, `1-5 Likert`, `points per rubric item`).

Record every term at the level the source defines. HealthBench, for example, has 5 axes and 7 themes plus thousands of example-specific rubric items: record the axes, the themes only if they are scored, and describe the example-specific items in `notes` rather than listing them.

## How

1. Read the entry file and its links. Find the evaluation section of the paper (for papers in paperclip: `$PC scan /papers/<id>/content.lines "rubric" "criteri" "dimension" "axis" "axes" "defin" "scale" "Likert"`, then `$PC cat` around the hits), or the rubric file in the GitHub repo or dataset card.
2. Write `terms/<entry-id>.yaml`:

   ```yaml
   entry: healthbench
   sources: [https://arxiv.org/abs/2505.08775]
   extracted: 2026-10-26
   terms:
     - term: Accuracy
       level: axis
       definition: "..."
       definition_verbatim: true
       location: Section 2.2, Table 1
       scale: points per rubric criterion
   notes: 48,562 example-specific rubric criteria, each tagged with one axis.
   ```

3. Run `uv run scripts/validate.py 2>&1 | grep "<entry-id>"` and fix problems in your files.

Spend about four tool calls per entry. Don't edit files outside `terms/`. `$PC` is defined in `docs/extraction.md`. Never read or print `.env`, and don't run git.
