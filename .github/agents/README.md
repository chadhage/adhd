# ADHD

*Agent Driven Hybrid Development*

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
- FactoryLauncher prepares the launch mandate, artifacts, and readiness evidence; it does not deliver cards or certify completion.

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
| Factory | T | T | `Factory <name> Start [directive]`; model invocation explicitly disabled |
| FactoryLauncher | T | T | Product idea or Factory name; optionally resume an existing launch package |

**Overall operating model:** FactoryLauncher completes bounded setup or resumption through a verified value cycle → Factory sustains the loop → VOC discovers demand → ProductOwner determines value and priority → Kanban governs unfinished-work flow → Squads coordinate Fullstackers to deliver. Humans retain strategy, consequential investment, out-of-scope decisions, and release authority.

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
and save all documented Factory deliverables under .docs/factories/invoice-flow/
in the independently owned InvoiceFlow product workspace, after retrieving its
artifact-storage guidance. Do not save product artifacts in the ADHD agent repo.
Interview me for every remaining prerequisite and the iteration 1-10 plan.
```

Paths in these examples are relative to the independently owned product
workspace, not the ADHD agent-framework repository. To resume a paused
interview, select `FactoryLauncher` again and reference the saved manifest or
interview ledger:

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

An explicit setup or resume invocation authorizes the bounded work needed to
reach Factory setup MVP, including the required recovery panel and first value
cycle. Do not offer a routine pause or stop choice before that MVP. Continue
optional efficiency refinement only after the first value increment is verified
and demonstrated. A discovery-only request remains limited to its explicit
research scope; hard safety/permission limits and explicit human stop decisions
remain binding.

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