---
name: fullstack-root-cause-analysis
description: "Use as Fullstacker's primary root-cause analysis method for observed or potential failures; authorized VOCs, AssociateProductOwners, or a gang with Fullstacker may perform it using Ishikawa, 6Ms, 5 Whys, FMEA, and SPFA."
argument-hint: "Provide the failure or risk, expected versus observed behavior, system boundary, evidence, constraints, and decision owner."
---

# Fullstack Root Cause Analysis

Fullstacker is the primary practitioner for this reusable analysis workflow.
When an Andon assignment names a VOC, AssociateProductOwner, or a gang of all
three roles, they use this same skill within their accepted authority; the
Fullstacker prefix identifies primary ownership, not exclusive access.

Investigate actual failures and potential failures without confusing symptoms,
causal hypotheses, and established causes. Multiple interacting causes are
possible. Ishikawa and 6Ms broaden discovery, 5 Whys traces causal mechanisms,
FMEA evaluates failure modes and effects, and SPFA exposes critical dependencies.
None of these methods alone proves a root cause.

## Scope and evidence

Before persisting results, follow [Artifact Storage and Engagement
Contracts](../artifact-storage-and-engagement-contracts/SKILL.md). Reuse the
canonical engagement, source evidence IDs, and approved product-owned
destination. Keep facts, source assertions, hypotheses, decisions, and actions
separate. Preserve source/author, revision or digest when available, collection
time, access status, and exact observation versus interpretation. Do not copy
secrets or unnecessary personal data.

Analysis does not authorize changes, fault injection, spending, deployment,
release, or resumption. Follow current host permissions and the accepted scope.
Contain imminent hazards without waiting for analysis; use
[Andon](../factory-andon/SKILL.md) when the affected production line needs a governed
stop and negotiation. Analysis does not replace its vote, Historian record,
repeat-risk veto, or safe-resume gates.

When Andon assigns this skill, its practitioner(s) work in parallel with
resumed production when the runtime supports it. This is a reusable skill, not
an agent or agent persona. The performer must be one VOC, one Fullstacker, one
AssociateProductOwner, or a gang comprising all three with one accountable
lead. Do not imply that an RCA agent is spawned. Do not delay resumption or ask
the line to wait unless the ensemble voted to wait and the human owner approved
it. Accept the bounded assignment through its predeclared event and report at
the agreed cadence. Submit results to Historian, which records and broadcasts
an RCA-identified event as soon as a cause becomes known through verifiable
evidence, or an RCA-unresolved event with the evidence gaps. Send the verified
finding to ProductOwner at the same time; do not wait for the full investigation
or remediation. A finding that the resumed plan is unsafe
triggers a new Andon; it is not an agent approval.

## Procedure

1. Define the incident/risk ID, system version and boundary, affected outcome,
   expected behavior, observed behavior or prospective scenario, onset/timeline,
   exposure conditions, impact, and decision owner. For a potential failure,
   explicitly state that the event has not been observed.
2. Preserve authorized evidence before it changes. Record recent changes,
   working and failing comparisons, chronology, existing controls, containment,
   missing observations, and relevant prior incidents. A temporal correlation
   or historical similarity is a lead, not proof of causation.
3. Apply [6Ms](../fullstack-six-ms/SKILL.md) to examine People, Machine, Method, Material,
   Measurement, and Environment. Then use    [Ishikawa](../fullstack-ishikawa/SKILL.md) to
   organize the candidate causes around the precise failure/effect. Retain
   alternatives, cross-category dependencies, and unknowns.
4. Apply [5 Whys](../fullstack-five-whys/SKILL.md) to the credible branches. Trace each
   link to evidence and a causal mechanism. Branch rather than force one
   linear explanation; stop at a defensible system-level intervention or an
   explicit evidence gap, not an arbitrary fifth answer.
5. Apply [FMEA](../fullstack-fmea/SKILL.md) to the affected functions and proposed remedy:
   enumerate failure modes, local/downstream effects, causes, and prevention
   and detection controls. Separate actual observations from estimated risks.
6. Apply [SPFA](../fullstack-spfa/SKILL.md) to critical technical, human, authority, data,
   and recovery dependencies. Check whether redundancy really has independent
   failure domains and whether failover can meet the required outcome.
7. Reconcile the methods into one causal/risk register using shared IDs. Define
   competing explanations and a discriminating test for each important causal
   link: expected result if true, expected result if false, environment,
   permission requirements, and possible confounders. Run only authorized,
   safe checks. Use read-only comparisons or approved isolated fixtures when
   fault injection is not authorized; label their limits.
8. Classify each candidate as supported, refuted, or unresolved, citing results
   and remaining uncertainty. For prospective scenarios, report supported
   failure mechanisms or credible risks, not a confirmed historical root
   cause. Do not declare certainty because several brainstorming methods
   repeat the same assumption. As each cause becomes verifiably known, submit
   its stable cause/failure-mode IDs, sources, hypothesis checks, observed
   results, and residual uncertainty to Historian for recording/broadcast and
   ProductOwner for follow-up.
9. Propose corrective/preventive actions tied to specific causes or controls.
   Each action has one observable outcome, accountable owner, scope,
   dependencies, authorization status, acceptance test, and rollback/recovery
   consideration. Distinguish containment, cause removal, detection, and
   resilience; do not label symptom suppression as cause removal. ProductOwner
   must verify with Kanban that each exposed failure mode has the necessary
   atomic cards on the authoritative board, reusing adequate existing cards and
   authorizing missing work within scope. Record failure-mode-to-card IDs,
   owners, measurable criteria, board revision/time, and ProductOwner's coverage
   verification or explicit gaps. For already completed work, link actual
   completion/verification evidence. Historian records and broadcasts the check.
   Do not treat card presence as proof of remediation or an open coverage gap
   as resolved.
10. After separately authorized changes, verify both the failing scenario and
    preserved behavior, record residual/new risks, and define recurrence
    monitoring with an owner, observation window, trigger, and reopen rule.
    Unperformed checks stay not run or blocked. Route decisions to the
    responsible roles and history to Historian under the existing engagement.

## Return contract

Return the problem statement and evaluated identity; evidence/timeline;
6Ms inventory; Ishikawa map; causal chains; FMEA register; SPFA dependencies;
cross-method cause IDs; hypothesis tests and observed results; supported and
unresolved conclusions; known-cause event references; atomic action proposals
and authority; failure-mode-to-card coverage and ProductOwner verification or
open gaps; residual risks;
verification/monitoring plan; and missing evidence with next owners/actions.
Use linked sections in one analysis record rather than duplicate ledgers.
If a method is not applicable, record the boundary-based reason instead of
inventing inputs or silently skipping it.
