---
name: squad-buffer-pattern
description: "Use BufferPattern to reserve Squad capacity for technical debt and dissatisfier reduction, assign a designated responsible Fullstacker (DRF), prioritize external end-customer dissatisfiers, handle cross-Squad requests and live-site support, and improve internal documentation/wiki when external demand is exhausted."
argument-hint: "Provide the Squad roster, capacity period and allocation, DRF, authorized buffer-work scope, intake sources, priority policy, WIP limits, and product-owned records/wiki."
---

# Squad Buffer Pattern

Squad is the primary coordinator of this reusable skill. A designated
responsible Fullstacker (DRF) performs buffer work; DRF is an assignment to an
existing Fullstacker, not a new agent type or an additional Squad member.
ProductOwner and Kanban participate within their existing decision rights.

Reserve an explicit share of the Squad's capacity for technical debt and
eliminating dissatisfiers for external and internal customers and stakeholders.
Protect the remaining capacity for the Squad's other authorized outcomes,
including satisfiers and delighters. The buffer absorbs support and unplanned
requests without routinely interrupting the whole Squad.

## Authority and operating agreement

Follow [Artifact Storage and Engagement Contracts](../artifact-storage-and-engagement-contracts/SKILL.md).
Record the operating agreement in the accepted product-owned engagement, with
one designated writer and the existing host/session tool grant. This skill
creates no product-specific allocation, standing worker, live-site access, or
permission to deploy. Do not save product boards, logs, or wiki content here.

Before activating the pattern, establish:

- The actual Squad roster and available capacity, measurement unit and period,
  reserved percentage (10% default, 50% ceiling), remaining commitments, and
  approval reference.
- A named DRF, accepted assignment, backup/handoff route, and any rotation or
  review cadence. Rotation is optional; do not invent a default interval.
- ProductOwner's standing buffer charter: eligible debt/dissatisfier outcomes,
  external and internal beneficiaries, selection/interrupt rights, scope and
  cost limits, and permitted documentation/wiki work.
- Intake sources and requesting/owning Squads; support escalation route;
  severity/ordering policy within each priority class; response expectations
  and their operating window; boundaries for production/support actions.
- Kanban's current board, True Ready criteria, WIP limits, card admission and
  interruption procedure, and serialized record ownership.
- Approved product documentation/wiki destination, edit/publish permissions,
  required review, empirical completion criteria, and review measures.

Within this accepted charter, the DRF is empowered and mandated to select and
reduce eligible dissatisfiers for both external and internal stakeholders,
including technical debt and knowledge gaps. A request within that standing
authority does not need a new human approval merely because the DRF received it.
ProductOwner retains product priority and backlog admission authority; Kanban
records authorized work and transitions. An outside-Squad request is demand,
not new authority. Resolve disputed priority, new scope, funding, access, or
publication authority through the responsible owner.

## Capacity, not extra headcount

For one consistent period/unit, let available Squad capacity be `C` and the
approved reserved fraction be `r`. Reserve `B = C * r`; plan other work against
`C - B`. Establish capacity from actual availability and comparable units;
never double-count the DRF in both the buffer and feature commitments.

**Illustration, not a default:** four equally available Fullstackers reserving
25% of total capacity can assign one existing Fullstacker as DRF and leave the
other three on satisfiers/delighters. This assumes equivalent availability for
the period. It is not a requirement for every Squad, a guarantee of throughput,
or permission to create a fifth member.

A fractional allocation can use an explicitly planned part-time DRF or bounded
time slices; do not silently round up to a whole person. Record the feasible
assignment and remaining commitments. Capacity reservations do not increase WIP
limits or prove simultaneous agent execution or continuous on-call coverage.

### Default reserve and adaptive ceiling

**By default every Squad implements a 10% buffer** (`r = 0.10`). A human-approved
engagement may set a different starting value, but never above the ceiling.
The reserve may rise to **no more than 50%** (`r <= 0.50`), and only when the
dissatisfiers increase after a product delivery attempt is completed.

- **Trigger:** when a delivery attempt (successful, partial, or failed) reaches a
  recorded completion or stop, compare the dissatisfier evidence after it with
  the baseline from before it, using the approved measures (for example
  external incidents, support escalations, defects, rework, and internal
  friction, weighted by beneficiary and severity). Raise the reserve only
  for an evidenced net increase; noise, an unmeasured impression, or the mere
  completion of a delivery does not qualify.
- **Size of the increase:** proportionate to the evidenced increase and
  available capacity, recorded with its calculation and uncertainty. Never
  exceed 50%; if demand still exceeds the capped buffer, report the deficit
  and the tradeoff to ProductOwner and the human owner instead of raising the cap
  or silently borrowing members.
- **Authority and timing:** Squad proposes the new value with evidence;
  ProductOwner confirms it within this band, accounting for reduced feature
  commitments; Kanban records it. It applies from the next agreed planning
  boundary, or immediately only when ProductOwner approves an urgent change.
- **Reduction:** when dissatisfier evidence returns to or below baseline after a
  later delivery attempt, propose stepping back toward 10% by the same
  evidence route. Never go below the default without an approved reason. Keep
  the prior value and each change with its evidence for traceability.
- **Unmeasured baseline:** if no pre-delivery baseline exists, keep 10% and
  establish a baseline before adjusting; do not invent one.

## Priority and dissatisfier-item starvation

Classify work by its evidenced beneficiary and impact, not just who submitted it.
A request from another Squad can concern either an end-customer incident or an
internal team need. Technical debt with evidenced customer impact belongs with
that impact; do not label all debt internal or manufacture customer impact.

1. **External, end-customer-facing dissatisfiers always take precedence over
   internal/team-facing dissatisfiers.** Apply the approved severity and ordering
   policy within this class, including live-site escalations. The DRF is the
   buffer response owner, not automatically the incident commander.
2. **When the local dissatisfier-item queue is starved, prioritize responding to
   external requests from other Squads and live-site support escalations.**
   Check the approved intake before declaring starvation or starting fallback
   work. Acknowledge, triage, and route requests within authority; respond does
   not necessarily mean implement or promise a resolution time. End-customer
   impact still outranks internal impact, regardless of the requesting Squad.
3. **When external dissatisfier demand is exhausted, use the buffer for internal
   customer/team/stakeholder dissatisfiers and technical debt.** The DRF also has
   the mandate to review collective documentation and augment the product-owned
   wiki to improve Squad knowledge. Favor evidenced gaps such as stale runbooks,
   repeated support questions, missing recovery steps, and undocumented
   workarounds; do not generate pages or busywork to fill capacity.

Starvation means no eligible actionable item in the checked scope at that time,
not proof that every customer is satisfied or the Factory has no unfinished work.
Blocked or unverified external requests remain visible with an owner and next
action; they are not exhausted. Independent internal work may proceed while
those requests cannot advance, provided it does not delay an actionable external
response. Recheck intake at agreed checkpoints and before each new pull.

New actionable end-customer work displaces internal/debt/documentation fallback
at the earliest safe boundary under the agreed interruption policy. Do not let
internal work delay the customer response, abandon unsafe partial work, or hide
an additional active card. Immediate safety/security containment and mandatory
obligations remain binding; use the existing incident and
[Andon](../factory-andon/SKILL.md) procedures where needed.

## Execution and evidence

1. **Confirm the reservation and DRF.** Reconcile planned capacity with actual
   accepted members and approved commitments. Assign bounded outcomes and
   non-overlapping ownership; the rest of the Squad continues authorized work.
   If the runtime cannot run workers concurrently or persist across requests,
   record the actual sequential/attended plan and response limitation. Do not
   claim a persistent DRF, notification listener, or background coverage.
2. **Triage and pull.** Check local demand, cross-Squad requests, and support
   sources in the order above. Link each request to one authoritative card or
   record; reuse adequate cards, preserve the requesting Squad's context, and
   agree ownership before changing another Squad's artifacts. ProductOwner can
   preauthorize the eligible work class; Kanban still records individual scope,
   outcome, beneficiary/priority evidence, owner, and acceptance criteria.
   Decompose work into atomic, independently verifiable outcomes.
3. **Respect flow.** Use [Kanban Card Flow](../kanban-card-flow/SKILL.md) and
   [One-piece Flow](../fullstack-one-piece-flow/SKILL.md). Require current
   authorization, readiness and WIP admission before implementation. Buffer is a
   capacity/assignment attribute, not a third board bucket, shadow backlog, or
   blanket emergency WIP exception. Missing readiness allows only separately
   authorized triage/refinement/containment, not unapproved implementation.
4. **Handle interruptions explicitly.** When customer/support work preempts an
   internal item, preserve its revision, partial changes, tests, blocker, next
   action, and custodian. Obtain accepted handoffs if ownership changes; have
   Kanban reconcile paused attributes/bucket and WIP before the next admission.
   One active delivery item per DRF is the default. Do not silently discard or
   mark the interrupted work complete; return to it when priority permits.
5. **Improve knowledge when eligible.** Within the standing charter, review the
   collective documentation for actual gaps, then correct or add bounded wiki
   content. Link it to the debt/dissatisfier and verify facts against current
   source, observed behavior, and authorized runbook checks. Use the established
   writer/review/publication route, exclude secrets, and verify links and
   instructions without executing unsafe production steps. If the wiki is
   inaccessible or publication needs review, return a draft in the approved
   product destination and record publication as pending, not accomplished.
6. **Verify and report.** Apply the relevant acceptance criteria and
   [Empirical Done](../fullstack-empirical-done/SKILL.md); provide actual repair,
   regression, documentation, or support-disposition evidence. Acknowledgement
   is not resolution, and a wiki edit alone does not prove improved knowledge or
   eliminated dissatisfaction. Submit completion evidence to Kanban; preserve
   open incidents, follow-ups, and unresolved criteria.
7. **Review demand and protect the reservation.** Report reserved versus consumed
   capacity, work mix, response/age and backlog evidence, interruptions, remaining
   feature capacity, and observed outcomes/uncertainty using approved measures.
   If demand exceeds the buffer, report the deficit and negotiate priority,
   added help, or an authorized allocation change; do not silently borrow the
   other members or drop requests. If no eligible work or knowledge gap remains,
   report that evidence and request bounded replenishment or an allocation
   decision rather than inventing demand or silently converting the reserve to
   delighters. Repeated external demand starving internal debt must remain
   visible; seek sustainable capacity or cause-removal work without reversing
   the external-first rule. Record decisions and handoffs through the designated
   writer and, where assigned, [Historian](../../agents/historian.agent.md).

## Return contract

Return the engagement/policy revision and authority, Squad roster and period,
capacity calculation and allocation (current percentage, 10% default, 50% ceiling, last
delivery-attempt dissatisfier comparison and any change), named DRF/backup and acceptance, actual
runtime/coverage, intake checked and its observation time, prioritized request/
card IDs with beneficiary evidence, starvation/blocked-demand status, active and
interrupted work with WIP/custody, verified outcomes and wiki revision/publication
status, capacity consumed and forecast remaining, gaps and owners, next intake/
review checkpoint, and any required priority or allocation decision.

Creating this skill does not activate a buffer or assign any live Squad.
