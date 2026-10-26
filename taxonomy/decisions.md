# Taxonomy decisions

How `taxonomy/constructs.yaml` was reconciled from the proposer's draft (`taxonomy/proposal.yaml`: 12 domains, 73 constructs, clinical-informatics lens) and the challenger's objections (`taxonomy/challenge.md`: 18 objections, primary-care and global-health clinician lens in a low-resource setting). Claude did the reconciliation on 2026-10-26. The result has 13 domains and 76 constructs, 3 of them contested.

This is an exploratory, LLM-assisted taxonomy, not an adjudicated one. "Contested" marks constructs where the evaluations in the catalog disagree on what counts as a good output, so scores under that construct are not comparable across entries without reading how each one defines it.

Before reconciling, Claude spot-checked the challenger's cluster claims against `taxonomy/terms.jsonl` (k1001, k713, k1974, k1605, k112, k1627, k231). All seven matched what the challenger said.

## Accepted challenger objections

| # | Construct | Decision |
|---|---|---|
| 1 | `local_context_fit` | Accepted. Removed three mis-mapped clusters: k1974 went to `evaluator_reliability`, k994 to `user_outcomes`, and k1662 to `ethical_conduct`. Added the LMIC clusters that had been left out (k1001 HealthBench "Global health", k1744, k1746, k1189, k797, k1127, k1187, k935, k048). Broadened the definition to cover availability, formulations, cost, distance, and local disease patterns. |
| 2 | new `national_protocol_adherence` | Accepted. Split from `guideline_adherence`. Matching a US or European guideline while contradicting the national standard treatment guideline is a different error, and evaluations score it separately (indian-protocols k334, Kazakh protocols k372 and k139, Uganda Clinical Guidelines k713 and k1977, Brazil dietary guidelines k934, alama immunization schedule k1186). `guideline_adherence` now covers named international or specialty guidelines. |
| 3 | `emergency_escalation` | Accepted. Redefined so that it penalizes over-escalation as well as under-escalation, holds the advice under pushback, and covers danger signs. Rubrics that require "call 911" or "go to the ED" are treated as narrower versions, valid only where those services exist. |
| 4 | `triage_accuracy` | Accepted. Split into `acuity_classification` (ESI and Manchester scales, ED disposition) and a new `care_level_disposition` (self-care, primary care, or hospital; manage here or refer up). The second is the decision patients and CHWs actually face. |
| 5 | `referral_appropriateness` | Accepted. Renamed "Referral destination and signposting". Generic "see a doctor" advice no longer satisfies it, department routing is marked narrower, and crisis lines count only where they exist and are staffed. Whether to refer at all moved to `care_level_disposition`. |
| 6 | `safety_netting` | Accepted. Kept the construct. Moved out k1177 (to `crisis_response`) and k1852 (to `user_outcomes`), and moved the medbench-v5 follow-up-question term (k599) to `clarification_seeking`. Added conditional escalation advice (k437) and follow-up and continuity terms (k298, k797). |
| 7 | `scope_boundaries` | Accepted and marked **contested**. Scope is now relative to the deployment's role and the intended user's scope of practice. Disclaimer terms moved to `accountability_compliance`. Generic refusal and redirect (k112) is counted only under `over_refusal_avoidance`. |
| 8 | `test_stewardship` | Accepted and marked **contested**. Renamed "Appropriate test use and cost of care". Monetary cost of care moved here from `efficiency_cost`, which now covers only compute cost and latency. k792 moved to `completeness`. |
| 9 | `treatment_management` | Accepted. Appropriateness is judged against the standard of care that applies to the setting, not a high-resource first line. |
| 10 | `demographic_fairness` | Accepted and marked **contested**. Wealth, insurance, and location are now named as fairness axes. k1746 moved to `local_context_fit`. Withholding resources and omitting structural causes were added (k1352, k1353). |
| 11 | `cultural_appropriateness` | Accepted. The invariance-to-cultural-cues tests (k961, k1296) moved to `perturbation_robustness`. Handling traditional health beliefs and myths was added (k1261, k1689, k870, k1413, k1503). |
| 12 | `multilingual_parity` | Accepted. Renamed "Parity across languages and literacy". It now covers safety parity, code-mixed input, and colloquial input. The medisafe-gh Twi safety-degradation score (k1605) moved here from `adversarial_robustness`, because speakers of low-resource languages are users, not attackers. |
| 13 | `readability` | Accepted. Readability is defined by comprehension for the intended reader in their language. Grade-level formulas are a narrower, English-only proxy. |
| 14 | `audience_tailoring` | Accepted. It now covers frontline health workers (CHWs, nurses), not only lay people versus clinicians. |
| 15 | new `prevention_health_education` | Accepted as a construct in `helpfulness`. Its clusters are small (k1627, k1416, k1417, k1051, k1724, k742), but prevention and health education are a large part of primary care and community health work, and `completeness` does not capture them. Term mapping will show whether it attracts more terms. |
| 16 | `user_outcomes` | Accepted. Moved to a new domain, `real_world_use` ("Real-world use and effect"), together with `usability_workflow`. The old operational domain is now "Evaluation method and system performance". This gives 13 domains, one more than the 8 to 12 targeted, because placing measured health effects beside token counts hid how few entries measure them. |
| 17 | `evaluator_reliability` | Accepted. The definition now includes whether judges and rubrics stay valid in the evaluated language and setting (k1974, k128, k342). |
| 18 | unassigned LMIC clusters | Accepted. Assigned k1977, k1745, k1510, k1182, k1013, k1017, and k1495 as proposed. k915 is a set of topic labels, not a construct. |

## Proposer calls kept

The challenger agreed with all six calls the proposer flagged:

- `reference_similarity` stays separate from `factual_accuracy`.
- `harmful_validation_avoidance` stays separate from `sycophancy_resistance`.
- `crisis_response` stays separate from triage and escalation.
- `local_context_fit` and `safety_netting` are kept despite small clusters.
- `retrieval_quality` stays in the operational domain.
- Scope behavior stays separate from over-refusal.

## Not done

- The challenger asked that mapped terms record whose guideline or standard of care the reference represents (objections 2 and 9). The term files don't capture this consistently, so it is left for a later pass.
- Cluster lists in `constructs.yaml` are documentation only. Each term is mapped to constructs individually by `scripts/map_terms.py`, so a mixed cluster (for example k112) does not force all its terms into one construct.
