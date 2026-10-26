---
name: kanban-iterative-and-incremental
description: "Use IterativeAndIncremental to refine Kanban items for subsequent iterations beyond iteration 0, iteration 1, and MVP stages. Apply observed feedback to evolving capabilities and integrated increments while preserving ProductOwner priority, authorization, True Ready reserves, WIP, and completion evidence."
argument-hint: "Provide the active engagement, board/backlog, current integrated product baseline, prior demo and outcome evidence, next-iteration goal, approved limits, and decision owners."
---

# IterativeAndIncremental

## Outcome and Definitions

Refine authorized unfinished work into small, testable outcomes for subsequent iterations, using the cumulative product and observed learning rather than treating the MVP as a finished specification. Optimization means improving outcome clarity, feedback speed, risk reduction, and integrated delivery within approved constraints, not maximizing card count or utilization.

- **Iterative:** revisit an existing capability or design using observed feedback; change the hypothesis, behavior, or approach and verify whether the change improved its intended outcome.
- **Incremental:** add a bounded, usable capability to the integrated product and verify both the new behavior and retained capabilities.
- A card can do both. A prototype or research result may inform either, but is not automatically a delivered increment. A later iteration is not simply another calendar interval or a disconnected component.

Iteration 0, iteration 1, and MVP are engagement-specific labels, not mandatory sequential phases or approval exemptions. Read the actual baseline and active mandate. Keep the MVP's validated capabilities and applicable quality gates while revisiting unsupported assumptions; do not assume everything after MVP is feature expansion.

## When to Use

- Refine cards for a subsequent iteration after a cumulative demo, operational observation, defect, or new authorized evidence.
- Split an oversized future outcome into demonstrable vertical increments or improve a previously delivered capability.
- Reconcile learning, unfinished scope, dependencies, and the next True Ready reserve without rewriting historical completion.

## Roles and Inputs

Read the product-owned artifact-storage guidance and canonical engagement before persisting product records. Use the existing authoritative backlog, two-bucket board, completion record, demo/outcome ledger, and decision history; never store product engagement outputs in this framework repository.

VOC supplies evidence and counterevidence. ProductOwner accepts, rejects, defers, retires, or prioritizes demand within approved authority. Kanban owns card records, reconciliation, readiness assignments, WIP, and transitions. Squad supplies feasibility, sizing, dependency, testability, and readiness evidence and delivers only an authorized True Ready card. Factory coordinates handoffs and recovery. The human owner retains material scope, investment, future-iteration, and release decisions.

Obtain current/next iteration authority, goal, baseline revision, acceptance/Definition of Done, approved WIP and reserve units/scopes, replenishment lead time, budget, permissions, and decision route. Missing limits or authority are visible gaps requiring the appropriate owner; never infer approval from a successful demo or prior iteration.

## Procedure

1. **Establish the cumulative baseline.** Identify the latest actually integrated product, delivered capabilities, observed acceptance and quality evidence, prior hypotheses, and unresolved work. Separate expected benefits from measured outcomes. Preserve original forecasts, failed tests, and completion dates; a plan or MVP label is not a baseline verification.
2. **Collect discriminating feedback.** Use authorized demo observations, VOC findings, usage evidence, incidents, defects, and delivery constraints. For each proposed change, name the affected outcome, evidence/source/date, counterevidence, uncertainty, and the cheapest next observation that could disconfirm it. Do not infer customer intent or causality from telemetry alone.
3. **Propose the learning response.** Classify each candidate as iterative improvement, incremental capability, a combination, or bounded discovery/readiness work. Propose retaining, revising, splitting, deferring, rejecting, or retiring it. Route evidence interpretation to VOC and demand disposition/priority to ProductOwner; Kanban cannot decide product value or authorize new work. If evidence is insufficient, propose a bounded validation with exit criteria rather than speculative implementation.
4. **Shape a small integrated outcome.** With Squad feasibility evidence, define a vertical slice that can be demonstrated against the cumulative baseline. State user/operational outcome, retained behavior, interfaces, dependencies, failure cases, guardrails, and discriminating acceptance tests. Avoid layer-only cards, obligatory feature additions, premature architecture expansion, and timeboxes invented from historical examples. Record estimates and uncertainty rather than commitments without evidence.
5. **Apply approved card changes through Kanban.** Create or update records only from authorized backlog, iteration, or recovery decisions. Every card records stable ID, source/decision, outcome, owner, acceptance/exit criteria, dependencies, bucket, status evidence, blocker, next action, and update date. Also link the baseline, feedback/hypothesis, iterative/incremental classification, and expected verification. For approved splits, preserve parent/source lineage and identify retained versus newly separated scope without double-counting; do not silently merge uncertain identities.
6. **Preserve unfinished and completed truth.** Carry unfinished work forward visibly with partial evidence and remaining criteria, subject to the next mandate. Do not mark it complete at an iteration boundary, reset its age/history, or lower criteria to manufacture success. Record changes or retirement with authority and rationale. Defects or new improvements to a completed capability become traceable authorized follow-up work; do not erase the historical completion record or imply prior acceptance covered new scope.
7. **Prepare the next reserve before starvation.** Kanban reconciles distinct authorized `To Do` cards against current True Ready evidence and approved reserve/WIP units and limits. Assign only bounded readiness refinement through Factory to Squad; assignment alone is not readiness. Trigger replenishment before the current assignment finishes using approved lead time and when the next authorized ready assignment is missing or reserve is below or forecast below its threshold. No authorized candidate triggers the required Factory recovery panel; keep the deficit visible and continue unaffected authorized work.
8. **Close the feedback loop after authorized delivery.** Squad verifies the changed capability, adjacent regression risks, and integrated product against acceptance/Definition of Done. Demonstrate cumulative behavior and compare observations with the predeclared outcome and guardrails. Kanban records evidenced completion before removing the card. ProductOwner reviews value/disposition and VOC interprets feedback; use the next approved decision to refine subsequent work. A successful build, demo, or learning result alone is not realized value or release authority.

## Branching and Completion Checks

- Inadequate evidence: keep the hypothesis provisional and seek authorized validation, not fabricated demand.
- Dependency, feasibility, permission, or cost gap: expose the blocker and owner; refinement cannot bypass the implementation gate.
- Product direction changes materially: obtain the required owner approval, preserve the prior baseline, and reconcile affected cards rather than silently overlaying scope.
- No useful authorized next work: use Factory MVP and Recovery; do not create busywork or claim resumed progress without observation.
- Exactly `To Do` and `In Progress` remain live buckets. True Ready and iterative/incremental classifications are card attributes, not buckets; verified completion is recorded elsewhere and removed from the unfinished board.
- Every accepted card change links evidence and authority; totals, parent-child scope, and reserve reconcile to IDs. Future plans are not prefilled completion evidence.
- The next delivery slice has approved authority, feasible dependencies, testable exit criteria, and True Ready evidence. Improvements and benefits remain hypotheses until observed.

## Source Basis and Limitations

This is an original application to the ADHD role/board contracts, not a claim that the cited publications prescribe Kanban, these roles, reserve thresholds, iteration numbering, or MVP gates.

- Craig Larman and Victor R. Basili, [Iterative and Incremental Development: A Brief History](https://www.craiglarman.com/wiki/downloads/misc/history-of-iterative-larman-and-basili-ieee-computer.pdf), *IEEE Computer*, June 2003. PDF text was retrieved on 2026-10-11. Its historical account supports repeated development/feedback and evolving integrated builds rather than assuming a single-pass, fully predetermined lifecycle. Historical examples are not universal performance guarantees or prescribed iteration durations.
- [Cockburn PDF in the May 2008 CrossTalk archive](https://web.archive.org/web/20120526153630/http://www.crosstalkonline.org/storage/issue-archives/2008/200805/200805-Cockburn.pdf), as supplied by the user. The archived document could not be retrieved on 2026-10-11 (blocked web fetch and timed-out download). Its title and contents remain unverified here. Do not attribute the definitions or procedures above to this unread document; verify the primary text before adding Cockburn-specific claims.
- [DOD-STD-2167A Notice 1](https://everyspec.com/DoD/DoD-STD/download.php?spec=DOD-STD-2167A_NOTICE-1.010991.pdf), December 5, 1994. PDF text was retrieved on 2026-10-11. This is a cancellation notice for the February 29, 1988 standard and directs future acquisitions to MIL-STD-498. It does not define iterative/incremental practices, establish current procurement obligations, or authorize any workflow. Do not conflate the notice with the canceled standard or its replacement; verify governing requirements separately where applicable.

## Return Contract and Examples

Return baseline and active authority, source/feedback evidence and uncertainty, per-card proposed versus approved changes, ProductOwner decisions, split/carryover lineage, readiness/verification gaps, reconciled WIP/reserve, pending owner decisions, and observed outcomes separately from hypotheses.

- "IterativeAndIncremental: refine our post-MVP cards from the latest cumulative demo; propose changes before applying unapproved scope."
- "Prepare the next iteration's authorized True Ready reserve while preserving unfinished work and completed history."
- "Separate this candidate into an iterative usability improvement and an incremental capability; request ProductOwner disposition and retain source lineage."