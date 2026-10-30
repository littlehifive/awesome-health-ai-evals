# Extraction instructions (pass 1)

These are the instructions given to each Claude extraction agent. Each agent gets one batch file, `search/work/rounds/rN/bXXX.jsonl`, with one candidate per line. A candidate groups screened-in records that seem to describe the same benchmark: a paper, its preprint, its Hugging Face dataset, its GitHub repo.

## For each candidate

1. **Read the sources.** Check enough of the full text to fill the fields; don't read whole papers. Every entry needs at least one look at a primary source beyond the abstract (the paper, the dataset card, or the README); `read_full_text: false` is for sources that can't be reached, not a shortcut.
   - Papers in paperclip (`paperclip_id` set, or an arXiv ID): `$PC scan /papers/<id>/content.lines "dataset" "available" "license" "github" "huggingface" "language" "country" "annotat"`, then `$PC cat /papers/<id>/content.lines --lines A-B` around the hits. arXiv IDs are `arx_<id>`.
   - Other papers: WebFetch the arXiv abstract page, the DOI landing page, or the PMC page (if WebFetch isn't loaded, load it with ToolSearch `select:WebFetch`). `curl -sL` works for many landing pages too. Many PMC articles are in paperclip as `/papers/PMC<id>/content.lines`.
   - Hugging Face datasets: `curl -s https://huggingface.co/datasets/<org>/<name>/raw/main/README.md | head -150`.
   - GitHub repos: `gh api repos/<owner>/<repo>/readme -H "Accept: application/vnd.github.raw" | head -150`.
   - `$PC` is `uv run -q --no-project --python 3.12 --with requests,pyyaml,click,rookiepy python ~/.local/bin/paperclip`. If paperclip reports a rate limit, wait 60 seconds and retry.

2. **Decide.** It is an entry if it is in scope (a model answers health questions or converses about health in natural language, in text or voice, for patients, the public, community health workers, nurses, midwives, or clinicians; not radiology or pathology image question answering, EHR documentation and coding, biomedical NLP, or drug discovery) and is either
   - a **benchmark**: test items plus a scoring method, released or described for reuse; or
   - an **evaluation framework**: a framework or rubric for judging a model's health outputs.

   Otherwise exclude it, with one of these reasons: `study_no_release` (a one-off evaluation that releases no reusable set or rubric), `out_of_scope` (imaging, EHR documentation, biomedical NLP, drug discovery, not health), `training_data`, `model_or_method`, `mirror` (a copy or subset of another benchmark; name it), `survey`, `guidance`, `pre_2019` (released before 2019 and not widely used for LLM evaluation), `too_thin` (a dataset-only upload with no paper and fewer than 50 items), `not_found` (sources can't be reached and the abstract is too thin).

   A dataset mirror or a paper's companion repo is not a separate entry: add its links and record IDs to the main entry. A translation or adaptation by a different team is its own entry, with `adapted_from`.

   A record's Hugging Face dataset is sometimes not the paper's own: dedup merges a dataset into any paper its card cites. Check that a dataset belongs to the benchmark before listing it in `links`, and note strays in `provenance.notes`.

3. **Check for an existing entry.** Other agents work in parallel. Before writing, `ls entries/` and `grep -il "<name>" entries/*.yaml`. If the benchmark already has an entry, add your record IDs to its `provenance.records` and any missing links; don't create a second file. If `entries/<id>.yaml` exists for a different benchmark, pick a more specific `id`.

4. **Write `entries/<id>.yaml`** following `schema/README.md` exactly, and put double quotes around any string that contains `: ` or ` #` (notes often do). Record only what the sources say:
   - Use `UNKNOWN` for countries the sources don't state, and say what's missing in `provenance.notes`.
   - Don't infer item-origin countries from author affiliations. Exam questions come from the exam's country; forum questions from the forum's country if stated.
   - `provenance.confidence`: `high` if you read the relevant parts of the full text, `medium` for abstract plus dataset card, `low` when key fields are guesses or unknown.
   - `license`: only a license you saw on the dataset card, repository, or paper's data-availability statement; otherwise null.
   - `open_data`: `open` or `gated` only from a download link or access statement you saw; otherwise `unknown` (or `described_only` for a framework with no items). Never take it from the screening label.
   - Leave out `signals`; a script fills it.

5. **Validate.** Run `uv run scripts/validate.py 2>&1 | grep "<your entry ids>"` and fix every problem in your files.

6. **Log the decision.** Append one JSON line per candidate to `search/extraction/rN-bXXX.jsonl` (named after your batch file):

   ```json
   {"cid": "r1-c0012", "decision": "entry", "entry_id": "medqa", "reason": "", "read_full_text": true}
   ```

   `decision` is `entry` (new file), `merged` (added to an existing entry; give its `entry_id`), or `exclude` (give the `reason` code and a few words).

## Limits

A Hugging Face dataset or GitHub repo with no paper needs one call: read the card or README. Make it an entry only if the card describes test items and how to score them for an in-scope task, with at least 50 items; exclude it as `too_thin` if it has fewer (a stream of tiny datasets from one uploader is typical), and exclude it if the card is empty, is a copy of another benchmark (`mirror`), or holds model outputs, training data, or agent traces. Don't search for a paper that the card doesn't link.

The entries already in `entries/` (for example `healthbench.yaml`, `afrimed-qa.yaml`, `quest.yaml`, `medmcqa.yaml`) show the expected level of detail.

Spend about four to six tool calls per candidate, so 60 to 90 for a batch of 15; go further only for benchmarks that are clearly in scope and missing key facts. Don't edit files outside `entries/` and `search/extraction/`. Never read or print `.env`, and don't run git. Finish every candidate in the batch, then report: entries created, merged, excluded, and anything that needs a human look.
