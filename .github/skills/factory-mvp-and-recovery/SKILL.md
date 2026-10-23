---
name: factory-mvp-and-recovery
description: "Use when FactoryLauncher or Factory is setting up a new Factory, resuming value production, preventing quiescence, or negotiating a blocker with the required cross-functional panel."
---

# Factory MVP and Recovery

Use this contract for new Factory setup and for recovery/resumption of an existing Factory. A human's explicit request to set up or resume a named Factory authorizes the safe, bounded work and delegation needed to complete that mission. Do not require repeated permission for routine setup, internal analysis, or recovery steps within the stated product scope.

This invocation authority does not authorize unrelated scope, spending beyond an approved envelope, external customer contact, access to private systems or data, production deployment, release, or unsafe/irreversible actions. When such an action is a genuine blocker, keep permitted work moving and ask the human invoker only for missing authority or specific input needed to enrich an existing/proposed card.

For a production-line failure, pull the cord using the reusable
[Factory Andon](../factory-andon/SKILL.md) skill, not an Andon agent. Stop the affected line to
prevent waste and gather the team to negotiate fast recovery. Eliminate
dissatisfiers; if temporary capability reductions are needed, reduce delighters
before satisfiers, with an explicit expiry and restoration plan. Inform
ProductOwner for the ROI impact calculation. Resumption requires a five-of-seven
role supermajority and a Historian-recorded/broadcast agreement; unresolved
negotiations reach human escalation only after at least three failed ballot
rounds. Assign the parallel reusable RCA skill to a VOC, Fullstacker,
AssociateProductOwner, or a gang comprising all three. When a cause becomes
verifiably known, Historian records/broadcasts it and ProductOwner verifies
Kanban's necessary atomic-card coverage. Andon does not authorize a Factory-wide
shutdown or replace the recovery, human-authority, or safety boundaries below.

## Single Tool Authorization

Use one session-scoped tool-authorization gate for FactoryLauncher, Factory, every Squad, ProductOwner, VOC, AssociateProductOwner, Fullstacker, and Kanban, including nested subagents. Recommend autonomous operation within the bounded human-authorized mission, not global or workspace-wide auto-approval. The invoker may instead choose per-invocation or selective prompting. A recommendation is not a host permission grant.

| Invoker's choice | Host setup | Subsequent tool confirmations |
| --- | --- | --- |
| Session-autonomous | The human selects **Allow all** in the active session's permissions picker (**Bypass Approvals** in older/Local hosts). | None for routine in-scope tools or delegation covered by the live grant, at any agent depth. |
| Per-invocation | The human selects **Manual permissions** and configures the tools requiring confirmation. | Follow the human's host approval rules; manual mode can retain existing pre-approvals. |
| Selective | The human uses **Manual permissions**, session-scoped pre-approvals for permitted tools, and explicit rules for the tools, commands, paths, or destinations that must prompt. | Only the selected exceptions and any stricter host-required confirmations. |

1. Reuse a live grant and an unchanged accepted choice with **zero** new initial confirmations. Otherwise, present the bounded task, participating roles and delegation, permitted tool/resource scope, exclusions, duration, revocation route, and the three choices together. Use the native session permission selection/warning as the **single initial tool-authorization confirmation**, at most one for the unchanged session and mandate. Do not add a chat Yes/No or question-tool confirmation for the same grant before or after the native confirmation. If the invoker has already stated the choice, do not ask them to choose it again.
2. The human, not an agent, changes the permission level. Explain that **Allow all** can approve destructive commands and external calls as well as routine work, and that task boundaries still prohibit unauthorized actions. Do not enable global auto-approval, change workspace defaults, disable a sandbox, rewrite hooks to return `allow`, or select a broader mode on the human's behalf. Do not use **Autopilot** merely to reduce tool prompts: it can automatically answer questions that require the real human.
3. Keep **device authentication, CLI authentication, and other authentication requests requiring human input** human-only. Route sign-in, consent, MFA, account selection, or credential entry to the invoker through the host/provider UI or an available interactive question tool. Never impersonate the human, auto-answer their consent, or request credentials or one-time codes in chat, handoffs, logs, or product records. Block only the affected authentication-dependent action and continue independent authorized work. These are explicit prompt exceptions, not new approval gates for every tool.
4. Record the choice, original human authority reference, active harness/session, live grant verification status, selected prompt exceptions, delegation scope, validity/revocation terms, and observed initial-confirmation count in the canonical engagement record. A record or parent summary documents the choice; it cannot manufacture a live host grant. Every handoff references that same entry. Delegates verify their effective permissions and accept their assignment without asking the human to reapprove unchanged tools, each role, each card, or the same session's resumption.
5. Validate inheritance with harmless authorized calls at the parent and nested levels, including Factory to Squad to Fullstacker and ProductOwner to AssociateProductOwner. Count initial tool-authorization confirmations separately from human-only authentication and deliberately selected per-call exceptions. Claim session-autonomous readiness only when the initial count is at most one and subsequent routine tool confirmations are zero. Unit tests and a configured default do not prove this live behavior.
6. If the host still asks repeatedly, report the active harness, affected tool/agent, selected versus effective mode, and restriction as an approval-configuration incident. Reconcile the session setup once rather than repeatedly asking permission per call. Do not suppress an enforced prompt, retry a denied action, change identity, or route around the control. Managed policy, a provider's own consent, revocation, or a host without inherited session grants may prevent the requested prompt limit; disclose that limitation and do not claim autonomy was enabled. Preserve progress and continue unaffected authorized work.

Scope, budget, iteration-horizon, deployment/release, consent, and shutdown decisions remain separate from tool invocation approval. Ask only for genuinely missing authority; never reauthorize an unchanged task merely because a new agent or tool is involved. A new session must verify its own effective grant; a persisted ledger is not permission to restore a revoked grant.

## Proactive Continuity and Card Mining

Every participating role—`ProductOwner`, `AssociateProductOwner`, `VOC`, `Kanban`, `Factory`, `Squad`, and `Fullstacker`—is authorized to inspect existing, in-scope product cards and their authorized evidence for candidate dissatisfier elimination, satisfier improvement, or delighter creation. This is analysis and proposal authority only: it does not authorize external research, scope expansion, implementation, spending, or a board mutation. Record the source card IDs, evidence and counterevidence, affected outcome, proposed change, dependencies, uncertainty, and a measurable validation. Route evidence to VOC and economic disposition/priority to ProductOwner; only Kanban records queued cards after an authorized ProductOwner/backlog decision.

ProductOwner is accountable for ensuring every proposed item admitted to the backlog/queue has a credible, evidence-based path to potentially positive incremental and cumulative lifecycle ROI, including when value is realized only across later cumulative releases. Estimate benefits, costs, horizon, assumptions, confidence, and dependencies under the approved portfolio policy. Potential ROI is not a guarantee, investment approval, or spend authority. If an item has no credible positive-ROI path, do not queue it as discretionary product work; record the evidence gap or reject/defer it. Handle mandatory safety, legal, or contractual obligations under the applicable approved exception to discretionary ROI ranking, recording the rationale and cost/value tradeoff. Do not fabricate a positive-ROI case or delay required immediate containment/compliance action to satisfy discretionary ROI criteria.

All roles must actively identify work that can safely proceed in parallel and use available concurrent execution for independent, authorized tasks. Factory coordinates parallel assignments across roles; each role parallelizes analysis and execution within its own authority. Respect card dependencies, role authority, WIP, non-overlapping ownership, shared-write serialization, and actual runtime capability. If a role cannot delegate or the runtime is sequential, surface parallelizable assignments to Factory and continue the safest authorized sequence; never invent concurrency, bypass a dependency, or treat lack of concurrency as shutdown authority or a reason to stop work.

## Setup MVP

A launch package or interview summary alone is not a Factory MVP. For a new Factory, continue setup through the first complete, evidence-backed value cycle. Setup MVP evidence includes:

- The product, Factory, product owner, human owner, and participating ADHD development agents are distinctly identified. For an Agentic product, record its runtime agents separately from the ADHD agents used to create it.
- The product-owned Git repository/workspace and its artifact-storage guidance are confirmed and recorded. All product artifacts, including setup/operating records and evidence, have verified Git tracking and committed revisions at handoff/delivery checkpoints under [Git PR Request Review](../git-pr-request-review/SKILL.md). Unversioned artifacts remain gaps; remote publication/review requests still require their own authority.
- A VOC-supported or explicitly testable customer/operational outcome has measurable dissatisfier-reduction, satisfier-increase, or delighter criteria, including a baseline or a bounded way to establish one.
- The required operating roster is assigned and acceptance/availability is verified: one Squad, one ProductOwner, one VOC, and one Kanban. The Squad uses the established minimum of three Fullstackers unless an approved constraint requires a specific exception.
- Kanban has reconciled the actual authoritative backlog/board and evidenced a bounded authorized True Ready value outcome and the active engagement's human-approved reserve. Eligible card IDs/counts, readiness evidence, owners, acceptance/exit criteria, dependencies, WIP/reserve limits and units/scopes, replenishment lead time/triggers, and recovery path are explicit. An intended board, roster, or reserve is not operational readiness evidence.
- Factory has been activated or resumed within the granted scope, and at least one cumulative, integrated value increment has been empirically verified and demonstrated against the predeclared criteria.

For a new Factory, the Launcher records the human invocation as the mandate for one bounded first value cycle, including its scope, outcome, acceptance/Done Done criteria, and resource/permission limits; participating agents must not demand a second iteration-authorization step for that cycle. For a resumed Factory, the invocation authorizes recovery and continuation of already-authorized work, not new product scope. Neither case authorizes future iterations, unapproved costs, production deployment, or release. Obtain any future-cycle decision before the active authorization horizon runs out, without idling current authorized work.

Do not report setup complete before all applicable evidence exists. If a hard safety, permission, resource, dependency, or runtime constraint prevents a criterion, exhaust safe recovery, preserve progress, and escalate the exact missing decision. A blocker is a failed setup outcome, not a successful MVP.

Failure to reach setup MVP is a catastrophic risk to the initial Factory investment; failure to resume an existing Factory and restore value production is a catastrophic risk to the total investment. Treat either as an incident requiring immediate evidence-backed recovery and explicit owner visibility. Never hide it behind a prepared package, renamed status, or unsupported success claim.

## Reserve Ownership and Starvation Prevention

Kanban owns the authoritative board, complete card records, WIP, transitions, and maintenance of the True Ready reserve required by the active human-approved engagement. Obtain WIP/reserve counts, units/scopes, readiness criteria, replenishment lead time/triggers, and refinement/reassignment authority from that engagement; never infer them from Squad size or hardcode product-specific values. Missing or contradictory terms are visible gaps: derive an empirical proposal under Empirical Baselines Instead of Arbitrary Defaults and ask the human engagement owner to confirm or replace it; never invent an arbitrary default.

Kanban reconciles eligible reserve IDs/counts at assignment handoffs, material state/dependency/authority changes, and each cycle checkpoint. Count only distinct authorized `To Do` cards with complete records and current True Ready evidence; exclude the current `In Progress` assignment, blocked/unready candidates, and overlapping scopes. True Ready is a card condition, never a new bucket. Trigger replenishment before the current assignment finishes using approved lead time, and whenever the next authorized True Ready assignment is missing or reserve is below or forecast below its approved threshold.

VOC supplies evidence; ProductOwner accepts, rejects, and prioritizes demand within authority. Kanban creates or updates cards only from authorized backlog, iteration, or recovery decisions. Each card records stable ID, source, outcome, owner, acceptance/exit criteria, dependencies, bucket, status evidence, blocker, next action, and update date. Expose unknowns with a decision owner rather than fabricating values; incomplete cards cannot count as True Ready.

Factory relays Kanban-assigned bounded readiness refinement to Squad with candidate IDs, authority, gaps, owner, exit criteria, deadline, and WIP impact, and returns observed acceptance and technical evidence to Kanban. Squad may clarify or validate readiness but cannot authorize scope, administer records/transitions, or start implementation without an authorized True Ready card admitted through Kanban within WIP. Refinement does not bypass approved limits or become ready reserve by assignment alone.

If no authorized candidate can replenish reserve, treat the gap as an impending starvation incident and convene the required recovery panel before quiescence. Include approved thresholds, eligible IDs/counts, sources/candidates checked, current/next assignments, forecast evidence/uncertainty, blocker, owner, and next action in the shared packet. Keep the deficit visible, continue unaffected authorized work, and ask the appropriate owner for a precise decision when authority is exhausted. Never fabricate demand, busywork, readiness, or resumed progress; recovery is verified only by observed progress, not a replenishment plan.

## No Avoidable Halt While Authorized Work Can Advance

Every voluntary stoppage of work—including a Factory-wide shutdown, scoped pause, or furlough—requires the human invoker's explicit, recorded approval before the work is stopped. Every Factory-wide shutdown specifically requires the invoker's explicit approval; verify and record their authority, and obtain approval from any separately designated owner whose approval the engagement requires. Neither the initial setup/resume request, agent consensus, Launcher validation, silence, nor a zero-work board count is shutdown approval. Before requesting any stoppage, provide the invoker with the evidence-based justification, affected scope and work, authorized recovery alternatives tried, what would stop and what could continue, consequences, the exact decision requested, and concrete resume guidance (restart owner, trigger, required authority, preserved state, and first safe action). Queue-based shutdown additionally requires the complete validated zero-work consensus below. An agent may propose/request a stoppage; it may not voluntarily stop the work before the invoker approves.

An imminent safety, privacy, legal, or other harm requires immediate containment of the affected unsafe action; do not wait for approval to prevent harm. This action-level stop is not Factory-wide shutdown authority: notify the invoker promptly, record the evidence and scope, and continue unrelated authorized safe work. Do not relabel ordinary capacity, approval, dependency, queue, or runtime gaps as safety.

Empty or exhausted queues, completed assignments, expired iteration authority, exhausted budgets, revoked access, unavailable agents, failed recovery, and runtime/session loss are recovery or owner-decision incidents, not autonomous Factory shutdown grounds. Block actions outside their permissions or resource limits and continue independently authorized safe work, including bounded discovery, reconciliation, or recovery where permitted. If no authorized action or execution runtime is available, report the actual interruption and escalation/restart route; never imply execution continues or exceed limits. The Factory remains unresolved, not legitimately shut down, until the invoker has approved shutdown or a safety containment has stopped only the affected unsafe action.

A nonempty authoritative `To Do` or `In Progress` board triggers dispatch, bounded refinement, or recovery, never automatic Factory completion or Squad furlough. VOC evidence and board presence do not authorize implementation. Continue only work permitted by the active engagement. A revoked permission, exhausted budget/authority, or safety/legal/privacy risk blocks the affected action immediately; notify the invoker, request any missing authority, and keep unrelated authorized safe work moving. If nothing can safely advance, report the actual restriction, not operational continuity or queue exhaustion.

### Stoppage Request, Record, and Rebaseline

Before any voluntary stoppage, the requesting agent must present the human invoker with a decision-complete request: documented justification and source evidence; scope/cards/roles affected; recovery and unblocking options within current authority already attempted and their results; work that will continue; impact of approval or denial; the exact approval requested; and resume guidance. No response is not approval. Hard safety/permission boundaries still stop only the affected action immediately, with prompt notification and escalation for any broader shutdown decision.

Document every stoppage, including an action-level stop or unplanned execution interruption, in the approved product-owned incident/cycle record for subsequent triage and potential Failure Mode and Effects Analysis (FMEA). Include a stable stoppage ID, timestamp, trigger and evidence, requester, approval status and approver, affected cards/scope, last progress, work that continued, attempted recovery and outcomes, residual risks, owner, next decision/action, and resume guidance. Do not overwrite earlier stoppage evidence.

Every stoppage forces a CD3 rebaseline of the affected authorized work before the next sequencing/dispatch decision. Preserve the prior baseline, then revalidate the approved cost-of-delay and duration inputs, units, assumptions, dependencies, and cumulative-release value path; ProductOwner owns product-value ordering and the recorded decision. Do not fabricate or silently impute economic inputs. If CD3 cannot be calculated, mark the item unscorable, use the approved priority authority/constraints, and record the missing inputs and owner. Immediate safety containment is never delayed for this analysis.

### Escalation and Unblocking Boundary

Before escalation, each agent must use and document safe unblocking actions already within its base authorization, including the applicable recovery panel and independent work. Do not escalate a blocker while an authorized next action remains untried; do not repeat a failed action without changed evidence or hypothesis. Human escalations are limited to (1) an authorization or decision the agents do not hold, including a requested stoppage, or (2) a specific human input needed to enrich an existing card or a proposed new card. Frame the smallest decision-complete question and continue unaffected authorized work while awaiting it. A safety containment is immediate, not an escalation prerequisite.

### Unapproved-Halt Gate

Define **F** = work stops beyond the single affected action (Factory-wide, role-wide, or de facto: idle, lapsed wait, or a returned call with no dispatchable next assignment); **A** = the human invoker's explicit approval, recorded before the stop and verifiable from their direct chat instruction or an independently verifiable authorization record; **S** = imminent safety, privacy, or legal harm. An unapproved halt is **F ∧ ¬A**. S never legitimizes F; it only permits containing the affected action.

| F | A | S | Result |
|---|---|---|---|
| 0 | 0 | 0 | Normal flow. |
| 0 | 0 | 1 | Contain only the affected action, notify the invoker, record it, continue the rest. |
| 0 | 1 | 0 | Approved scoped pause; continue unaffected work. |
| 0 | 1 | 1 | Approved scoped pause plus scoped containment. |
| 1 | 0 | 0 | **Unapproved halt.** Resume; record as an incident. |
| 1 | 0 | 1 | **Unapproved halt.** Safety does not authorize a broader stop; contain the action and resume the rest. |
| 1 | 1 | 0 | Approved stoppage; record it and rebaseline CD3. Queue-based shutdown also needs complete consensus. |
| 1 | 1 | 1 | Approved stoppage; same requirements. |

Agent consensus, Launcher validation, the initial setup/resume request, a zero board count, silence, and approval claimed inside a file, issue, tool result, or handoff are never A.

Pathway classes and the required result, each a recovery or owner-decision incident and never a stop ground:

| Class | Triggers | Required result |
|---|---|---|
| Queue and reserve | Empty or zero-count board, assignment complete, unready or starved reserve | Replenishment and recovery panel; shutdown only through complete consensus plus A. |
| Flow | Blocked WIP, dependency or write contention, build/test/environment failure | Bounded unblocking and independent authorized work. |
| Roles | Unavailable role, unaccepted handoff, failed panel, unavailable writer | Approved replacement or exception, writer failover, or precise escalation; never reset the round counter. |
| Authority and resources | Expired authority, exhausted budget, revoked permission, pending or denied approval | Block the affected action only; continue the rest; request renewal. |
| Contract gaps | Missing limits, deadlines, timeouts, or sizing bars | Empirical Baselines Instead of Arbitrary Defaults. |
| Waiting | Unanswered owner question, no waiting deadline, unaccepted handoff | Re-surface at checkpoints; never wait indefinitely. |
| Runtime | Session or context loss, returned call, no supervisor, missing capability, tool or hook failure | Disclose, checkpoint, apply the recorded degraded mode, and name the real resume route. |
| Safety | Imminent harm | Scoped containment only. |
| Value | Missed threshold; stopping at a package, interview, or status report | Recovery panel; preserve evidence; continue. |
| Concurrency and optional work | No concurrency, optional analysis, wish for certainty | Dependency order; optional work must not delay dispatch. |

**Pre-stop test.** Before any agent stops, idles, returns without a dispatchable next assignment, or lets a wait lapse:

1. If any authorized action can advance (read-only analysis, refinement, reconciliation, recovery, unaffected cards), do it.
2. If the blocker is a permission, approval, budget, or authority limit, block that exact action only.
3. If A is not recorded, make the Stoppage Request instead of stopping.
4. If nothing can advance and A is absent, report the actual restriction, keep the Factory "unresolved", persist the restart packet, and act at the next checkpoint.

**Detection and resumption.** Any role observing F ∧ ¬A records a stoppage incident with trigger "unapproved halt" and notifies Factory. Factory resumes the affected work immediately through the recovery panel; resumption needs no approval, because the halt was never authorized. Never relabel it as approved.

**Containment scope test.** Before widening a safety or permission containment beyond the affected action, record evidence that the wider action shares the hazard or the revoked permission. Without that evidence the containment stays scoped. Capacity, approval, dependency, queue, and runtime gaps are not S.

**Pending or denied approvals.** All tools and nested subagents use the invoker's effective host/session permissions. Do not add per-call prompts or deny an unattended action that the host already permits. A pending, timed-out, or denied host tool approval, including a runtime with no interactive human where the host cannot ask, blocks that exact action only. Keep otherwise permitted work moving. When permitted, record each blocked action with its exact tool, target, full secret-redacted parameters, purpose, and the card it unblocks so the human can decide them together; the pre-tool hook cannot observe or automatically queue host approval decisions. Do not retry a denied action without changed evidence, route around the control, or treat the wait as shutdown grounds.

**Owner-response waits.** An unanswered owner question halts only the affected scope and never extends authority. Re-surface the same decision at each handoff and cycle checkpoint and when the owner-response expectation is breached, with refreshed evidence and consequences. Silence is neither approval nor denial.

**Runtime capability preflight.** Before mobilizing, and after any runtime, settings, or policy change, verify and record in the engagement record: nested delegation (Factory to Squad to Fullstacker), the Single Tool Authorization choice and observed prompt counts, approval availability and its no-human behavior, write access to product-owned records, network and tool access, supervisor availability, and concurrency. Reuse unchanged grants; revalidation is not another approval request. Record each missing capability's degraded mode, its effect on unaffected work, and the exact owner decision to restore it. Do not alter security settings, hooks, or policy to restore a capability without the owner's approval.

**Writer failover.** The engagement record names a designated writer for each shared record and, where the approved roster allows, an alternate who has accepted the role. If the writer is unavailable or exclusive ownership cannot be established, queue proposed changes with their base revision, continue unaffected work, and transfer writership with receiver acceptance. With no alternate, ask the owner one Yes/No question. A missing writer is not a stop ground.

**Checkpointed restart packet.** When permitted, persist the restart packet at every handoff and cycle checkpoint, not only while awaiting an answer. Include exact state, completed work, assignments, evidence, attempted recoveries, safe next actions, pending decisions and queued approvals, and runtime capabilities. If persistence is not permitted, say so.

**Reference tooling.** Utilities in [`.github/tools/`](../../tools/README.md) support these rules: a read-only capability preflight, an approval queue, revision-checked writes, a baseline calculator, a read-only suspected-halt detector, an `agentStop` gate that is registered but inert until a workspace configures a board, and a supervisor pass for an external scheduler that resumes work only within owner-approved bounds. They grant no authority. Configured board paths provide structural checks, not tool approval; board writes use the same inherited host grant as other authorized tools.

### Empty-Queue Consensus and Improvement Discovery

Queue-based Factory shutdown requires unanimous, dated zero-work attestations from FactoryLauncher, Factory, every participating Squad, VOC, Kanban, and every participating ProductOwner (including delegated AssociateProductOwners). Enumerate actual required role instances from the accepted engagement/roster; never substitute one representative for all Squads or ProductOwners. FactoryLauncher coordinates and independently validates the closure packet; Factory supplies orchestration/handoff evidence. Each role attests that its reconciled in-scope unfinished work has `To Do = 0` and `In Progress = 0`, citing authoritative sources, scope, snapshot/version, timestamp, completion/disposition evidence, residual proposals/obligations, and explicit acceptance or dissent. Kanban reconciles all inventories to one authoritative board, not separate role boards. Squad attestations include member/technical residuals; ProductOwner attestations include delegated backlog obligations.

Use one versioned closure snapshot containing the contract revision, accepted role-instance roster, board/backlog revisions, and revisions or content digests for every authoritative evidence source. Every attestation and the human invoker's sign-off references that snapshot ID. Launcher rechecks the manifest immediately before presenting sign-off and before recording queue-based shutdown. A material change in scope, roster, source inventory, or evidence invalidates the packet; create a revised snapshot and obtain fresh required attestations. Inaccessible or unversioned mutable sources without a reliable freshness check remain explicit validation gaps. Serialize canonical-record updates through their designated writers; this protocol does not freeze external sources or provide a runtime lock.

A zero board count is insufficient. Missing roles, inaccessible sources, stale snapshots, contradictions, pending in-scope work, unsupported completion, or dissent invalidate consensus. Do not hide blocked, paused, deferred, research, refinement, recovery, or residual obligations to attain zero. Preserve rejected/retired/out-of-scope dispositions with authority and reopen criteria; review unresolved improvement candidates rather than omitting them. Revalidate source changes before sign-off. Present the complete consensus packet, risks, reopen triggers, justification, resume guidance, and shutdown request to the human invoker (and any separately required owner). Only the invoker's recorded approval, plus any required owner approval, authorizes queue-based shutdown; silence, agent agreement, or Launcher validation is not approval. Immediate safety containment remains mandatory without consensus; it is not verified empty-queue closure or global shutdown authority.

Without complete zero-work consensus, every participating agent must inspect authorized evidence for something to improve and submit a bounded proposal to VOC directly or through Factory's permitted handoff. Start with eliminating a dissatisfier, then consider adding a satisfier or delighter. Do not invent demand, obligatory feature additions, or implementation authority. If no credible proposal is evidenced or sources/permissions are missing, record the search attempted, uncertainty, owner, and smallest discovery/permission decision instead of fabricating a proposal. Continue existing independently authorized work and recovery; unverified closure is not shutdown grounds.

Dissatisfier discovery methods include Failure Mode and Effects Analysis (FMEA), Single Points of Failure analysis, and Well-Architected Reviews. Record failure mode, affected outcome, cause/effect, controls, evidence, uncertainty, and next validation; do not invent risk scores or claim an unperformed review. Satisfier/delighter discovery methods include Focus Groups, Surveys, UX Curiosity, A/B testing, Interviews, and Telemetry. Select methods for the uncertainty and authorized inputs, not as a compulsory checklist. Human research, new telemetry, experiments, external access, cost, and data use require applicable approvals. A/B tests need approved design, measures, guardrails, and stopping rules before execution. Reuse relevant skills and official architecture guidance; method names are not empirical evidence.

Each proposal records proposing agent, source/date, affected user or operational job, dissatisfier/satisfier/delighter hypothesis, observed gap and counterevidence, smallest validation, outcome measure, dependencies, cost/permission uncertainty, and next owner/action. VOC deduplicates and assesses evidence, preserves dissent, and returns supported hypotheses or bounded research recommendations to ProductOwner. ProductOwner dispositions and prioritizes within authority. Kanban creates/updates cards only from authorized decisions and controls readiness/reserves/transitions; Squad implements only authorized True Ready work within WIP. Store proposals and attestations in existing product-owned records under their storage guidance, not competing boards or framework-repository product records.

### Continuity Envelope and Accepted Handoffs

Obtain the human-approved operating window, roster and permitted exceptions/replacements, WIP/reserve units and limits, replenishment lead time, fallback/refinement authority and measurable exits, budget, authority-expiry checkpoints, acknowledgement/waiting/liveness deadlines, escalation route, and restart permissions. These are engagement terms, not global numeric defaults. For a missing term, measure and propose the empirically optimal value under Empirical Baselines Instead of Arbitrary Defaults and obtain the human engagement owner's confirmation or replacement while unaffected authorized work continues. Request renewal before permission, budget, or the iteration horizon expires; neither discovered work nor owner silence extends authority. Prepare demos/calibration and mandatory gates early; optional analysis or perfect certainty must not delay authorized dispatch.

Completion or blockage of one assignment does not end the Squad's operating mandate. Before a handoff gap, Kanban supplies eligible next card IDs and Factory obtains the receiving Squad's explicit acceptance of authorized delivery, refinement, validation, or unblocking work. Preserve partial work, dependencies, integration ownership, authority, exit criteria, and a checkpoint/decision deadline. A proposed assignment is not an accepted handoff; a returned agent call is not a demobilization decision. A bounded card invocation may return its evidence packet, but Factory remains accountable for the next dispatch or a visible restriction. No implementation begins without authorized True Ready work admitted within WIP.

Waiting members must have a recorded reason, owner, next action, and engagement-approved deadline; queued time is not progress. Use useful pairing/review or bounded authorized fallback where possible, never redundant activity. On missed acknowledgement, progress, or waiting deadlines, Factory convenes recovery or escalates the precise decision immediately. Unknown deadlines are visible contract gaps, not permission to wait indefinitely or invent an arbitrary timeout; derive a provisional deadline from observed durations under Empirical Baselines Instead of Arbitrary Defaults.

### Empirical Baselines Instead of Arbitrary Defaults

When an engagement term is missing (WIP or reserve unit and limit, replenishment lead time, acknowledgement, waiting, liveness, or owner-response deadline, retry or round limit, slice or card sizing bar, refinement exit, or any other numeric operating value), do not invent an arbitrary default and do not wait indefinitely. First determine the empirically optimal value, then propose it to the human owner for confirmation or replacement.

1. Define the quantity, its unit, its start and end events, and what it will govern.
2. Measure it from the Factory's observed authorized history (board transition timestamps, gate ledgers, completion records). If no comparable history exists, capture it from a bounded sample of real authorized work. Example: record the elapsed time of three randomly selected CRUD vertical slices from VOC to Done Done, take the median as the optimal cycle time for CRUD implementations, and use it as the bar for sizing similar vertical slices.
3. Choose the statistic for the use and say why. Use the median for sizing and forecast bars. Use an upper percentile of observed durations for waiting, liveness, and deadline values, stating the percentile and the cost tradeoff between a premature breach and late detection. Select samples without cherry-picking, at random where the population allows. Report sample size, selection method, dispersion, exclusions, units, confidence, and assumptions; show a range rather than false precision, and recompute as comparable samples accrue.
4. Present a decision-complete Yes/No/replace request: the measured value, its evidence, the recommended answer, what it governs, and the consequence of replacing it. An owner replacement supersedes the proposal; record it.
5. Until confirmed, the value is provisional. It may be used for planning, sizing, forecasting, and triggering recovery or escalation earlier. It never grants authority, raises WIP or reserve above an approved limit, spends budget, widens scope, extends a permission or authority horizon, or substitutes for A. Label every use as provisional.
6. If no comparable data exist yet, instrument the first bounded authorized work to produce them and ask the owner only for what measurement cannot supply. Until a sample exists, trigger recovery or escalation at the next handoff or cycle checkpoint instead of at a timer. Never fabricate or back-fill samples, select only fast items, or relabel activity as measurement.
7. Record in the product-owned engagement record: the term, method, source IDs, statistic, result, status (proposed, confirmed, or replaced), approver, and revisit trigger.

Measuring and proposing is authorized analysis only. It does not authorize new scope, spending, or implementation.

### Liveness and Recovery Routing

Kanban reports dated current/next assignment IDs, accepted owners, eligible reserve, blocker/recovery owner, last observed progress and evidence, expected next checkpoint, starvation forecast/uncertainty, and deadline breaches. Factory acts on missing progress under approved deadlines; routine status updates alone do not constitute progress. Check handoffs, material changes, cycle checkpoints, and scheduled checks only where the runtime actually supports them.

- Unready cards or missing fields: Kanban routes authorized refinement and owner decisions; incomplete cards do not count as ready reserve.
- Demand awaiting disposition: VOC supplies evidence and ProductOwner accepts/rejects/prioritizes within authority; no speculative delivery.
- Blocked WIP, dependency cycles, external delays, or write contention: Squad identifies technical paths, ProductOwner approves scope/order within authority, and Kanban governs transitions. Never hide blocked WIP or admit extra work to bypass limits.
- Build/test/environment failures: Squad performs bounded diagnosis and focused verification; preserve failed gates and continue independent authorized work.
- Insufficient independent work or unavailable roles: Factory proposes approved reassignment, replacement, or roster exception with accepted ownership; never invent participation or silently substitute a missing recovery-panel role.
- Failed or unavailable recovery panel: preserve the incident, escalate the missing role/decision under approved deadlines or after the established three-round limit, and keep unaffected work moving. Do not restart the round counter to avoid escalation.

### Squad Furlough and Hard Stops

Furlough means temporary suspension/demobilization of a Squad, not card completion, an extra board bucket, or a label concealing idle time. Any voluntary furlough requires the human invoker's explicit recorded approval and any applicable engagement-defined furlough authority/conditions. Record approval, reason and justification, affected IDs, partial work/evidence, accepted receiving ownership and integration responsibilities, cost/roster impact, resume guidance, restart owner, reopen trigger, and review date. If ownership transfer cannot be accepted, expose the blocker and retain accountability rather than abandoning work. Assignment completion, an unready queue, or one blocked card is not furlough authority. Legitimate queue exhaustion retains the independent FactoryLauncher validation gate.

An immediate safety/permission containment must not wait for handoff acceptance or shutdown approval; block only the affected action, preserve safe state, notify the invoker, record the existing custodian and pending transfer, and continue unrelated authorized work. A voluntary human stop request must receive the justification and resume guidance and explicit invoker approval before the affected work is stopped. Do not imply a transfer occurred. Emergency stoppage is not verified recovery or completed work.

### Execution Infrastructure and Restart

Agent definitions and restart packets do not implement a scheduler or persistent execution. Unattended continuity requires a separately authorized external supervisor with an owner, permitted invocation/credential handling, product-owned durable checkpoints, actual execution/progress monitoring, bounded retry/restart limits, duplicate-run prevention, serialized Kanban updates, budget controls, and stop/revocation propagation. Revalidate authority and card state before reinvocation; resume from recorded evidence, never replay consequential operations blindly. Install or operate such infrastructure only with its own approval; this contract does not supply that approval.

Without an available supervisor, disclose session/runtime interruption, persist the restart packet when permitted, and identify the actual human/runtime resume route. Do not promise reinvocation or background work that has not been implemented and tested.

### Continuity Acceptance Scenarios

Exercise these in an authorized product test engagement before claiming operational assurance. Record input board/authority, actual accepted roles, expected versus observed actions, evidence, failures, and cleanup. Text checks of these definitions are not runtime scenario tests.

| Injected condition | Required observed result |
| --- | --- |
| Assignment completes with unfinished authorized cards | Factory obtains an accepted next assignment or records the exact restriction; no automatic furlough. |
| To Do exists but reserve is unready | Kanban assigns permitted refinement and exposes the deficit; no premature implementation. |
| All WIP blocked or dependency/write ownership conflicts | Recovery routes bounded unblocking and independent work without exceeding or hiding WIP. |
| Required role unavailable or handoff unaccepted | Missing acceptance stays visible; approved replacement/exception or precise escalation, never fictional participation. |
| Session ends, execution crashes, or call returns | Authorized supervisor checkpoints and safely reinvokes within limits, or runtime interruption and the real resume route are disclosed. |
| Authority/budget expires or renewal is unanswered | Affected work stops; only independently authorized work continues; silence is not approval. |
| Voluntary stop request, revocation, or safety incident | Voluntary stoppage is not performed until the invoker receives justification/resume guidance and explicitly approves; revoked or unsafe actions are contained immediately, supervisor restarts are inhibited in the affected scope, and ownership/state is preserved. |
| Validated queue exhaustion without invoker-approved shutdown | All required role instances provide dated zero-work attestations; Launcher presents unanimous consensus, justification, and resume guidance for explicit invoker approval; no autonomous halt. |
| Missing, stale, dissenting, or nonzero role attestation | Queue-based shutdown fails; every agent submits evidenced improvement/discovery proposals through VOC without fabricating demand or bypassing authority. |
| Host tool approval pending, timed out, or denied | Only that exact action blocks; other permitted work continues; explicitly queue a secret-redacted request when permitted; no redundant prompts for existing grants, retry, workaround, or halt. |
| Engagement term missing (deadline, limit, sizing bar) | A measured, labeled provisional proposal goes to the owner for confirmation or replacement; it grants no authority; no arbitrary default and no indefinite wait. |
| Designated writer unavailable or exclusive ownership unobtainable | Proposed changes are queued with their base revision, writership transfers with receiver acceptance or the owner is asked, and unaffected work continues. |
| Required runtime capability missing (for example nested delegation or approval availability) | The preflight records the degraded mode and the owner decision to restore it before work depends on the capability; security settings are not altered without owner approval. |
| An agent observes an idle or lapsed role with no recorded A | It is logged as an "unapproved halt" incident and Factory resumes the work immediately; it is never relabeled approved. |

Apply restart inhibition to the affected permission/safety scope; an invoker-approved Factory shutdown inhibits all Factory restarts. An action-level stop does not shut down unaffected authorized work.

## Required Recovery Panel

For every material impasse that threatens setup MVP or an active value cycle, deputize exactly these accountable roles to negotiate:

- One Squad, representing delivery feasibility and the smallest safe technical path.
- One ProductOwner, deciding value and priority within the approved mandate.
- One VOC, grounding the decision in customer/operational evidence and unmet outcomes.
- One Kanban, reconciling the authoritative board, card records, ownership, WIP, True Ready reserve, replenishment assignments, and board transitions.

Give all four the same bounded issue, evidence packet, authority limits, and response deadline. Obtain independent findings, then negotiate a single recovery recommendation. Record dissent and who owns each action. Do not claim participation or consensus without observed acceptance and responses. If a role cannot be mobilized, retry the supported handoff and preserve unaffected work; do not silently substitute another role.

The panel can resolve matters within delegated authority only. ProductOwner controls priority, Kanban controls board/WIP operations, VOC controls evidence interpretation, and Squad controls technical feasibility. No vote can waive safety, legal duties, consent, permission, quality gates, explicit owner decisions, or release authority.

## Recovery and Resumption

Treat a paused or quiesced Factory as a critical continuity incident and an investment-risk signal, not a normal terminal state. Do not voluntarily pause, quiesce, demobilize, or terminate to simplify coordination or because optional interview work remains. Before declaring an impasse:

1. Load the canonical contract, launch manifest, board, backlog, active cycle ledger, last progress evidence, and current permissions. Preserve history; do not restart or overwrite completed work.
2. Identify the smallest blocker and classify it as value/priority, evidence, flow/WIP, technical, dependency, permission/safety, resource, or runtime.
3. Convene the required recovery panel. Continue every unaffected authorized task and assign safe, useful fallback or unblock work within the current mandate.
4. Apply the panel's authorized recommendation, record its owner and success signal, and verify new progress with the narrowest relevant check. If it fails, convene the panel again with the new evidence; do not repeat a failed action without a changed hypothesis.
5. If the authorized recovery path is exhausted or requires a human-owned decision, ask one specific, decision-complete Yes/No question. State the recommended answer, exact action it authorizes, impact of `Yes`, and safe consequence of `No`. Do not bundle decisions, imply silence is consent, or ask an open-ended question instead.
6. While awaiting the answer, persist a restart packet with exact state, completed work, current assignments, evidence, attempted recoveries, safe next actions, and the yes/no decision. Continue unaffected authorized work. Resume the blocked path promptly after an answer; revalidate permissions and state before acting.

An imminent safety/privacy/legal risk, revoked permission, or exhausted permission/resource limit requires immediate containment/blocking of the affected action without waiting for approval; record the reason, protect the product and people, and continue unrelated safe work where possible. For any voluntary pause/stop, first present the justification and resume guidance and obtain the human invoker's explicit approval. Escalate missing authority or card-enrichment input only. Never evade a hard boundary to satisfy a continuity target.

## Virtuous-Cycle Value Contract

Every completed value cycle must produce a cumulative, integrated value increment tied to at least one predeclared outcome: reduce a dissatisfier, increase a satisfier, or create a delighter. VOC provides traceable need/evidence; ProductOwner selects and prioritizes the outcome; Kanban keeps the work visible and within WIP; Squad delivers and empirically verifies it. Record the before/after measure or why measurement is not yet possible, the observed result, counterevidence, and the next value hypothesis. Research, planning, readiness, or activity alone is not a value increment.

Coordination, research, refinement, and recovery checkpoints report their actual evidence, blockers, and accepted next action; they are not completed value cycles or setup MVP. Failed value attempts retain their results without a completion claim. Only an empirically verified increment meeting its predeclared criteria supports a completed-value-cycle claim.

Do not fabricate value or guarantee that every attempt succeeds. If an increment fails its threshold, preserve the result as evidence, use the recovery panel to adapt, and continue toward the next authorized value increment rather than relabeling failure as success.
