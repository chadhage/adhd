---
name: kanban-one-factory-many-squads
description: "Use 1FactoryManySquads to coordinate one Factory and multiple Squads against one authoritative Kanban board. Reconcile cross-Squad ownership, WIP, True Ready reserves, dependencies, scaling recommendations, and evidenced completion without inventing concurrency or scope."
argument-hint: "Provide the Factory, active approved engagement, authoritative board, actual Squad roster, WIP/reserve units and limits, scaling authority, budget, and runtime concurrency evidence."
---

# 1FactoryManySquads

## Outcome

Give Kanban a Factory-wide coordination dimension over existing authorized cards. Enable evidence-based scaling of delivery Squads while preserving one authoritative board, ProductOwner priority, non-overlapping ownership, and engagement-approved WIP and reserves. More Squads are a capacity option, not proof of higher throughput.

The board retains exactly `To Do` and `In Progress`. In this workflow, `Done` means verified completion recorded in the established completion record followed by removal from the unfinished board, never a third bucket. True Ready is a card condition.

## Authority

Use [Atomic and Independent Cards](../factory-mvp-and-recovery/SKILL.md#atomic-and-independent-cards)
when assessing delivery allocations; overlapping scope or unfinished peer
prerequisites cannot supply independent reserve for another Squad.

- Human engagement owner approves operating limits, roster/scaling authority, budget, and material changes. Missing terms require a precise owner decision, not defaults.
- ProductOwner accepts, rejects, and prioritizes demand; VOC supplies evidence.
- Kanban owns board reconciliation, card records, WIP, transitions, reserve maintenance, and bounded readiness assignments. It recommends feasible Squad allocation/scaling but does not mobilize agents, implement work, or authorize scope.
- Factory relays accepted handoffs and mobilizes or reassigns Squads within delegated authority. Changes outside that authority require owner approval.
- Squad supplies technical readiness evidence, coordinates delivery, and verifies integrated outcomes. It cannot start implementation without an authorized True Ready card admitted through Kanban within WIP.

## Procedure

1. Load the active human-approved engagement and product-owned artifact-storage guidance. Establish the Factory scope, board, source backlog/order, actual accepted roster, WIP limit/unit/scope, reserve threshold/unit/scope, replenishment lead time, scaling/reassignment authority, cost limits, and runtime capabilities. Preserve existing records; do not create product artifacts in the framework repository.
2. Have Kanban reconcile the existing cards using its board-reconciliation and card-flow contracts. Every card records stable ID, source/decision reference, outcome, owner, acceptance/exit criteria, dependencies, bucket, status evidence, blocker, next action, and update date. Missing facts remain visible gaps; incomplete cards cannot count as True Ready. No speculative cards or busywork may be created to justify capacity.
3. Maintain a cross-Squad view in the existing board/report, not a competing board or new bucket. For each Squad record actual accepted members, assigned card IDs, current activity evidence, integration/write ownership, dependencies, next eligible assignment, reserve allocation, blocker, expected finish with uncertainty, and next action. Reconcile the Factory-wide total by distinct card IDs; never sum overlapping assignments or count one reserve card for multiple Squads.
4. Identify independent, authorized True Ready outcomes in ProductOwner order. Test candidate allocations against global and applicable per-Squad WIP, approved reserves after the proposed admission, dependency readiness, shared-write constraints, integration capacity, budget, and actual runtime concurrency. Preserve one-piece flow within each Squad; member count does not authorize a matching number of active cards.
5. Recommend adding, retaining, resizing, or reassigning Squads only from this evidence. Before any scale trial, record a comparable baseline window and owner-approved measures for throughput/lead time, quality/rework, integration contention, blocked time, and incremental burn; state the hypothesized mechanism, minimum useful change, observation window, and rollback threshold. Compare equivalent work/conditions and disclose uncertainty; more concurrent agents or raw card count alone do not demonstrate benefit. Return proposed roster, card allocation, expected throughput mechanism, incremental cost, contention risks, success measure, rollback trigger, and authority reference. Factory applies only authorized changes and obtains receiving-role acceptance. If limits, approval, or independent work are absent, report the exact gap rather than claiming scale-out readiness.
6. Serialize board admission and record updates through Kanban to prevent duplicate claims. Recheck current ownership, True Ready evidence, WIP headroom, and reserve under the board's designated-writer/version-check protocol before each admission. Assignment alone leaves a card in `To Do`; move it to `In Progress` only on concrete start evidence. If another Squad already owns the outcome, resolve ownership before dispatch. Shared interfaces and collision-prone files need one integration owner and explicit serialized write ownership. If atomic/serialized updates cannot be enforced by the available board/runtime, do not claim concurrent admission safety; use a single dispatcher or sequential admissions.
7. At handoffs, material state/dependency/authority changes, and cycle checkpoints, reconcile actual progress and eligible reserve. Trigger replenishment before the current assignment finishes using approved lead time, and when the next authorized True Ready assignment is missing or reserve is below or forecast below its approved threshold. Kanban assigns bounded readiness refinement through Factory; Squad returns evidence without self-authorizing implementation. Counts and forecasts must state their units, sources, and uncertainty.
8. If no authorized candidate can replenish reserve, or scaling exposes an impending starvation or contention incident, alert Factory to convene exactly one Squad, one ProductOwner, one VOC, and one Kanban under Factory MVP and Recovery. Keep affected IDs, deficit, owner, and next action visible and continue unaffected authorized work. Request a precise human decision when required; do not hide quiescence or invent demand.
9. Require Squad's integrated acceptance/Definition of Done evidence, including cross-Squad interface validation where relevant. Kanban records verified completion in the established completion record before removing cards. Preserve failed criteria and residual work truthfully. Reconcile global/per-Squad totals, remaining reserves, ownership, and completed IDs before the next allocation.

## Runtime and Scale-In Checks

Configured agents and sequential subagent calls are not concurrent execution. Report observed runtime mode and limitations; do not claim multiple active Squads or throughput gains without observed acceptance and progress. If concurrent execution is unavailable, return a feasible sequential allocation and mark concurrency unverified.

Scale-in or reassignment must preserve current card ownership, partial work, integration responsibility, and handoff acceptance. Do not abandon unfinished work or silently demobilize a Squad. Any change to an approved minimum roster, scope, budget, or operating window needs its required owner decision.

Apply the No Avoidable Halt and furlough contract in [Factory MVP and Recovery](../factory-mvp-and-recovery/SKILL.md). Completion or blockage ends an assignment, not the Squad's operating mandate. Factory obtains the next accepted authorized handoff or records the precise restriction; Kanban reports current/next IDs, accepted custody, last observed progress/evidence, reserve, and engagement-approved waiting/acknowledgement/liveness deadlines and breaches. Missing deadlines or authority go to the owner, with an empirically derived provisional proposal for deadlines; no indefinite hidden queueing or arbitrary timeouts.

A nonempty board triggers dispatch, authorized refinement, or recovery, never automatic furlough. Every voluntary furlough or other stoppage requires the human invoker's explicit, recorded approval before work stops, after the invoker receives an evidence-based justification and concrete resume guidance; any separately designated owner approval also remains required. Preserve partial work, accepted receiving ownership, reason, affected IDs, restart owner, review date, and reopen trigger. Immediate safety containment stops only the affected unsafe action; preserve custody and pending transfer evidence. Queue exhaustion still requires FactoryLauncher validation.

Factory-wide shutdown requires the human invoker's explicit, recorded approval and verified authority. Queue validation, scaling in, or individual Squad furlough never independently authorizes Factory closure. Authority/resource/runtime gaps remain visible recovery incidents with affected actions blocked and actual execution limitations disclosed; continue independently authorized safe work without bypassing limits or fabricating activity.

Queue-based shutdown also requires dated `To Do = 0` and `In Progress = 0` attestations from FactoryLauncher, Factory, every Squad, VOC, Kanban, and every ProductOwner including associates, reconciled to one authoritative board. Launcher independently validates unanimous role-instance consensus and presents it for explicit human-invoker approval; consensus and validation do not replace that approval. Missing/stale/dissenting/nonzero attestations block closure; each agent instead submits evidence-backed dissatisfier-first improvement or bounded discovery proposals through VOC under the shared recovery contract. Do not duplicate counts, sign for another Squad, or invent demand.

Definitions and restart packets are not persistent execution. Unattended continuity requires separately authorized, tested external supervision with bounded restarts, duplicate-run prevention, serialized Kanban updates, and stop/authority/budget enforcement. Report interruptions and the real resume route if unavailable; do not install or claim a supervisor merely from this skill. Exercise the shared recovery skill's continuity acceptance scenarios in an authorized product environment before claiming assurance.

## Completion Checks

- Exactly one authoritative two-bucket board exists; Factory-wide totals reconcile to distinct card IDs.
- Every active card has concrete activity evidence and a single accountable owner; shared-write and integration boundaries are explicit.
- WIP, reserve, roster, and cost limits come from the active approved engagement; proposed changes cite authority or remain pending.
- Each reserve card is counted once, is authorized and True Ready, and is not a current active assignment.
- All mobilized roles and claimed concurrency/progress have observed evidence; recommendations are distinguished from execution.
- Completion removal has empirical evidence in the established record; replenishment and unresolved starvation remain visible.

## Return Contract

Return the engagement/authority reference, dated board reconciliation, requested versus actual roster/runtime mode, cross-Squad card/ownership map, global and per-Squad WIP/reserve counts with IDs and units, dependency/write-conflict controls, scaling recommendation versus observed execution, replenishment triggers/assignments, completion evidence, costs/uncertainty, blockers, and exact pending owner decision.

## Example Prompts

- "1FactoryManySquads: assess whether this Factory can add another Squad using the existing approved cards and limits."
- "Reconcile these Squads' assignments and ready reserves; do not change roster or scope."
- "Recommend a scale-in handoff that preserves active work and stays within the approved engagement."