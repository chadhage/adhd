# ADHD

*Agent Driven Hybrid Development*

## Agent feature truth table

Based on the eight definitions in `.github/agents/`.

**Legend:** **T** = explicitly assigned capability; **D** = coordinates or delegates it; **B** = bounded by a delegated charter; **—** = not assigned. These are declared responsibilities, not verified runtime capabilities.

| Agent | Customer research | ROI / economics | Product priority | Board administration | Code delivery | Team orchestration | Completion verification |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **VOC** | T | — | — | — | — | — | — |
| **ProductOwner** | D | T | T | — | — | T | — |
| **AssociateProductOwner** | B | B | B | — | — | — | — |
| **Kanban** | — | — | — | T | — | — | T |
| **Fullstacker** | — | — | — | D | T | T | T |
| **Squad** | — | — | D | D | D | T | T |
| **Factory** | D | D | D | D | D | T | T |
| **FactoryLauncher** | D | D | D | D | — | T | — |

**Important distinctions**
- VOC ranks **research opportunities**, not the authoritative product backlog.
- AssociateProductOwner analyzes supplied VOC evidence within its charter; missing research or authority must be escalated.
- Fullstacker’s economic sequencing uses agreed WSJF/CD3 inputs; it does **not** own product priority.
- Kanban checks supplied completion evidence and records completion; it does **not** perform engineering verification itself.
- Squad and Factory require and reconcile delivery evidence; accountable member agents perform the work.
- FactoryLauncher prepares the launch mandate, artifacts, and readiness evidence; it does not deliver cards or certify completion.

## Features and intended benefits

Benefits below are inferred from the documented features, not measured outcomes.

| Agent | Principal features | Intended benefits | Key boundary |
|---|---|---|---|
| `VOC` | Focus groups, interviews, surveys, telemetry analysis, comparative analysis; evidence ledger; counterevidence; proposition hypotheses and validation plans | Helps identify genuine unmet needs and reduces investment in unsupported customer assumptions | Does not invent research, approve investments, or implement products |
| `ProductOwner` | Backlog ownership; financial, Kano, business-model, value-proposition, SWOT and scenario analysis; priority tie-breaking; Chief Product Owner coordination | Connects customer demand to economic decisions; resolves priority deadlocks; reconciles shared costs and dependencies across subproducts | Cannot invent investment thresholds, widen authorized scope, or override quality gates |
| `AssociateProductOwner` | Bounded subproduct analysis; VOC assessment; incremental economics; dispositions and ordering recommendations; explicit escalation and return contract | Scales product analysis while preserving centralized strategy, consistent assumptions, and portfolio accountability | Delegate-only; no recursive delegation, independent portfolio authority, or delivery |
| `Kanban` | Complete unfinished-work inventory; exactly two default buckets; evidence-backed transitions; WIP enforcement; duplicate/omission reconciliation; per-card and total-lot reporting | Makes unfinished work, blockers, ownership, and overload visible; prevents unsupported completion and misleading totals | Does not set product priority or execute card work |
| `Fullstacker` | End-to-end vertical delivery; one-piece flow; atomic decomposition; solo/pair/cohort work; BDD/TDD; secure architecture; delivery automation; criterion-by-criterion done evidence | Produces integrated increments rather than disconnected layers; reduces regression risk and makes completion auditable | Works only on authorized cards; release and production changes require separate authority |
| `Squad` | Named, fixed-size Fullstacker swarm; True Ready checks; ordered evidence gates; non-overlapping ownership; integration owner; handoff contracts and integrated validation | Enables coordinated delivery with fewer edit collisions; ensures member-level success becomes a verified integrated outcome | Orchestrator, not an extra implementer, board administrator, or release authority |
| `Factory` | Continuous demand-to-delivery loop; VOC/ProductOwner/Kanban/Squad orchestration; cycle metrics; quiescence detection; bounded council negotiation and human escalation | Connects discovery, prioritization, readiness, and delivery; detects stalled flow and establishes an explicit recovery path | Delegates specialist work; cannot manufacture demand, bypass WIP, or self-authorize production actions |
| `FactoryLauncher` | Adaptive prerequisite interview; minimum-viable checkpoint; optional efficiency refinement; delegated specialist preparation; durable launch package; value and harm feedback plans | Reduces launch ambiguity and preserves human control while preparing evidence-backed cycles of learning and value creation | Preparation is not launch consent, implementation authority, financial approval, or proof of benevolence |

## Invocation and access truth table

| Agent | User-invocable | Can delegate agents | Invocation / entry point |
|---|:---:|:---:|---|
| VOC | T | — | Customer segment, research decision, and available evidence |
| ProductOwner | T | T | Product goal, backlog/VOC evidence, economics, and decision authority |
| AssociateProductOwner | — | — | Chief’s explicit subproduct charter and output contract |
| Kanban | T | — | Board/work sources, permitted updates, and reporting question |
| Fullstacker | T | T | Authorized cards, iteration mandate, Definition of Done, and constraints |
| Squad | T | T | `<name> <n> [directive]`; positive integer member count |
| Factory | T | T | `Factory <name> Start [directive]`; model invocation explicitly disabled |
| FactoryLauncher | T | T | Product idea or Factory name; optionally resume an existing launch package |

**Overall operating model:** FactoryLauncher optionally prepares an evidence-backed, human-approved launch package → Factory orchestrates the loop → VOC discovers demand → ProductOwner determines value and priority → Kanban governs unfinished-work flow → Fullstackers deliver, optionally coordinated by Squads. Humans retain launch, consequential investment, scope, and release authority.

## Preparing a Factory with FactoryLauncher

Select [FactoryLauncher](.github/agents/factory-launcher.agent.md) and provide an idea or Factory name:

```text
Prepare a Factory named InvoiceFlow to help independent consultants
reduce manual unpaid-invoice follow-up. Interview me to establish the
minimum prerequisites, then offer the choice to finish or refine efficiency.
```

The launcher reads existing records, asks one focused question at a time, and
collects purpose, beneficiaries, scope, human authority, value and harm
guardrails, evidence or a discovery plan, resources, permissions, WIP, roster
availability, and the first authorized action. Recommendations require
confirmation; missing evidence remains unknown.

Once the minimum gate passes, choose to finish the interview and prepare the
package, continue an optional efficiency interview, or pause and save progress.
You may stop earlier, but the resulting package will be marked incomplete.
Discovery-ready does not mean delivery-ready: implementation requires separate
iteration authorization and True Ready evidence.

The approved package includes a charter and artifact index, decision/authority
ledger, evidence and validation plan, ProductOwner backlog/economics, Kanban
board, readiness/quality contract, roster/handoffs, cycle/outcome and completion
ledger structures, and escalation/activation brief. Existing authoritative
records are reused; new destinations are confirmed before writing. The launcher
does not fabricate cycle results or create application code.

Launch is a separate explicit decision. Select [Factory](.github/agents/factory.agent.md)
and submit the generated `Factory <name> Start [directive]` command referencing
the approved package. Factory's model-invocation restriction remains unchanged.
Runtime availability and actual mobilization must be verified; producing a
package alone does not mean a Factory has started.