# Review instructions (after pass 1)

Pass-1 agents worked fast and in parallel, so some entries rest on abstracts, some guess at access, and some stretch the scope. A review agent gets a list of entry IDs and checks each one against its sources.

## For each entry

1. **Scope.** Re-read "What counts as an entry" and "Scope" in `docs/plan.md`. Drop the entry if it is:
   - a one-off study whose items aren't released or described for reuse (`study_no_release`);
   - mainly out of scope: EHR documentation or coding, imaging, biomedical NLP, agent workflow or tool-use tasks with no health question answering or conversation, or a domain-general benchmark where health is a minor slice (`out_of_scope`);
   - a corpus, training set, model-output dump, or copy of another benchmark (`training_data`, `mirror`);
   - too thin: no paper and fewer than 50 items, or an empty or one-line card (`too_thin`, `not_found`).
2. **Facts.** If `read_full_text` is false, open the paper (paperclip, WebFetch, or `curl -sL`) or the dataset card and check `open_data`, `license`, item languages, item-origin and lead-institution countries, `item_provenance`, `eval_methods`, and `size`. Fix what is wrong, set `read_full_text: true` if you read it, and update `confidence` and `notes`. `open_data` and `license` must come from a link or statement you saw; otherwise `unknown` and null.
3. **Duplicates.** `uv run scripts/validate.py` reports entries that share a DOI, arXiv ID, or Hugging Face dataset. Merge them into the better entry: keep one file, combine `provenance.records` and links, and delete the other.

## Logging

Append one line per entry to `search/extraction/review-<your list name>.jsonl`:

```json
{"entry_id": "brie", "action": "keep" | "fixed" | "dropped" | "merged", "into": "", "reason": "", "read_full_text": true}
```

For `dropped`, delete `entries/<id>.yaml` and give the reason code plus a few words. For `merged`, give `into`. Before deleting an entry, `grep -l "<id>" entries/*.yaml` and remove it from any other entry's `adapted_from`.

Spend about three to five tool calls per entry. Edit only `entries/` and your review log. Never read or print `.env`, and don't run git. Run `uv run scripts/validate.py` at the end and fix every problem in the entries you touched.
