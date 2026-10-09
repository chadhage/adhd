# ADHD

*Agent Driven Hybrid Development*

## Table of Contents

- [Getting Started with FactoryLauncher](#getting-started-with-factorylauncher)
	- [Start a New Factory](#start-a-new-factory)
	- [Resume an Existing Factory](#resume-an-existing-factory)
- [Agent feature truth table](#agent-feature-truth-table)
- [Important distinctions](#important-distinctions)
- [Features and intended benefits](#features-and-intended-benefits)
- [Invocation and access truth table](#invocation-and-access-truth-table)

## Getting Started with FactoryLauncher

### Start a New Factory

1. Open Copilot Chat in VS Code and select `FactoryLauncher` from the agent picker.
2. Submit a Factory name and product idea. Include beneficiaries, desired outcome, constraints, known evidence, resource limits, and the independently owned product workspace when available.
3. The request authorizes the bounded setup and first value cycle. FactoryLauncher will gather only decisions needed to proceed, mobilize the required roles, and continue through a verified, demonstrated value increment. It will not stop at an interview or launch package.

Example:

```text
Set up a new Factory named InvoiceFlow for independent consultants to reduce
manual unpaid-invoice follow-up. Treat this request as authorization for the
bounded setup and first value cycle. Work through Factory setup MVP, using the
required Squad + ProductOwner + VOC + Kanban recovery panel if anything blocks
progress. Ask me a specific Yes/No question only when a decision outside this
mandate or a hard safety/permission boundary prevents progress. Do not stop at
the interview or launch package; report the first verified value increment.
```

Provide the product-owned workspace path and storage rules when you know them.
The launcher retrieves and records the workspace's artifact-storage guidance
before saving files. For example:

```text
Set up a new Factory named InvoiceFlow to reduce manual unpaid-invoice follow-up
for independent consultants. Authorize setup and one bounded first value cycle
within the existing approved resource envelope. Product workspace:
<product-workspace-path>. Use its established artifact locations after reading
its storage guidance. Do not spend funds, contact customers, access private
systems, deploy to production, or release without the required separate approval.
```

### Resume an Existing Factory

1. Select `FactoryLauncher` in Copilot Chat.
2. Name the Factory and point to its canonical launch manifest or restart packet. Include the product workspace if it is not already clear.
3. The resume request authorizes restoring value production on already-authorized work. FactoryLauncher reloads the contract, manifest, backlog, Kanban board, cycle ledger, current permissions, and last progress evidence; it preserves completed work and does not broaden scope.
4. If work is stalled, FactoryLauncher mobilizes one Squad, one ProductOwner, one VOC, and one Kanban to negotiate recovery. If they cannot unblock it within three evidence-based rounds, it asks one specific Yes/No question and keeps unaffected authorized work moving.

Example:

```text
Resume the existing InvoiceFlow Factory from
<product-workspace-path>/.docs/factories/invoice-flow/launch-manifest.md.
Restore value production on the existing authorized backlog and active cycle.
Use the required recovery panel for any impasse; do not stop at a status report.
If a human decision is required, ask one specific Yes/No question with your
recommendation and the consequences of Yes and No.
```

For either request, paths are in the independently owned product workspace, not
the ADHD agent-framework repository. A new Factory reaches setup MVP only when
its first bounded cycle has produced and demonstrated an empirically verified
increment that reduces a dissatisfier, increases a satisfier, or creates a
delighter. An existing Factory is reported as resumed only after actual
acceptance, mobilization, and value-producing progress are observed.

The setup/resume request does not authorize unrelated scope, future iterations,
spending beyond the approved envelope, customer contact, private-system access,
production deployment, or release. Hard safety and permission limits and an
explicit human stop decision remain binding. A discovery-only request remains
limited to its explicit research scope.

The approved package includes a charter and artifact index, decision/authority
ledger, evidence and validation plan, ProductOwner backlog/economics, Kanban
board, readiness/quality contract, roster/handoffs, cycle/outcome and completion
ledger structures, demo/feedback records, cadence checkpoints, and an
escalation/activation brief. All documented Factory deliverables belong in the
independently owned product workspace, following its retrieved artifact-storage
guidance; `.docs/factories/<safe-name>/` is only a default when that guidance
supports it. Invocable products follow their selected product reference's
best-practice layout, or use `src/` when the reference does not define one.
Agentic products' runtime agents are recorded separately from the ADHD agents
used to develop them. A package without an empirically verified value increment
is not setup MVP. The launcher does not fabricate cycle results or create
application code itself; it delegates delivery to Factory/Squad.

Before an authorized work horizon is exhausted, ask the invoker whether to
continue with the established cadence or choose a new positive-integer cadence.
Do not pause active authorized work while awaiting that decision. Complete the
iteration-36 calibration before its gate; iteration 37 cannot be authorized
until VOC, Kanban, and empirical product artifacts have been calibrated.

For an explicit setup or resume request, FactoryLauncher invokes [Factory](factory.agent.md)
with the generated `Factory <name> Start [directive]` command referencing the
approved manifest, version, mode, scope, and first action, for example:

```text
Factory InvoiceFlow Start manifest=.docs/factories/invoice-flow/launch-manifest.md
```

Use the exact activation prompt generated by FactoryLauncher when it differs
from this illustrative form. Verify runtime availability and actual
mobilization; producing a package alone does not mean a Factory has started.
Future iterations, spending beyond the mandate, deployment, and release retain
their separate approval requirements.

## Agent feature truth table

Based on the eight definitions in this directory.

**Legend:** **T** = explicitly assigned capability; **D** = coordinates or delegates it; **B** = bounded by a delegated charter; **—** = not assigned. These are declared responsibilities, not verified runtime capabilities.

| Agent | Customer research | ROI / economics | Product priority | Board administration | Code delivery | Team orchestration | Completion verification |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **VOC** | T | — | — | — | — | — | — |
| **ProductOwner** | D | T | T | — | — | T | — |
| **AssociateProductOwner** | B | B | B | — | — | — | — |
| **Kanban** | — | — | — | T | — | — | T |
| **Fullstacker** | — | — | — | D | T | T | T |
| **Squad** | — | — | D | D | D | T | T |
| **Factory** | D | D | D | D | D | T | T |
| **FactoryLauncher** | D | D | D | D | — | T | — |

## Important distinctions

- VOC ranks **research opportunities**, not the authoritative product backlog.
- AssociateProductOwner analyzes supplied VOC evidence within its charter; missing research or authority must be escalated.
- Fullstacker's economic sequencing uses agreed WSJF/CD3 inputs; it does **not** own product priority.
- Kanban checks supplied completion evidence and records completion; it does **not** perform engineering verification itself.
- Squad and Factory require and reconcile delivery evidence; accountable member agents perform the work.
- FactoryLauncher owns bounded setup/resumption through the first verified value increment; Factory/Squad deliver the increment and accountable roles provide evidence.

## Features and intended benefits

Benefits below are inferred from the documented features, not measured outcomes.

| Agent | Principal features | Intended benefits | Key boundary |
|:---|:---|:---|:---|
| `VOC` | Focus groups, interviews, surveys, telemetry analysis, comparative analysis; evidence ledger; counterevidence; proposition hypotheses and validation plans | Helps identify genuine unmet needs and reduces investment in unsupported customer assumptions | Does not invent research, approve investments, or implement products |
| `ProductOwner` | Backlog ownership; financial, Kano, business-model, value-proposition, SWOT and scenario analysis; priority tie-breaking; Chief Product Owner coordination | Connects customer demand to economic decisions; resolves priority deadlocks; reconciles shared costs and dependencies across subproducts | Cannot invent investment thresholds, widen authorized scope, or override quality gates |
| `AssociateProductOwner` | Bounded subproduct analysis; VOC assessment; incremental economics; dispositions and ordering recommendations; explicit escalation and return contract | Scales product analysis while preserving centralized strategy, consistent assumptions, and portfolio accountability | Delegate-only; no recursive delegation, independent portfolio authority, or delivery |
| `Kanban` | Complete unfinished-work inventory; exactly two default buckets; evidence-backed transitions; WIP enforcement; duplicate/omission reconciliation; per-card and total-lot reporting | Makes unfinished work, blockers, ownership, and overload visible; prevents unsupported completion and misleading totals | Does not set product priority or execute card work |
| `Fullstacker` | End-to-end vertical delivery; one-piece flow; atomic decomposition; solo/pair/cohort work; BDD/TDD; secure architecture; delivery automation; criterion-by-criterion done evidence | Produces integrated increments rather than disconnected layers; reduces regression risk and makes completion auditable | Works only on authorized cards; release and production changes require separate authority |
| `Squad` | Named, fixed-size Fullstacker swarm; True Ready checks; ordered evidence gates; non-overlapping ownership; integration owner; handoff contracts and integrated validation | Enables coordinated delivery with fewer edit collisions; ensures member-level success becomes a verified integrated outcome | Orchestrator, not an extra implementer, board administrator, or release authority |
| `Factory` | Continuous demand-to-value loop; VOC/ProductOwner/Kanban/Squad orchestration; cycle metrics; continuity detection; required four-role recovery panel and Yes/No human escalation | Connects discovery, prioritization, readiness, and delivery; resolves stalls through bounded evidence-based recovery | Delegates specialist work; cannot manufacture demand, bypass WIP, or self-authorize production actions |
| `FactoryLauncher` | Adaptive setup/resume; setup-MVP ownership; required recovery-panel mobilization; first bounded value cycle; durable launch package; value and harm feedback plans | Gets a new Factory through its first verified value increment and resumes existing production work, reducing launch and continuity risk | Invocation authorizes bounded setup/first-cycle or existing-work resumption, not future iterations, unapproved spending, external actions, deployment, or release |

## Invocation and access truth table

| Agent | User-invocable | Can delegate agents | Invocation / entry point |
|:---|:---:|:---:|:---|
| VOC | T | — | Customer segment, research decision, and available evidence |
| ProductOwner | T | T | Product goal, backlog/VOC evidence, economics, and decision authority |
| AssociateProductOwner | — | — | Chief's explicit subproduct charter and output contract |
| Kanban | T | — | Board/work sources, permitted updates, and reporting question |
| Fullstacker | T | T | Authorized cards, iteration mandate, Definition of Done, and constraints |
| Squad | T | T | `<name> <n> [directive]`; positive integer member count |
| Factory | T | T | `Factory <name> Start [directive]`; FactoryLauncher can invoke it for an explicit setup/resume request |
| FactoryLauncher | T | T | Product idea or Factory name; optionally resume an existing launch package |

**Overall operating model:** FactoryLauncher completes bounded setup or resumption through a verified value cycle → Factory sustains the loop → VOC discovers demand → ProductOwner determines value and priority → Kanban governs unfinished-work flow → Squads coordinate Fullstackers to deliver. Humans retain strategy, consequential investment, out-of-scope decisions, and release authority.
