# Taxonomy instructions

The construct taxonomy is built bottom-up from the evaluation terms entries use (pass 2, `terms/`). Steps:

1. `uv run scripts/cluster_terms.py` embeds every term with its definition and clusters them (`taxonomy/clusters.yaml`, `taxonomy/terms.jsonl`).
2. A **proposer** agent drafts domains and constructs from the clusters (`taxonomy/proposal.yaml`).
3. A **challenger** agent argues against the draft (`taxonomy/challenge.md`).
4. The draft and the challenge are reconciled into `taxonomy/constructs.yaml`, and every disagreement and its resolution goes in `taxonomy/decisions.md`.
5. `uv run scripts/map_terms.py` maps every term to a construct with a relationship (same, narrower, broader, partial); mappings to contested constructs are marked contested.

A construct is a quality of a model's output or behavior that evaluations judge (for example factual accuracy, safety of advice, empathy, appropriate referral). Not a task (diagnosis, triage) or a topic (cardiology), unless evaluations judge it as a quality.

## Proposer

Lens: clinical informatics. Read `search/work/cluster_digest.txt` in full (a compact view of `taxonomy/clusters.yaml`; regenerate it with `uv run scripts/cluster_terms.py`). Clusters are ordered by how many entries use them, and those spanning two or more entries matter most. Skim the singleton clusters for qualities the larger ones miss. Look up a cluster's full term list in `taxonomy/clusters.yaml` or `taxonomy/terms.jsonl` (grep by cluster id) when the digest isn't enough.

Write `taxonomy/proposal.yaml`:

```yaml
domains:
  - id: correctness            # snake_case
    name: Correctness and knowledge
    description: One sentence.
constructs:
  - id: factual_accuracy
    name: Factual accuracy
    domain: correctness
    definition: One or two sentences, in your own words, broad enough to cover the terms mapped to it.
    clusters: [k001, k014]     # clusters whose terms mostly belong here
    example_terms: ["Accuracy (afrimed-qa)", "Correctness (healthbench)"]
```

Aim for 40 to 80 constructs in 8 to 12 domains. Every cluster spanning three or more entries should belong to at least one construct. Keep constructs distinct: if two would take mostly the same terms, merge them; if one would hide a difference that evaluations treat as separate (for example harm avoidance versus refusal behavior), split it.

## Challenger

Lens: a primary-care or global-health clinician working in a low-resource setting. Read `taxonomy/proposal.yaml` and `search/work/cluster_digest.txt` (grep `taxonomy/terms.jsonl` by cluster id for detail).

Write `taxonomy/challenge.md`, one section per objection:

- **Construct** (id, or "new"), **objection**, **proposed change**.
- Argue against merges that hide differences that matter for patients, splits that are artificial, and constructs that only make sense in high-income health systems (for example ones that assume specialist referral, imaging, or 24-hour emergency care is always available).
- Name qualities the clusters show but the draft misses, especially ones that matter where resources are scarce: advice that fits the resources and medicines actually available, adherence to local or national guidelines, language and literacy fit, cultural appropriateness, cost, and referral to care that exists.
- Don't invent constructs no cluster supports; cite cluster IDs.

Edit only your output file. Never read or print `.env`, and don't run git.
