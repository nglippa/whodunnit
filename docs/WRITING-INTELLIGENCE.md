# Writing intelligence: evidence and decision policy

This pass audits the rule engine after the v4 cloud foundation. It changes writing analysis and safe defaults; it does not choose a model, promote v4, or claim to identify a text's author. Production remains `reconstruction-v1`. Local model benchmarks are **PAUSED UNTIL 64 GB M5 PRO ENVIRONMENT**.

## Audit and gap map

The path is source → masked text index → metrics and rule detectors → precedence → RewritePlan → provider or deterministic demo → independent meaning and rule checks → bounded retry → result. The registry has semantic-safety, core, anti-slop, family, style and imported packs. The seven existing rhetorical families group related rules for false-contrast, negative parallelism, unsupported authority, importance, grand conclusions, optimization clichés and throat-clearing. Source ingestion stages candidates; activation remains a developer command.

The engine already measures sentence-length distributions, paragraph variation, transitions, contractions, hedges, punctuation and likely passives. It masks quotations, code and URLs. Semantic comparison protects claims, quantities, dates, quotes, polarity, modality and causal strength. Source-local voice protects repeated dashes, fragments, lowercase and punctuation; Voiceprints provide higher-precedence measured ranges. These are substantial strengths.

| Gap | Decision in this pass |
|---|---|
| One surface pattern can be the author's device | Repeated substantive two-word openings can be protected by source evidence or a confident Voiceprint; short, stock openings do not qualify. Strongly repeated fragments and paired dashes can be preserved even in a short source. |
| Rhythm threshold can drive unnecessary rewriting | Uniform sentence rhythm needs a sustained passage (12 prose sentences, 180 words). Mere absence of extremes is informational. No universal "human" CV is asserted. |
| An exact phrase can carry formal meaning | Summary openers and dense hedges are informational, without an automatic deletion. Ambiguous formal substitutions were removed from the automatic phrase map. |
| Clean negatives were too narrow | New independent synthetic clean and adversarial corpora, plus metamorphic and property-style tests. |
| Unnecessary sentence changes and register drift were hard to observe | Attempt records now carry counts of untouched-source sentences changed, unretained domain phrases, plain-to-corporate replacements, and verb-to-noun shifts. This is advisory metadata, never a semantic verdict or automatic retry. |
| Specificity and semantic restatement need judgment | Existing protected dates, numbers, names, quotations and domain phrases remain authoritative. A general concreteness or redundancy rewriter was rejected; no details are invented. |

## Taxonomy and rule decisions

These are phenomena, not evidence that AI wrote the text. A match must be weighed against genre, the source, the requested style and any Voiceprint.

| Concept | Existing coverage | Context in which it may be fine | Policy |
|---|---|---|---|
| Empty setup or recap | announcements, throat clearing, summary openers | navigational prose in a report | exact filler can be changed; summary labels are informational |
| Manufactured contrast | false contrast, paired negatives | a genuine correction or distinction | heuristic guidance; preserve claims |
| Unsupported authority | unnamed experts or research | attribution supplied elsewhere | ask for review; never fabricate a citation |
| Claimed importance without evidence | puffery, fake depth, rhetorical kickers | a conclusion supported by the preceding argument | guidance only where support cannot be measured |
| Generic corporate register | inflated words, corporate verbs, optimization clichés | business, technical or literal usage | corporate verbs alone are informational; avoid automatic synonym policing |
| Mechanical structure | triads, repeated openers, uniform rhythm/paragraphs | anaphora, instructions, lists, technical structure | source and Voiceprint habits outrank general rules; paragraph symmetry is informational; short statistics are uncertain |
| Excess connective scaffolding | transitions and ordinal enumeration | academic and formal signposting | repeated additive filler can be changed; logical links survive |
| Uncalibrated emphasis or certainty | intensifiers, hedges, dashes, fragments | epistemic caution or personal cadence | keep uncertainty and demonstrated habits |
| Presentation residue | tool markup, scattered emphasis, teaser headings | medium-specific formatting | concrete markup defects remain actionable; style judgments need context |

No new rule family was activated. Adding more phrase variants would widen false positives without solving the contextual problem. The core and anti-slop packs were versioned to 2 for changed rules. The imported adverb-density rule is now informational: "just" and "actually" can affect meaning. Existing source candidates remain staged, and no scraped source prose was copied into rules.

### Candidate ledger

| Candidate | Detection | False positives / suppressor | Change safety | Decision |
|---|---|---|---|---|
| Repeated substantive opening | heuristic, exact two-word opening repeated at least three times in enough clean prose | formulaic stock openings; source-local cleanliness and cross-sample Voiceprint evidence | preserve the opening; never auto-create one | **Activated as voice evidence**, no transform |
| Even sentence lengths | deterministic measure, interpretive significance | short instructions, measured formal prose; minimum length and genre context | never rewrite to hit a variance target | **Raised evidence floor**, guidance only |
| Paired dashes / fragment runs | heuristic | personal cadence, terse notes; repeated local device or Voiceprint | preserve when evidence supports habit | **Stronger suppression** |
| Summary opener | exact detection, contextual value | formal conclusions and reports | deletion may remove structure | **Informational only** |
| Dense hedging | measurable density, uncertain interpretation | academic and legal uncertainty; source and Voiceprint register | removing a hedge can strengthen a claim | **Informational only** |
| Plain verb → corporate synonym | deterministic paired lexicon, contextual interpretation | literal usage and requested formal style | no automatic reverse mapping | **Advisory post-rewrite count** |
| Verb → abstract noun | small paired lexicon, contextual interpretation | useful nominal reference to an established action | no automatic rewrite | **Advisory post-rewrite count** |
| Concrete → generic | dates, figures, names, quotes, protected domain phrases are measurable | legitimate paraphrase of unprotected words | only existing anchors are enforced | **Existing semantic checks plus advisory domain-phrase loss count** |
| Adjacent semantic restatement | needs discourse judgment | emphasis, recap, a second genuinely new implication | deletion risks dropping a claim | **Reference only / model-assisted candidate**, no activated detector |
| Universal "AI rhythm" / triad ban | no reliable context-free threshold | structured genres and deliberate symmetry | unsafe | **Rejected** |

The advisory wording counts are deliberately narrow. The paired lexical checks can miss a local replacement when the plain word also survives elsewhere in the document; they make no claim of exhaustive detection. They cannot decide whether a sentence edit was justified, whether a noun is abstract, or whether a synonym preserved meaning. They are metadata for review; the independent semantic checks keep authority. No raw user text enters telemetry.

## Public research and reuse

These sources informed general principles. The linked pages were read as references; their prose and examples were not imported into the rule pack. License labels describe what expression may be reused, not ownership of ideas. The source-ingestion cache was not used because most sources permit reference but not copying, and the rule candidates here were written independently.

| Source | Classification | Principle used |
|---|---|---|
| [GOV.UK Functional Standards writing style guide](https://www.gov.uk/government/publications/handbook-for-standard-managers/functional-standards-writing-style-guide), OGL v3 | RULE_DERIVATION_ALLOWED | Clarity and concision serve meaning; remove words that do no work. |
| [GOV.UK content principles](https://www.gov.uk/government/publications/govuk-content-principles-conventions-and-research-background/govuk-content-principles-conventions-and-research-background), OGL v3 | RULE_DERIVATION_ALLOWED | Audience, purpose and tone govern register. |
| [ACL Anthology: limitations of machine-generated text detection](https://aclanthology.org/2025.coling-main.288/), CC BY 4.0 | PRINCIPLES_ALLOWED | Stylistic features are weak authorship evidence; readable human prose can be misclassified. |
| [ACL Anthology: LLM as a coauthor](https://aclanthology.org/2024.findings-naacl.29/), CC BY 4.0 | PRINCIPLES_ALLOWED | Mixed human and model writing defeats simple provenance labels. |
| [ACL Anthology: LLMs and scientific communication](https://aclanthology.org/2026.lrec-1.142/), CC BY 4.0 | PRINCIPLES_ALLOWED | Stylistic shifts are domain-dependent; do not impose a universal rhythm target. |
| [Purdue OWL: concision pitfalls](https://owl.purdue.edu/owl/general_writing/academic_writing/conciseness/avoid_common_pitfalls.html), all rights reserved | REFERENCE_ONLY | A noun can conceal a useful verb; shorter wording is not automatically better. |
| [Purdue OWL: business writing](https://owl.purdue.edu/owl/subject_specific_writing/professional_technical_writing/business_writing_for_administrative_and_clerical_staff/general_guidelines.html), all rights reserved | REFERENCE_ONLY | Put the needed action early and judge repetition by purpose. |
| [UW–Madison: transitions](https://writing.wisc.edu/handbook/grammarandstyle/transitions/), CC BY-NC-SA 4.0 | PRINCIPLES_ALLOWED | A transition should clarify a real relationship between ideas. No handout adaptation is included. |
| [George Mason Writing Center: hedges](https://writingcenter.gmu.edu/writing-resources/research-based-writing/hedges-softening-claims-in-academic-writing), all rights reserved | REFERENCE_ONLY | Uncertainty words can be part of factual precision. |
| [ACES: protecting author voice](https://aceseditors.org/2019/10/01/three-steps-to-protecting-the-authors-voice/), copyright notice/no open reuse license | REFERENCE_ONLY | Repeated author choices and the cumulative effect of edits matter. |

## Evaluation boundary

The original semantic judge and its expected verdicts were not tuned to new rules. Meaning, voice devices and refinement effects remain separate checks. New clean passages are synthetic and independent of existing gold edits; they cover casual, professional, academic, technical, messy, terse, long-form, conversational, personal, formal, fragment-heavy, dash-heavy, lowercase, intentional repetition, structured lists, plain language and quotations. Adversarial passages combine slop patterns with hedges, quotes and facts, and include mixed-register and very short cases. Metamorphic tests check harmless appends, quote style, paragraph changes and case stability. Property-style tests cover dates, quantities, negation, sentence boundaries and whitespace.

The new corpus is a regression suite, not a statistical estimate of false-positive rate. The existing reconstruction corpus shares some text with semantic fixtures and model-era gold edits; those are useful regressions but not an independent holdout. A fresh, longer holdout is the next evaluation task. No model benchmarks were run in this pass.
