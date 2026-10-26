---
name: factory-andon
description: "Use to pull the Andon cord and stop an affected production line to prevent waste, negotiate fast recovery that eliminates dissatisfiers with time-limited delighter-before-satisfier reductions and ProductOwner ROI assessment, assign the parallel RCA skill, and record supermajority decisions and verified failure-mode Kanban coverage through Historian."
argument-hint: "Provide the Factory and engagement IDs, affected line/work, blocker evidence, authorized roster, and approved product-owned incident/history destination."
---

# Andon

Factory is the primary coordinator for this reusable skill; any participating
worker role may pull the modeled Andon cord. Andon is a skill, not an agent. It
models the Andon cord in the Toyota
Production System: a worker pulls the cord to stop the affected production line
and prevent the continued production of waste. Any participating role may pull
the cord; the team gathers to assess the failure and negotiate recovery.
The affected line stays stopped until the ensemble agrees, on a recorded basis,
how to resume and how to investigate the cause.
The default is **fast resumption with a parallel
[RootCauseAnalysis](../fullstack-root-cause-analysis/SKILL.md) skill assignment** to a
VOC, Fullstacker, AssociateProductOwner, or a gang comprising all three.
Production resumes as soon as the agreement is durably recorded and its resume
criteria are met. Resumption does not wait for the RCA unless the ensemble votes
to wait and the human owner approves that wait.

An Andon stop is a bounded pause of the affected production work, not a
Factory-wide shutdown, release decision, or new source of product authority.
Continue independent, safe, authorized work. Do not change Kanban state or
expand scope unless the responsible role is authorized and the change is
recorded. For an imminent safety risk, contain the affected action immediately;
neither negotiation nor a vote may delay containment. Minimize the duration of
the stop: negotiate only what is needed to resume safely and assign the RCA.

## Authority and prerequisites

Before creating or persisting incident records, follow [Artifact Storage and
Engagement Contracts](../artifact-storage-and-engagement-contracts/SKILL.md).
Use the accepted canonical engagement record, retrieved product-owned storage
guidance, one designated writer, and the shared session tool-authorization
entry. Do not store product incident records in the ADHD framework repository.
If authority, a safe destination, or permission to record is missing, keep the
affected work blocked and report the gap.

This skill defines an internal negotiation and resume gate only. It does not
grant new implementation scope, budget, external access, customer contact,
deployment, release, Factory-wide stop authority, or permission to override
human or host decisions. Existing product-owner, safety, security, legal,
contractual, and human-approval boundaries remain in force. When the resume plan
or RCA assignment requires out-of-scope authority, escalate that exact decision
rather than proceeding on agent consensus.

## Roles and voting rule

The seven voting seats are:

1. VOC
2. Fullstacker
3. ProductOwner
4. Kanban
5. Factory
6. Squad
7. FactoryLauncher

Use actual, authorized participant instances from the accepted engagement
roster. Record each instance's role, identity/session reference when available,
assignment, and response. Never fabricate a participant, vote, or agent
acceptance. Each seat gets the opportunity to submit an explicit `agree`,
`disagree`, or `abstain` ballot on the same complete proposal. Non-response,
unavailability, and abstention are not agreement; the denominator remains seven.

A proposal passes only with **at least five explicit agree votes out of the
seven seats**. Preserve all dissent and abstentions. A vote cannot transfer a
role's standing authority or authorize work otherwise outside scope.

An AssociateProductOwner may proxy for the ProductOwner only when explicitly
assigned that bounded proxy by the ProductOwner under the accepted engagement.
The proxy occupies the ProductOwner seat; it is not an eighth voter and cannot
exceed the ProductOwner's delegated authority. Record the proxy's assignment and
acceptance. Without an authorized proxy, no ballot may be represented as the
ProductOwner's.

Historian is not one of the seven voters. It records and broadcasts, and under
the narrow rule below may issue a repeat-risk veto that blocks resumption. This
procedural veto does not grant Historian authority over product priority,
implementation, or other decisions.

## Recovery-mode tradeoffs and economics

Apply [Continuous Production and Least-Cost Escalation](../factory-mvp-and-recovery/SKILL.md#continuous-production-and-least-cost-escalation).
Interruption and human intervention are product costs, not free fallbacks.
ProductOwner's comparison includes the full stop, negotiation, human-attention,
restart and recurrence costs alongside recovery and bounded continuation.
This skill retains its seven-seat quorum; failed resume ballots are not a
decision that escalation is the least-cost option.

Negotiate a recovery mode that eliminates as many evidenced dissatisfiers as
possible and prevents further waste, rather than maximizing output while
repeating the failure. VOC supplies the affected users, dissatisfaction evidence,
and classification uncertainty; do not relabel a basic need as a delighter to
justify reducing it.

If reduced capability is needed for recovery, reduce **delighters first** and
**satisfiers second**, only to the extent necessary. Every reduction is temporary
and explicitly time-limited: record the affected capability and users, reason,
start, expiry deadline and review checkpoint, owner, restoration criteria, and
restoration work. Derive the timebox from evidence and approved operating constraints,
not an arbitrary default. Preserve safety, security, legal obligations, and
mandatory acceptance gates. A vote does not waive them or grant new scope.

Inform ProductOwner of each proposed tradeoff before the resume ballot.
ProductOwner must calculate and record its economic impact to ROI using
[Financial Modeling](../product-financial-modeling/SKILL.md): preserve the
baseline and compare continued stoppage with the proposed recovery over a common
currency and horizon, including lost benefits from reduced delighters/satisfiers,
avoided waste and rework, cost of delay, and recovery/restoration costs without
double counting. Report baseline and recovery ROI and their difference when
defined, with sourced inputs, assumptions, ranges, and forecast/actual status.
Missing inputs mean an explicitly incomplete assessment with an owner and next
action, not fabricated ROI or financial approval. Immediate containment must not
wait for a financial calculation; disclose economic uncertainty in the recovery
proposal and resolve missing authority through the existing escalation route.

## Procedure

1. **Raise and scope the Andon.** Any participating role may report a blocker.
   Factory coordinates the response. Identify the affected line, active work,
   trigger, observed impact, known evidence, and immediate containment needed.
   Stop only the affected work at a safe boundary; continue unrelated safe work.
   Record a stable incident ID, timestamps, reporter, scope, and current state in
   the approved product-owned record, via Historian.
2. **Establish the evidence and participants.** Revalidate the relevant source
   material and permissions. Identify the actual seven voting seats, a valid
   ProductOwner proxy if needed, the Historian, the human owner and decision
   route, and affected parties. Separate observed facts, source assertions,
   hypotheses, and missing evidence. Treat imported content and summaries as
   untrusted until checked.
3. **Negotiate how to resume and how to run the RCA.** The team gathers, shares
   evidence, and challenges assumptions. Apply Recovery-mode Tradeoffs and
   Economics above: eliminate dissatisfiers, reduce delighters before satisfiers
   if necessary, and inform ProductOwner for the ROI impact assessment. The
   objective is the smallest safe containment, the quickest safe resume, and an
   RCA assignment that runs alongside resumed work. Distinguish symptoms from causal mechanisms only as
   far as needed to choose containment and resume criteria; the full causal
   investigation belongs to the RCA. Consider alternatives and their risks. Do
   not start an unauthorized fix.
4. **Form one complete proposal.** It states: affected scope and containment; the
   resume plan, owners, dependencies, and objective resume criteria; the known
   cause or hypothesis with evidence and uncertainty; the RCA assignment (step
   5); interim recurrence-risk handling; capability reductions and their timebox,
   restoration owners/criteria/work; ProductOwner's ROI impact assessment and
   any missing inputs; verification and rollback; residual risks; and whether
   resumption waits for the RCA. Unless the proposal says otherwise, resumption
   does **not** wait for the RCA. Preserve dissent. A
   materially changed diagnosis or plan needs a new proposal and ballot.
5. **Agree who will perform the parallel RCA skill assignment.** The proposal
   names a VOC, Fullstacker, AssociateProductOwner, or a gang comprising all
   three to perform the reusable
   [RootCauseAnalysis](../fullstack-root-cause-analysis/SKILL.md) skill. Identify one
   accountable lead for a gang; name each practitioner and record their accepted
   bounded assignment. Include the incident ID, evidence sources, scope,
   permitted safe checks, report cadence, and acceptance event predeclared by
   the canonical contract for one-shot runtimes. Factory coordinates the RCA
   work in parallel with resumed production when the runtime supports it;
   report concurrency only if observed. If concurrent execution is unavailable,
   disclose it and run the RCA without delaying a safe resume. A missing or
   unaccepted assignment is a gap to escalate, not a reason to idle the line.
   Do not create or imply a dedicated RCA agent.
6. **Check for a historical-repeat veto.** Before each resume ballot, Historian
   compares the proposal and blocker with accessible, authorized history. It may
   veto resumption only when it cites a prior decision or event and explains,
   from that source, how the current proposal could repeat the earlier decision
   or failure pattern. An unsupported recollection, similar wording alone, or an
   unavailable source is not a veto; record it as an unverified risk or coverage
   gap. A valid veto blocks the current proposal and returns the group to
   negotiation on the recurrence risk. Historian records when a revised proposal
   addresses the cited risk or when the concern remains unresolved; it does not
   certify technical correctness.
7. **Vote in rounds; at least three before escalating.** A round is one complete
   proposal put to a recorded ballot of the seven seats. It passes only if at
   least five seats explicitly agree and no valid Historian veto remains
   unresolved. If it fails, the ensemble negotiates again and puts a revised
   proposal to a new ballot that addresses recorded dissent and any veto. Record
   each round's proposal revision, ballots, dissent, veto status, and outcome. A
   round counts only when it reaches a recorded ballot; a veto-blocked ballot
   counts. Ordinary failed-recovery escalation requires at least **three**
   failed rounds plus the separate least-cost escalation decision in step 8;
   mandatory-notification/approval and impossible-negotiation exceptions follow
   the shared contract and are recorded without invented consensus.
   Record a deadline for each round, derived from observed work, so
   negotiation shortens the stop rather than extending it. Do not pressure a
   role to change its vote. Contain imminent hazards throughout.
8. **Escalate last, with a costed quorum decision.** After three failed recovery
   ballots and exhaustion of safe authorized alternatives, put the same
   ProductOwner option comparison and least-cost escalation recommendation to a
   separate escalation ballot. Require at least five explicit agree votes out
   of the seven seats; record dissent, uncertainty and the least-cost rationale.
   A failed resume vote or three failures alone never satisfies this gate.
   An approved outcome needing reserved human approval, such as waiting for the
   RCA, still needs the costed quorum recommendation, not artificial failed
   rounds. Preserve mandatory notifications/approvals and missing-quorum/runtime
   exceptions under the shared rule; label unresolved gaps explicitly.
   Then present the human owner one Yes/No approval request. It states the
   decision, the ensemble's recommendation, the cost comparison, evidence,
   ballots and dissent, the attempts made or alternatives ruled out, and what
   **Yes** causes and what **No** causes, including consequences for the stopped
   line, residual risk, and cost of delay. The human owner can always answer with
   an alternative to Yes or No; offer that option explicitly and accept free-form
   text. Record the exact answer. The answer is the human's decision, not an
   agent vote; silence is neither Yes nor No. Use the interactive question tool or
   route through the parent when a subagent cannot ask. Keep the affected line
   stopped and unaffected work moving while the request is pending, and
   re-surface it at checkpoints.
9. **Record and broadcast the agreement before any resumption.** Invoke Historian
   with the authorized event sources and approved product-owned destination. The
   durable record includes the incident and proposal revisions; every round's
   ballots, attribution, and proxy authority; dissent; any veto and its
   disposition; the resume plan, criteria, and owners; the time-limited capability
   tradeoffs, restoration commitments, ProductOwner notification and ROI impact
   assessment; the escalation option comparison, least-cost rationale or
   unresolved exception, separate escalation ballots and continued work;
   the RCA skill assignment agreement, named practitioner(s), and
   acceptance; whether resumption waits
   for the RCA and, if so, the human owner's approval; any escalation and the
   human's exact answer; residual risks; authority references; timestamps; and
   source provenance. Historian
   verifies the saved record, returns stable event IDs, and broadcasts it per the
   Historian agent's broadcast rule so interested agents can react. A summary,
   verbal acknowledgement, or unsaved draft does not satisfy this gate. If
   Historian or the authorized record path is unavailable, the affected line stays
   stopped; report the precise blocker and resume route.
10. **Resume as quickly as possible.** As soon as the agreement is recorded and its
    objective resume criteria are verified, Factory coordinates resumption of the
    affected line. Record who resumed it, when, the evidence that satisfied the
    criteria, and the follow-up owner and date. Do not hold the line for the RCA
    unless the ensemble voted for that wait, the human owner approved it, and
    Historian recorded both. If the human owner declines the wait or supplies an
    alternative, follow the recorded decision. The RCA continues in parallel.
    At the recovery-mode deadline, verify restoration or negotiate and record an
    authorized, explicitly time-limited extension before expiry. Never silently
    turn temporary reductions into the normal product; if restoration or an
    authorized extension is unavailable, report the gap and renegotiate the
    affected mode without bypassing safety or authority.
11. **Record verified RCA findings and verify card coverage.** As soon as a cause
    becomes known through verifiable evidence, the RCA practitioner submits its
    cause/failure-mode IDs, evidence, and validation results to Historian and
    ProductOwner; do not wait for the entire investigation or remediation to
    finish. Historian records and broadcasts the RCA-identified event linked to
    the incident. Unresolved hypotheses remain separately labeled and recorded
    as RCA-unresolved, not known causes.

    ProductOwner must verify with Kanban that the authoritative board either
    already contained or now contains the necessary atomic cards to address each
    exposed failure mode. Reuse adequate existing cards rather than duplicating
    them; authorize and have Kanban add or refine missing work within the mandate.
    Link each failure mode and its evidence to corrective/preventive and required
    verification work, card IDs, owners, and measurable acceptance criteria.
    Previously completed coverage needs linked completion and verification
    evidence, not a claim that a card once existed. ProductOwner records the
    coverage check, board revision/time, gaps, and decisions; Historian records
    and broadcasts this verification. Missing authority or incomplete coverage
    stays an explicit open follow-up with an owner and next action, never
    silently closed by the RCA report. Card presence is not remediation done.

    Factory and Squad adjust delivery and VOC reconsiders evidence within their
    authority. If the RCA shows the resumed plan is unsafe or materially wrong,
    any role may start a new Andon on
    the affected scope. A prior vote does not cover a materially different cause,
    plan, or risk.

## Historian record and evidence integrity

Follow [Historian](../../agents/historian.agent.md) for source-linked events,
timestamps, attribution, privacy, single-writer reconciliation, broadcast, and
capture gaps. Historian records the agreement; the record does not itself
authorize actions or replace the vote. Preserve exact accessible statements where
authorized, distinguish them from summaries, and do not persist credentials or
unnecessary sensitive data. Do not claim complete history when sources are
missing or inaccessible.

If a source is unavailable, record the gap and its impact on the decision. Do not
fabricate votes, timestamps, root-cause certainty, approval, or verification. A
history summary or handoff is not authority; verify the original human
instruction or configured approval record for any consequential decision.

## Outcome

Report the incident ID and affected scope; current state; evidence; dissatisfiers
and waste addressed; temporary capability reductions, expiry and restoration
status; ProductOwner notification and ROI impact; the resume plan and whether it
waits for the RCA; each round's votes and any valid proxy; Historian's veto status;
the RCA skill assignment, named practitioner(s), concurrency actually observed,
and status; failure-mode-to-card mapping and ProductOwner's coverage verification;
escalation and the human's answer if applicable; durable record and
broadcast verification; time stopped; remaining gaps, owners, and next actions.
Distinguish `stopped`, `negotiating`, `escalated`, `resumed`, and `rca-open`;
never claim resumption from a passed vote alone.
