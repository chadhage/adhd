---
name: fullstack-fmea
description: "Use Failure Mode and Effects Analysis (FMEA) to examine actual or potential failure modes, effects, causes, prevention and detection controls, risk prioritization, and verified corrective or preventive actions."
argument-hint: "Provide the system/process functions, boundaries, failure evidence, existing controls, and approved severity/occurrence/detection scales if available."
---

# Failure Mode and Effects Analysis (FMEA)

Fullstacker is the primary user; authorized VOC or AssociateProductOwner
practitioners may also use this reusable method. Analyze how a function can fail,
the resulting effects, plausible causes,
existing controls, and improvements. A failure mode is not its effect or its
cause. Use independently or within [RootCauseAnalysis](../fullstack-root-cause-analysis/SKILL.md).

## Boundaries

Before persistence, follow [Artifact Storage and Engagement
Contracts](../artifact-storage-and-engagement-contracts/SKILL.md) and approved
product-owned storage guidance. Preserve source IDs, provenance, collection
time, access status, and observed versus estimated inputs; exclude secrets.
Analysis and risk rankings do not authorize implementation or accept residual
risk on behalf of an accountable owner.

## Procedure

1. Identify the analyzed system/process revision, boundary, functions,
   performance requirements, users, interfaces, operating conditions, and
   decision owner. State design/process scope and the analysis horizon.
2. For each function, enumerate distinct failure modes: absent, incorrect,
   partial, late, unintended, or otherwise requirement-violating behavior.
   Record local, downstream, and end-user effects with their conditions.
3. Link plausible causes and mechanisms, including interacting/common causes,
   to evidence or explicit assumptions. Distinguish historical observations
   from prospective modes; a listed cause is not a confirmed root cause.
4. Inventory existing prevention controls separately from detection controls.
   State what is detected, when relative to the harmful effect, and whether
   the control was actually verified under relevant conditions.
5. Use the engagement's defined severity (S), occurrence (O), and detection
   difficulty (D) scales, direction, horizon, units, and priority policy.
   Record rating rationale, evidence, uncertainty, and scale revision. If
   scales are absent, return qualitative risk with explicit gaps or propose
   anchored scales for owner acceptance; do not invent approved numeric scores.
6. If the chosen method uses risk priority number, compute `RPN = S * O * D`
   only for known, compatible numeric ratings. Higher D must mean harder
   detection for that calculation. Do not treat RPN as a calibrated probability,
   use it alone to accept risk, or hide severe safety/legal effects behind a
   low product score. Use the adopted priority policy; do not invent an
   action-priority lookup or assume equal RPNs mean equal risks.
7. Define bounded preventive/corrective actions for important risks, with
   accountable owners, authority status, dependencies, due/review conditions,
   and measurable verification. Do not substitute better detection for
   elimination of the cause.
8. After authorized action and observed verification, preserve the baseline
   ratings and reassess residual risk with evidence and the same scale.
   Planned actions do not earn lower residual ratings. Reduce severity only
   when the effect itself changes, not merely occurrence or detection.
   Obtain risk disposition from the accountable owner.

## Output

Return rows with ID, function/requirement, mode, effects, causes and evidence,
prevention controls, detection controls and verification, S/O/D with rationale
or explicit unknowns, RPN if applicable, priority basis, action/owner/authority,
verification result, residual ratings, owner disposition, and review trigger.
Use [SPFA](../fullstack-spfa/SKILL.md) for critical dependencies and shared-failure domains.
