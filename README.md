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

### Invoke FactoryLauncher

1. Open Copilot Chat in VS Code and select `FactoryLauncher` from the agent picker.
2. Submit a Factory name or product idea. Include known beneficiaries, desired outcome, constraints, evidence, authority, and artifact locations when available; missing inputs will be collected during the interview.
3. Answer each focused question. Do not use the initial prompt to imply launch, delivery, financial, or release approval.

Minimal invocation:

```text
Prepare a Factory named InvoiceFlow to help independent consultants
reduce manual unpaid-invoice follow-up. Interview me to establish the
minimum prerequisites, then offer the choice to finish or refine efficiency.
```

Invocation with known constraints:

```text
Prepare a Factory named InvoiceFlow for independent consultants who need to
reduce manual unpaid-invoice follow-up. I am authorized to prepare a draft for
the product owner, but not to approve spending, implementation, or release.
Use a discovery-ready launch, a WIP limit of one pending owner confirmation,
and save all documented Factory deliverables under .docs/factories/invoice-flow/.
Interview me for every remaining prerequisite and the iteration 1-10 plan.
```

To resume a paused interview, select `FactoryLauncher` again and reference the
saved manifest or interview ledger:

```text
Resume the InvoiceFlow Factory launch interview from
.docs/factories/invoice-flow/launch-manifest.md. Revalidate prior decisions and
ask the highest-impact unresolved question next.
```

The launcher reads existing records, asks one focused question at a time, and
collects purpose, beneficiaries, scope, human authority, value and harm
guardrails, evidence or a discovery plan, resources, permissions, WIP, roster
availability, product-development references, and the first authorized action.
It also establishes iterations 1 through 10, including each cumulative MVP
increment, dissatisfiers, satisfiers, Definition of Done, demo, feedback rules,
budget/burn, roster, skills, and authorization. Recommendations require
confirmation; missing evidence remains unknown.

Once the minimum gate passes, choose to finish the interview and prepare the
package, continue an optional efficiency interview, or pause and save progress.
You may stop earlier, but the resulting package will be marked incomplete.
Discovery-ready does not mean delivery-ready: implementation requires separate
iteration authorization and True Ready evidence.

The approved package includes a charter and artifact index, decision/authority
ledger, evidence and validation plan, ProductOwner backlog/economics, Kanban
board, readiness/quality contract, roster/handoffs, cycle/outcome and completion
ledger structures, demo/feedback records, cadence checkpoints, and an
escalation/activation brief. All documented Factory deliverables belong under
`.docs/`, normally `.docs/factories/<safe-name>/`. Invocable products follow
their selected product reference's best-practice layout, or use `src/` when the
reference does not define one. The launcher does not fabricate cycle results or
create application code.

After iteration 10, the invoker must choose whether to retain the 10-iteration
cadence or set a new positive-integer cadence. Iteration 37 cannot be authorized
until VOC, Kanban, and empirical product artifacts have been calibrated.

Launch is a separate explicit decision. Select [Factory](.github/agents/factory.agent.md)
and submit the generated `Factory <name> Start [directive]` command referencing
the approved manifest, version, mode, scope, and first action, for example:

```text
Factory InvoiceFlow Start manifest=.docs/factories/invoice-flow/launch-manifest.md
```

Use the exact activation prompt generated by FactoryLauncher when it differs
from this illustrative form. Factory's model-invocation restriction remains unchanged.
Runtime availability and actual mobilization must be verified; producing a
package alone does not mean a Factory has started.
