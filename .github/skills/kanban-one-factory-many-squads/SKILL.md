---
name: kanban-one-factory-many-squads
description: "Use 1FactoryManySquads for concurrent Factories and Squads sharing one product backlog and roadmap, with one common Kanban per Squad. Coordinate swarms, independent cohorts, scoped writers, WIP/reserves and interruption-safe handoffs without inventing concurrency or authority."
argument-hint: "Provide the shared product planning and allocation records, Factory/Squad boards and roster, accepted engagements, WIP/reserve limits, ownership, budget, and runtime concurrency evidence."
---

# 1FactoryManySquads

## Outcome

Coordinate multiple Squads per Factory and multiple Factories for the same
product. Preserve shared product direction, one common Kanban per Squad,
non-overlapping ownership, integrated outcomes and approved WIP/reserves.
More workers are a capacity option, not proof of higher throughput.

Each board retains exactly `To Do` and `In Progress`. `Done` means verified
completion recorded before removal, never a third bucket. True Ready is a
card condition; a cohort or task is not automatically another card.

## Shared Product Planning and Squad Kanban

- Bind one stable product identity, one product backlog and one roadmap across
  all Factories and Squads, under a single accountable ProductOwner or chief.
  Record their canonical locations/revisions in every Factory's records index.
  Do not fork the backlog or roadmap by Factory, Squad, branch or worktree.
  Scoped planning views and associate proposals reference the same item IDs,
  decisions, priority and dependencies; they are not independent authorities.
- Maintain one common two-bucket Kanban per Squad, shared by all its members
  and card cohorts. It may be an indexed board partition or an established
  filtered view over canonical records. Member/cohort queues are assignment
  views, not separate boards or copies of cards. Factory/product rollups are
  reconciled views, not additional live buckets or competing card authorities.
- Use the existing product-wide allocation record/index to map each card ID
  to its canonical location, Factory, one owning Squad board and accountable
  delivery owner. Unallocated authorized work remains visible in the shared
  source queue; allocation must not duplicate it on a Squad board. Preserve
  every unfinished item and count each ID once across source and assigned
  inventories. A reserve card cannot be promised to two Squads or Factories.
- Apply product, Factory and Squad WIP and reserve units/limits from accepted
  engagements. Before a claim, verify product-wide ownership, current readiness,
  source/board revisions, permissions, integration capacity and remaining budget.
  Pending starts consume capacity reservations under the approved WIP policy;
  a reservation is not concrete start evidence or implementation authority.
- Designate one Kanban writer per board and one writer for shared allocation
  and capacity records. Independent board writers may run concurrently within
  approved, disjoint capacity reservations whose sum respects every aggregate
  limit. Without such reservations or atomic allocation support, serialize only
  the short shared claim/admission updates, not independent delivery. Recheck
  revisions and recompute headroom on contention; advisory locks and this
  protocol do not prove a cross-record transaction service.
- Keep product planning, shared interfaces, integration, completion and Git
  operations under their designated writers. Independent analysis, isolated
  worktrees and disjoint board updates need no whole-Factory write lock.
  Factories exchange allocation/dependency deltas through the indexed owners;
  they cannot reprioritize the shared backlog or seize another Factory's work.
- Extend the existing memory/assignment binding with product, Factory, Squad
  and board IDs, shared backlog/roadmap and allocation revisions, card/task IDs,
  actual executor, integration owner and handoff reference. Reuse a shared role
  assignment only within its accepted capacity and count that shared role
  assignment and its usage once, not as a new worker in every Factory.
- Existing engagements keep their accepted topology; a migration needs explicit
  authority, reconciled stable IDs/locations, preserved history and renewed
  affected acceptance. Do not split a legacy board or expand roster, WIP,
  operating profile, scope or budget merely because this framework changed.

## Concurrent Dispatch

1. Factory identifies eligible Squads; Squad maintains a ready set of atomic
   tasks for each admitted card. Record real task dependencies, accepted member
   ownership, inputs/interfaces and discriminating checks. An unfinished peer
   card cannot be a True Ready prerequisite. Multiple independent card cohorts
   require approved WIP, disjoint member/write ownership and integration capacity;
   member count alone does not authorize more active cards.
2. Launch independent Squad/cohort/member assignments before waiting for any
   sibling result, using the actual runtime's nonblocking concurrent dispatch.
   Retain invocation IDs and process supported completion/progress notifications.
   Do not wait for every member or Squad, or a whole discovery/refinement batch,
   before advancing an eligible task. A real prerequisite still blocks its
   dependent task, not unrelated work.
3. Reconcile each result promptly against its source revision and validation,
   then release newly eligible dependent tasks. Continue same-card work with an
   available accepted member; a returned one-shot instance needs a complete new
   assignment and actual acceptance, not an imagined wake-up message. Within
   approved capacity, dispatch a new independent assignment while siblings run.
4. Preserve one-piece flow per member and per card cohort, not a Squad-wide
   single-card barrier. A member has one active owned task at a time unless an
   explicitly accepted pairing/review arrangement says otherwise. Do not assign
   one member's full capacity to multiple cohorts or consume the DRF reserve.
   Integrate small verified deltas through the integration owner; gate the whole
   card on its combined outcome, not on another independent cohort finishing.
5. Optional analysis, reporting and perfect certainty must not delay authorized
   dispatch after required gates pass. Replenishment, next-assignment preparation
   and relevant reviews overlap delivery within the accepted profile and budget.
   Shared-write critical sections end before long implementation or test calls.
6. Record actual starts, meaningful progress, overlap and capacity restrictions.
   Sequential calls or a configured roster do not prove concurrency. Preserve
   an accepted parallel/supervised guarantee and surface missing capability;
   a sequential alternative is degraded operation requiring the applicable
   restoration or profile decision, never a silent success-shaped substitution.

## Handoff Continuity

1. Use the existing assignment/handoff record for `offered -> accepted ->
   started -> reconciled` evidence, not new board buckets. Give each transfer
   a stable handoff ID, card/task and executor IDs, expected source and target
   revisions, authority, criteria, partial artifacts, validation debt, next
   action and acknowledgement/progress checkpoint. Retries reuse the same
   handoff ID; an offer or sent message is not a receiver acknowledgement.
2. Prepare the next eligible assignment before the current one finishes using
   approved lead time. Preparation and conditional acceptance do not start
   implementation, mark `In Progress`, or bypass WIP/readiness revalidation.
   Use the predeclared complete-assignment acceptance protocol for one-shot
   delegates, and reuse valid terms and grants rather than repeat setup.
3. Routine within-Squad pulls and returns use its accepted Squad-Kanban channel
   and bound writer. Factory receives allocation/progress deltas and handles
   cross-Squad changes; unchanged work does not need another round trip through
   Launcher, ProductOwner or every replenishment role. Record verified completion
   with its stable completion ID before board removal, reconcile capacity,
   then dispatch the eligible next work without waiting for a full cycle report.
4. The sender retains custody until verified receiver acceptance and canonical
   owner/location reconciliation. For cross-board/Factory transfer, freeze only
   affected writes, preserve branch/worktree and partial evidence, and have the
   allocation writer commit one current owner under revision control. Without
   atomic storage, serialize the transfer and retain a durable pending cursor;
   do not start a receiver on an uncommitted or contradictory claim. An unknown
   launch outcome must not be treated as abandonment or permission to replay
   consequential work; reconcile actual execution and effects first.
5. Refresh only affected memory bindings and changed prerequisites; an index
   update is not a whole-roster barrier. Acknowledge the relevant binding before
   dependent decisions/writes, while unrelated accepted work continues. Do not
   replay completed setup, duplicate intake/history/completion events or renew
   unchanged human approvals because control moved between agents.
6. On a missed accepted handoff/progress deadline, recover the affected lane
   through its current custodian and authorized alternate, preserving the same
   incident/cursor. One healthy Squad cannot reset another's liveness deadline.
   Report missing authority, budget, permission and revocation explicitly;
   none is extended by waiting or a prepared assignment. Planned bounded
   checkpoints retain real custody/resume routes, not fictional live workers.
7. At checkpoints compare observed offer-to-accept/start latency, blocked time,
   integration contention and VOC-to-Done Done lead time with the approved
   baseline. Preserve failed attempts and residual gaps; configuration/static
   tests do not establish live-host continuity or a measured acceleration.

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

1. Load the active human-approved engagements and product-owned storage guidance. Bind shared product planning, the product-wide allocation inventory, each Factory/Squad scope and board, actual accepted roster, WIP/reserve units and limits, replenishment lead time, scaling/reassignment authority, cost limits and runtime capabilities. Preserve existing records; do not create product artifacts in the framework repository.
2. Have Kanban reconcile the existing cards using its board-reconciliation and card-flow contracts. Every card records stable ID, source/decision reference, outcome, owner, acceptance/exit criteria, dependencies, bucket, status evidence, blocker, next action, and update date. Missing facts remain visible gaps; incomplete cards cannot count as True Ready. No speculative cards or busywork may be created to justify capacity.
3. Maintain cross-Squad/Factory rollups over the indexed Squad boards and unallocated source inventory. For each Squad record actual accepted members/cohorts, assigned IDs, activity evidence, integration/write ownership, dependencies, next eligible assignment, reserve allocation, blocker, expected finish with uncertainty and next action. Reconcile totals by distinct IDs; never sum overlapping assignments or count one reserve card for multiple Squads.
4. Identify independent, authorized True Ready outcomes in ProductOwner order. Test allocations against product/Factory/Squad WIP, approved reserves after admission, dependency readiness, shared-write constraints, integration capacity, budget and actual runtime concurrency. Preserve one-piece flow per member/card cohort; member count does not authorize a matching number of active cards.
5. Recommend adding, retaining, resizing, or reassigning Squads only from this evidence. Before any scale trial, record a comparable baseline window and owner-approved measures for throughput/lead time, quality/rework, integration contention, blocked time, and incremental burn; state the hypothesized mechanism, minimum useful change, observation window, and rollback threshold. Compare equivalent work/conditions and disclose uncertainty; more concurrent agents or raw card count alone do not demonstrate benefit. Return proposed roster, card allocation, expected throughput mechanism, incremental cost, contention risks, success measure, rollback trigger, and authority reference. Factory applies only authorized changes and obtains receiving-role acceptance. If limits, approval, or independent work are absent, report the exact gap rather than claiming scale-out readiness.
6. Use the scoped writers and allocation protocol above to prevent duplicate claims. Recheck current ownership, True Ready evidence, all applicable WIP headroom and reserve before each admission. Assignment alone leaves a card in `To Do`; move it to `In Progress` only on concrete start evidence. Resolve an existing Squad/Factory claim before dispatch. Shared interfaces need one integration owner and serialized writes. If enforcement is unavailable, serialize the affected admissions and disclose the limitation, not all independent delivery.
7. At handoffs, material state/dependency/authority changes, and cycle checkpoints, reconcile actual progress and eligible reserve. Trigger replenishment before the current assignment finishes using approved lead time, and when the next authorized True Ready assignment is missing or reserve is below or forecast below its approved threshold. Kanban assigns bounded readiness refinement through Factory; Squad returns evidence without self-authorizing implementation. Counts and forecasts must state their units, sources, and uncertainty.
8. If no authorized candidate can replenish reserve, or scaling exposes an impending starvation or contention incident, alert Factory to convene exactly one Squad, one ProductOwner, one VOC, and one Kanban under Factory MVP and Recovery. Keep affected IDs, deficit, owner, and next action visible and continue unaffected authorized work. Request a precise human decision when required; do not hide quiescence or invent demand.
9. Require Squad's integrated acceptance/Definition of Done evidence, including cross-Squad interface validation where relevant. Kanban records verified completion in the established completion record before removing cards. Preserve failed criteria and residual work truthfully. Reconcile global/per-Squad totals, remaining reserves, ownership, and completed IDs before the next allocation.

## Runtime and Scale-In Checks

Configured agents and sequential subagent calls are not concurrent execution. Report observed runtime mode and limitations; do not claim multiple active Squads or throughput gains without observed acceptance and progress. If concurrent execution is unavailable, return a feasible sequential allocation and mark concurrency unverified.

Scale-in or reassignment must preserve current card ownership, partial work, integration responsibility, and handoff acceptance. Do not abandon unfinished work or silently demobilize a Squad. Any change to an approved minimum roster, scope, budget, or operating window needs its required owner decision.

Apply the No Avoidable Halt and furlough contract in [Factory MVP and Recovery](../factory-mvp-and-recovery/SKILL.md). Completion or blockage ends an assignment, not the Squad's operating mandate. Factory obtains the next accepted authorized handoff or records the precise restriction; Kanban reports current/next IDs, accepted custody, last observed progress/evidence, reserve, and engagement-approved waiting/acknowledgement/liveness deadlines and breaches. Missing deadlines or authority go to the owner, with an empirically derived provisional proposal for deadlines; no indefinite hidden queueing or arbitrary timeouts.

A nonempty board triggers dispatch, authorized refinement, or recovery, never automatic furlough. Every voluntary furlough or other stoppage requires the human invoker's explicit, recorded approval before work stops, after the invoker receives an evidence-based justification and concrete resume guidance; any separately designated owner approval also remains required. Preserve partial work, accepted receiving ownership, reason, affected IDs, restart owner, review date, and reopen trigger. Immediate safety containment stops only the affected unsafe action; preserve custody and pending transfer evidence. Queue exhaustion still requires FactoryLauncher validation.

Factory-wide shutdown requires the human invoker's explicit, recorded approval and verified authority. Queue validation, scaling in, or individual Squad furlough never independently authorizes Factory closure. Authority/resource/runtime gaps remain visible recovery incidents with affected actions blocked and actual execution limitations disclosed; continue independently authorized safe work without bypassing limits or fabricating activity.

Queue-based shutdown requires dated zero-work attestations from FactoryLauncher,
Factory, every in-scope Squad/Kanban and product-owner instance, and VOC,
reconciled to the indexed source and Squad inventories. Launcher independently
validates unanimous consensus and obtains explicit human-invoker approval.
A Factory-local zero count cannot imply product-wide exhaustion or stop another
Factory; product-wide closure includes every bound Factory/Squad. Missing,
stale, dissenting or nonzero evidence blocks closure and routes bounded sourced
improvement/discovery proposals through VOC. Do not duplicate counts, sign for
another role or invent demand.

Definitions and restart packets are not persistent execution. Unattended continuity requires separately authorized, tested external supervision with bounded restarts, duplicate-run prevention, serialized Kanban updates, and stop/authority/budget enforcement. Report interruptions and the real resume route if unavailable; do not install or claim a supervisor merely from this skill. Exercise the shared recovery skill's continuity acceptance scenarios in an authorized product environment before claiming assurance.

## Completion Checks

- One shared product backlog/roadmap and one common two-bucket board per Squad are bound; product/Factory totals reconcile to distinct canonical card IDs.
- Every active card has concrete activity evidence and a single accountable owner; shared-write and integration boundaries are explicit.
- WIP, reserve, roster, and cost limits come from the active approved engagement; proposed changes cite authority or remain pending.
- Each reserve card is counted once, is authorized and True Ready, and is not a current active assignment.
- All mobilized roles and claimed concurrency/progress have observed evidence; recommendations are distinguished from execution.
- Completion removal has empirical evidence in the established record; replenishment and unresolved starvation remain visible.

## Return Contract

Return shared planning/allocation and engagement revisions, dated per-board
reconciliation, requested/actual roster and runtime, cross-Factory/Squad
card/cohort ownership, product/Factory/Squad WIP and reserve IDs/units, ready-set
dispatch/overlap evidence, scoped write/integration controls, handoff cursors
and latency/gaps, scale recommendation versus observed results, replenishment,
completion evidence, costs/uncertainty and exact pending owner decisions.

## Example Prompts

- "1FactoryManySquads: assess whether this Factory can add another Squad using the existing approved cards and limits."
- "Reconcile these Squads' assignments and ready reserves; do not change roster or scope."
- "Recommend a scale-in handoff that preserves active work and stays within the approved engagement."