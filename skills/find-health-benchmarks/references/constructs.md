# Construct taxonomy

What health-AI evaluations judge, built bottom-up from the terms catalog entries use (see the repository's `taxonomy/` and `docs/taxonomy.md`). Entries = catalog entries with at least one term mapped to the construct. Contested constructs are ones where evaluations disagree on what counts as a good output; read each entry's definition before comparing scores.

## Correctness and knowledge

Whether the medical content of a response is true, current, in line with guidelines, and close to expert reference answers.

- **Medical knowledge on exam-style items** (`exam_knowledge`, 294 entries): Answers closed-form knowledge questions (multiple-choice, true/false, short exam items) correctly. Covers accuracy, exact-match and F1 scoring on such items.
- **Factual accuracy of free-text content** (`factual_accuracy`, 232 entries): Statements in a free-text answer are medically correct and consistent with established knowledge and scientific consensus, with no false claims.
- **Guideline and standard-of-care concordance** (`guideline_adherence`, 44 entries): Recommendations agree with a named clinical guideline, protocol or standard of care, typically an international or specialty guideline (for example WHO, NICE, GINA).
- **National and local protocol adherence** (`national_protocol_adherence`, 6 entries): Recommendations follow the national or institutional protocol in force in the user's setting (first-line drug, regimen, dosing, schedule), including choosing the right jurisdiction's guideline when several exist.
- **Up-to-date knowledge** (`knowledge_currency`, 26 entries): Content reflects current evidence and guidance rather than superseded treatments, tests or recommendations.
- **Similarity to reference text** (`reference_similarity`, 120 entries): How closely generated text matches an expert reference answer, summary or rationale in wording or meaning, as scored by overlap or embedding metrics such as ROUGE, BLEU or BERTScore. A proxy for content fidelity, not a direct judgment of correctness.

## Grounding, honesty and uncertainty

Whether a response sticks to what its sources and evidence support, admits what it does not know, and holds a correct position under user pressure.

- **Avoidance of fabrication** (`hallucination_avoidance`, 82 entries): Does not invent facts, findings, values, procedures or other content that has no basis in the input or in medical knowledge.
- **Faithfulness to sources and context** (`source_faithfulness`, 108 entries): Content stays consistent with the documents, records, retrieved passages or conversation it was given, without contradicting, distorting or ignoring them.
- **Citation and evidence support** (`citation_quality`, 59 entries): Cited sources are real, relevant and actually support the claims attached to them, and claims rest on credible evidence.
- **Uncertainty acknowledgment and abstention** (`uncertainty_communication`, 63 entries): Recognizes when evidence or information is insufficient, says so in proportionate language, avoids overconfident claims, and abstains or defers when it cannot answer reliably.
- **Confidence calibration** (`confidence_calibration`, 11 entries): Stated or computed confidence matches how often the model is actually right, as measured by calibration error, Brier score or confidence-accuracy agreement.
- **Resistance to sycophancy and false premises** (`sycophancy_resistance`, 32 entries): Keeps to the correct clinical position when the user asserts false claims, invokes authority or pushes back, and corrects false premises instead of going along with them.
- **Explainability and verifiability** (`reasoning_transparency`, 47 entries): Explains how a conclusion was reached in a way a reader can check, and the stated reasoning reflects what actually drove the answer.

## Clinical reasoning and decisions

How well the model makes the clinical judgments evaluations ask of it (diagnosis, management, triage, test selection, calculation, labelling) and how sound its reasoning is.

- **Diagnostic accuracy** (`diagnostic_accuracy`, 118 entries): Reaches the correct diagnosis, or ranks it near the top, when compared with a reference diagnosis.
- **Differential diagnosis quality** (`differential_diagnosis`, 37 entries): Considers an appropriately broad, plausible and well-prioritized set of alternative diagnoses, including dangerous conditions that must be ruled out.
- **Treatment and management appropriateness** (`treatment_management`, 75 entries): Recommends a management plan that is clinically appropriate, specific and feasible under the standard of care that applies to the setting; departing from a reference plan counts as an error only when the setting does not warrant it.
- **Acuity classification** (`acuity_classification`, 13 entries): Assigns the correct level on a scored acuity scale (for example ESI or Manchester) or the correct emergency-department disposition, with over- and under-triage often tracked separately.
- **Appropriate test use and cost of care** (`test_stewardship`, 35 entries) (contested): Recommends the investigations that would change management, from those actually available, and avoids unnecessary, low-value, invasive or unaffordable ones; reaches a decision without tests when that is the realistic option. Includes the monetary cost of the care recommended.
- **Clinical reasoning quality** (`reasoning_quality`, 111 entries): Reasoning is logically valid, uses the case evidence, follows a sound stepwise process, and avoids errors such as anchoring, premature closure and hindsight bias.
- **Numerical and calculation accuracy** (`calculation_accuracy`, 15 entries): Performs clinical calculations, unit conversions and numeric reporting correctly.
- **Clinical labelling and extraction accuracy** (`clinical_classification`, 79 entries): Correctly assigns labels, codes or categories to clinical text or conversations, and extracts the right structured information from them.

## Consultation and dialogue conduct

How the model behaves over a multi-turn consultation, from gathering and clarifying information to remembering context and working efficiently.

- **History taking and information gathering** (`history_taking`, 58 entries): Elicits the information needed for a clinical judgment, covering key symptoms, history and context in a sensible order.
- **Context seeking and clarification** (`clarification_seeking`, 31 entries): Notices ambiguous, missing or contradictory information and asks targeted questions or flags the gap before answering, rather than guessing.
- **Consultation efficiency** (`inquiry_efficiency`, 30 entries): Reaches a sound conclusion without unnecessary turns, repeated questions or wasted steps.
- **Context retention across turns** (`conversational_memory`, 26 entries): Remembers and correctly uses details shared earlier in the conversation or in prior sessions, stays coherent across turns, and tracks changes in the patient's state.
- **Role-play and simulation fidelity** (`simulation_fidelity`, 29 entries): When the model plays a patient or another assigned role, it stays consistent with the persona and case facts and behaves realistically.

## Safety and harm avoidance

Whether the model avoids advice that could hurt someone, recognizes emergencies and crises, routes people to care, and refuses or stays in scope appropriately.

- **Harm avoidance in advice** (`harm_avoidance`, 235 entries): Avoids advice or content that could plausibly harm a person who acts on it. Includes overall safety ratings and graded harm-severity scales.
- **Medication and dosing safety** (`medication_safety`, 41 entries): Gives correct, safe doses and checks contraindications, drug interactions, high-alert medicines and patient-specific factors before recommending a medicine.
- **Emergency and danger-sign recognition and escalation** (`emergency_escalation`, 53 entries): Recognizes red-flag or danger-sign presentations, conveys the right urgency, and directs the user to the nearest care that can act, holding that advice under pushback, without escalating cases that do not need it. Rubrics that name a specific service (911, ambulance, emergency department) measure a narrower version valid only where that service exists.
- **Care-level disposition** (`care_level_disposition`, 26 entries): Recommends the right level of care for the situation, from self-care through primary care to hospital, including managing locally when that is safe, with under- and over-referral tracked as separate errors.
- **Mental-health crisis detection and response** (`crisis_response`, 44 entries): Detects suicide, self-harm, violence or abuse risk in what a user says, and responds with appropriate risk assessment, de-escalation and crisis support.
- **Safety-netting and follow-up** (`safety_netting`, 14 entries): Tells the user which specific, recognizable changes or thresholds should prompt them to seek care, and how soon, and recommends follow-up the user can realistically obtain.
- **Referral destination and signposting** (`referral_appropriateness`, 22 entries): Points the user to a specific, reachable service, support or resource that exists in their setting. Generic advice to 'see a doctor' does not satisfy it; routing to a hospital department or specialty is a narrower, hospital-navigation version, and crisis lines count only where they exist and are staffed.
- **Refusal of harmful requests** (`appropriate_refusal`, 36 entries): Declines or safely redirects requests that seek dangerous or unethical help, sometimes with partial credit for a cautious answer.
- **Avoiding over-refusal and over-caution** (`over_refusal_avoidance`, 32 entries): Answers legitimate health questions with substance instead of refusing, deflecting to generic advice, or burying the answer in disclaimers.
- **Scope and role boundaries** (`scope_boundaries`, 50 entries) (contested): Stays within the role set for the deployment and the intended user's scope of practice: does not diagnose or prescribe where the deployment forbids it, states its limits, and does not refuse what the intended user (for example a nurse or CHW working from standing orders) is entitled to.

## Helpfulness and content quality

Whether a response is complete, relevant, useful, actionable, well-sized, personal to the user, and done as instructed.

- **Completeness** (`completeness`, 194 entries): Covers the information, key points and caveats the question or case requires, without leaving out clinically important content.
- **Relevance and question understanding** (`relevance`, 115 entries): Understands what was asked and addresses it, keeping the content on topic and free of irrelevant material.
- **Helpfulness and usefulness** (`helpfulness`, 78 entries): Gives the user meaningful, useful information or support for their need. Also covers clinical-utility ratings.
- **Actionability** (`actionability`, 43 entries): Gives clear, practical next steps the user can actually carry out.
- **Prevention and health education** (`prevention_health_education`, 12 entries): Includes relevant prevention, anticipatory guidance and health education the user can act on, and explains treatment benefits, risks and side effects understandably.
- **Conciseness and appropriate depth** (`conciseness`, 51 entries): Matches length and detail to the need, avoiding verbosity, repetition and padding as well as oversimplification.
- **Personalization to the user's situation** (`personalization`, 64 entries): Tailors advice to the user's stated circumstances, data and preferences rather than giving generic content.
- **Instruction and format compliance** (`instruction_following`, 49 entries): Follows explicit task and format instructions and produces output in the required, parseable form.
- **Overall response quality** (`overall_quality`, 191 entries): A holistic or composite judgment of response quality, such as an overall rating, rubric total, pairwise preference or Elo score, that blends several qualities.

## Communication and language

How clearly, readably, fluently and appropriately a response is written for its reader and in the reader's language.

- **Clarity and organization** (`clarity`, 83 entries): Presents information clearly, without ambiguity, and in a well-organized structure that makes the key points easy to find.
- **Readability and plain language** (`readability`, 63 entries): The intended reader, in their language and at their literacy level, can understand and use the text. Grade-level formulas (Flesch-Kincaid, SMOG, Gunning Fog) are a narrower, English-only proxy.
- **Fluency and naturalness** (`fluency`, 57 entries): Language is grammatical, fluent, varied and natural-sounding, without formulaic or robotic phrasing.
- **Logical coherence** (`coherence`, 69 entries): Content hangs together logically, flows in a sensible order and does not contradict itself.
- **Audience-appropriate communication** (`audience_tailoring`, 22 entries): Adjusts terminology, depth and recommended actions to the user's role and training, including frontline health workers such as CHWs and nurses, not only lay people versus clinicians.
- **Tone and professionalism** (`tone_professionalism`, 38 entries): Uses a professional, calm tone that reassures where appropriate without minimizing risk or causing needless alarm, and avoids preachy or moralizing language.
- **Target-language quality** (`language_fidelity`, 15 entries): Responds in the user's language with accurate grammar, terminology and translation, uses suitable local terms, and avoids code-switching that gets in the way of understanding.

## Empathy and therapeutic relationship

How the model relates to the person, including empathy, respect, listening, autonomy, healthy boundaries, and the quality of counseling or psychotherapy behavior.

- **Empathy and emotional support** (`empathy`, 90 entries): Recognizes the user's emotions and responds with warmth, validation and support.
- **Respect and humanistic care** (`respect_dignity`, 31 entries): Treats the user with courtesy, respect and non-judgment, and honors their wishes and dignity.
- **Active listening and responsiveness** (`active_listening`, 37 entries): Reflects back and directly addresses the concerns the user actually raised, rather than ignoring or sidestepping them.
- **Patient autonomy and shared decisions** (`patient_autonomy`, 24 entries): Respects the user's right to make informed choices, supports shared decision-making, and encourages the user's own agency.
- **Healthy relational boundaries** (`relational_boundaries`, 21 entries): Avoids fostering emotional dependence, claiming human feelings or a personal bond, romantic framing, or manipulating the user.
- **Therapeutic alliance** (`therapeutic_alliance`, 30 entries): Builds rapport, engagement and collaboration with the user, as rated on working-alliance or relationship scales.
- **Counseling and psychotherapy technique** (`counseling_technique`, 45 entries): Uses evidence-based counseling or psychotherapy techniques correctly and as the client needs, such as reframing, motivational interviewing, coping strategies and fidelity to a treatment protocol.
- **Reality testing and non-reinforcement of harmful beliefs** (`harmful_validation_avoidance`, 20 entries): Does not validate or reinforce delusions, harmful beliefs or maladaptive coping, and gently tests them against reality instead.

## Equity, inclusion and local fit

Whether quality holds across groups, languages and cultures, avoids stigma, and fits the resources of the setting where the user lives.

- **Fairness across groups** (`demographic_fairness`, 65 entries) (contested): Clinical judgment and quality do not vary with a patient's identity, wealth, insurance or location in ways the clinical facts do not justify, and the model does not stereotype, withhold resources or information, or ignore structural causes of inequity.
- **Non-toxic, non-stigmatizing language** (`toxicity_stigma`, 25 entries): Avoids offensive, derogatory, shaming or stigmatizing language about users, health conditions or groups.
- **Cultural appropriateness** (`cultural_appropriateness`, 16 entries): Fits the user's cultural norms and beliefs, including traditional and community health practices: engages with them respectfully, does not default to one culture's assumptions, and corrects harmful practices without shaming.
- **Fit to local resources and setting** (`local_context_fit`, 13 entries): Advice is feasible where the user lives: it takes account of the medicines, formulations, diagnostics and services actually available, cost to the patient, distance and transport, and local patterns of disease.
- **Parity across languages and literacy** (`multilingual_parity`, 13 entries): Accuracy and safety hold when the same need is expressed in another language or dialect, in code-mixed or colloquial form, or at a lower literacy level.

## Ethics, privacy and accountability

Whether the model protects personal information, acts in line with medical ethics, and is transparent, auditable and compliant.

- **Privacy and confidentiality** (`privacy`, 38 entries): Does not disclose, infer, request or misuse personal health information beyond what the task needs, and respects expectations of confidentiality.
- **Ethical and professional conduct** (`ethical_conduct`, 49 entries): Acts in line with medical ethics principles such as beneficence, non-maleficence, justice and honesty, handles ethical dilemmas soundly, and keeps professional conduct.
- **Transparency, accountability and compliance** (`accountability_compliance`, 29 entries): The system is open about being an AI and about its limits and data use, supports audit, monitoring and human oversight, and complies with applicable regulation.

## Consistency and robustness

Whether outputs stay stable across repeated runs, harmless input changes, and deliberate adversarial attacks.

- **Consistency and reproducibility** (`output_consistency`, 46 entries): Gives the same answer to the same or an equivalent question across repeated runs, sessions and model versions.
- **Robustness to input variation** (`perturbation_robustness`, 50 entries): Keeps answers correct when the input changes in ways that should not matter, such as paraphrasing, typos, distracting details, information order or irrelevant patient attributes.
- **Resistance to adversarial attack** (`adversarial_robustness`, 46 entries): Resists jailbreaks, prompt injection, false-premise injection, impersonation and multi-turn manipulation designed to extract unsafe output.

## Real-world use and effect

How the system works for people in practice: usability and workflow fit, and measured effects on users' behaviour and health.

- **Usability and workflow fit** (`usability_workflow`, 29 entries): How easy and satisfying the system is to use, how accessible it is, and how well it fits into users' or clinicians' workflows.
- **Effects on users' health and behavior** (`user_outcomes`, 15 entries): Measured change in users after they use the system, such as symptom scores, wellbeing, adherence or health outcomes.

## Evaluation method and system performance

Properties of the evaluation or of the system rather than of a single response: rater and judge reliability, cost and latency, and retrieval.

- **Evaluator agreement and validity** (`evaluator_reliability`, 51 entries): How reliably human raters or LLM judges score outputs, including inter-rater agreement, agreement with experts, judge biases, and whether judges and rubrics remain valid in the evaluated language and setting. A property of the evaluation, not of the output.
- **Efficiency and cost** (`efficiency_cost`, 20 entries): Computational and financial cost of running the system, such as latency, token use, compute and price per task.
- **Retrieval quality** (`retrieval_quality`, 29 entries): Whether the retrieval or memory component finds the documents, passages or records that are relevant to the query.
