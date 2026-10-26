# Factory Halt-Prevention Tooling

Dependency-free Node (ESM) utilities that support the Unapproved-Halt Gate and Empirical Baselines in [Factory MVP and Recovery](../skills/factory-mvp-and-recovery/SKILL.md). They take paths as arguments, so the same scripts serve any product workspace. Product records stay in the product-owned workspace, never in this framework repository.

None of these tools grants authority or approves anything. Only `supervisor.mjs` can start a process, and only with `--execute`, only within owner-approved bounds, and only when scheduled by something you install. Locks are advisory, not a transaction service.

| Tool | Purpose | Status |
|---|---|---|
| `capability-preflight.mjs` | Read-only report of capabilities the Factory depends on (nested delegation, approval availability, hook health, network, records write access, supervisor), each with its effect and the owner decision that would restore it. Reports Local and Agent Host approval defaults separately and explains the single native session grant, manual/selective alternatives, and human-only authentication exceptions. | Ready |
| `hook-health.mjs` | Exercises the workspace hook as the runtime would: registration, script resolution from the workspace root, host-permission inheritance, invalid-input denial, latency against the configured timeout. Never changes the policy or queues probe actions. | Ready |
| `approval-queue.mjs` | Append-only queue of blocked non-read actions with exact (secret-redacted) parameters, purpose, and card, so a human can decide them together. A denied action cannot be re-queued without changed evidence. Recording a request or decision never executes or approves anything. | Ready |
| `revision-lock.mjs` | Revision-checked writes with an advisory lock. A held lock or moved revision returns the proposed change instead of mutating. | Ready |
| `baseline-calc.mjs` | Computes a median or nearest-rank percentile baseline from observed samples, with n, range, exclusions, and optional seeded random sampling, and drafts the Yes/No/replace request for the owner. | Ready |
| `liveness-check.mjs` | Read-only detector for a suspected unapproved halt: unfinished work, no valid approval, no progress within a supplied deadline. Detection only; it never resumes work. | Detection only |
| `stop-gate.mjs` | `agentStop` hook script. An explicitly bounded turn may return; this is not Factory shutdown approval or proof of a saved checkpoint. Parallel/supervised and legacy profiles require shutdown approval or a pending human decision; otherwise the gate blocks once and releases a forced retry with an incident, never trapping the session. Inert without a configured board. | **Registered** in `tool-policy.json` |
| `supervisor.mjs` | One supervisor pass for an external scheduler (`tick`). Resumes the Factory only when unfinished work, no valid approval, and no progress within the deadline all hold. Honors an inhibit file, valid stoppage approvals, duplicate-run prevention, a cooldown, and a retry bound. Dry run unless `--execute`. Never uses a shell, never stores credentials, never kills a stalled run. | Built; **not scheduled** (needs your values and exact command) |

## Per-Factory Operations Center

[Factory Observability](../skills/factory-observability/SKILL.md) provides the
reusable installer and standalone runtime, with a visual live/analytics UI,
read-only HTTP JSON/SSE API, and read-only MCP stdio tools. Every launch/resume
derives its product-owned destination; no running instance or product telemetry
belongs in this reference repository. The installed metadata hook is separate
from the security policy and requires verified product-host session bindings.
All agent roles participate through attributable emissions/inbox records.

Runtime contracts, safety boundaries and limits are in the
[runtime guide](../skills/factory-observability/scripts/runtime/README.md).
Observability regression tests live alongside this tool suite and run through
the existing quality gate; browser UI checks are separate from backend coverage.

## Workspace configuration: `.github/hooks/factory-ops.json`

One reviewed file configures Factory records, the stop gate, and the supervisor for a workspace. It ships without boards or supervisor configuration, so those operations are inert until configured. Tool approval always follows the invoker's effective host/session permissions; this file does not grant or revoke it.

| Field | Meaning |
|---|---|
| `operatingProfile` | `bounded` is the new template's default proposal; `parallel` and `supervised` require accepted terms and observed capabilities under [Operating Profiles](../skills/factory-mvp-and-recovery/SKILL.md#operating-profiles). Missing legacy selection preserves old stop/supervisor semantics; invalid values are explicit problems, never a bounded fallback. Configuration does not accept or amend an engagement. |
| `boardPaths` | Exact board files (`.md`, inside the workspace) for Factory operations and structural checks, not a tool-approval allowlist. Entries under agent, skill, hook, tool, `.vscode`, secret, or key paths, or that collide with the approvals, queue, progress, or config files, are dropped with a reason. |
| `approvalsPath` | Human approval records (`factory-shutdown-approval`, `stoppage-approval`). Keep it where agents cannot write. |
| `approvalQueuePath` | Approval queue file. |
| `progressPath` | Optional progress ledger (JSONL with `ts`) for the supervisor. Board modification time also counts as progress. |
| `unattended` | Declares that no interactive human is present for capability reporting. Host-permitted calls still proceed. Host-blocked requests can be recorded explicitly with the approval-queue tool when permitted; the pre-tool hook cannot observe host approval results and does not automatically queue calls. |
| `supervisor` | `null` until configured. Requires `owner`, `authorizedBy`, `resume` (`command`, `args`, optional `cwd`), `statePath`, `logPath`, `inhibitPath`, and `deadline`/`retry` values with `status` and `source`. `restartPacketPath` is optional and its absence remains a recovery-evidence gap. Operating limits have no numeric defaults. |

The [local editor schema](../hooks/factory-ops.schema.json) describes the same
named profiles without changing host permission settings. Bounded and attended
parallel profiles do not require an unused supervisor. A selected bounded or
parallel profile cannot execute or audit a supervisor restart; supervised
operation still needs separate authorization and a tested external scheduler.
No scheduler, live worker, MCP login or broader approval is installed.

Preflight reports configuration and explicit unknowns. Its `--strict` exit
checks reported degraded configuration; an unknown live capability remains
unknown even if that exit is zero. Bind actual observations to the accepted
profile and source/runtime revision before depending on them. Preserve legacy
accepted guarantees during migration; do not use a new template to downgrade
a continuous engagement.

The board helper validates **structure, not meaning or authority**: after an `edit` or `create`, a valid board must still have To Do and In Progress and no Done/Archive bucket. A successful helper result never pre-approves a tool call. Board edits, protected-path edits, reads, shell commands, web calls, MCP calls, and delegation all use host permissions.

## VOC Enablement Proposals

These are proposals, not installed capabilities or new authorization. Start
with authorized supplied evidence and manual checks; add infrastructure only
for an evidenced need and separately approved scope.

| Interface | Potential support and required evidence |
| --- | --- |
| Source/access | A registry could reconcile segments, consent/data use, retention and access expiry with independently verified authority. A source cannot approve itself. |
| Primary evidence | Read-only import/query adapters or approved research channels may expose feedback, support, observation or telemetry; skills/tool names do not prove access or conducted research. |
| Protected evidence records | Candidate validators could check stable IDs, provenance/classification, quote/source agreement, duplicates, references, sensitive-data minimization, Git state and writer revisions. |
| Analysis/instrumentation | Use scoped reproducible queries, event/metric definitions, data-quality and sampling checks. Request missing instrumentation through ProductOwner/Factory, not unauthorized application changes. |
| Discovery freshness | Approved measures, capacity/lead time and consumption evidence could feed depletion alerts. Scheduled checks require a separately authorized, verified scheduler or human executor. Missing data is not zero demand. |
| Handoff reconciliation | Match opportunity/evidence IDs to actual owner acknowledgement, disposition/card, rationale and review deadline; expose orphaned or overdue items without accepting demand. |
| Outcome feedback | Link delivered increments to predeclared measures, permitted feedback and observed outcomes; missing sources/events are gaps, not evidence of effect. |

Existing generic capability, baseline, revision, and liveness helpers and the
registered hooks do not certify VOC findings or provide customer access.
Structural checks cannot prove a claim true, a participant authentic, a sample
representative or an interpretation correct. Validate any future adapters with
synthetic negative fixtures for missing/altered/duplicate evidence, stale
permissions, denied sources and failed handoffs. Never count those fixtures
as customer findings.

No new collection, contact, telemetry, or monitoring is authorized by this
charter. Preserve the live host grant, human authentication and privacy
boundaries. Hooks are not automatic approval or installed scheduled discovery.

## Session tool authorization

The pre-tool hook CLI accepts one optional event (`preToolUse`, `postToolUse`, or `subagentStart`, case-insensitive) and at most one non-empty `--root` and `--config` value. Unknown options, missing/blank values, duplicate options, and extra/unsupported events exit `2` with an argument diagnostic and no permission response.

For reference/product separation, `--root <product>` selects that root and its `.github/hooks/factory-ops.json`; `--config <file>` can select a different configuration file. Relative CLI paths resolve against the invocation working directory, regardless of option/event order. Without either option, the hook retains its reference-checkout defaults rather than inferring authority from a payload or current directory. Explicit binding still leaves every tool decision to the host.

Unreadable, malformed, or wrong-version configuration fails closed with `Hook configuration invalid:` and exit `2`; the CLI never falls back from a selected product configuration to the reference configuration. A readable version-1 configuration can still contain rejected board targets; those structural problems are reported as warnings and grant no tool approval.

The static nesting report remains `unknown` even when `chat.subagents.allowInvocationsFromSubagents=true`: configuration alone does not prove a live Factory to Squad to Fullstacker invocation or the delivery leaf's command tools. A false setting remains `degraded`; an absent setting remains `unknown`. Observe the actual hierarchy and leaf tool surface separately.

The preflight reports `approval-availability` as `unknown` until the active host is checked; it never treats `chat.permissions.default`, Agent Host's `chat.defaultConfiguration.approvals`, or global auto-approval as proof of a live grant. For session-only autonomy, the human selects **Allow all** / **Bypass Approvals** once in the current permissions picker. The native confirmation is the single initial gate; do not add a chat confirmation or change workspace/global defaults. Reuse the live grant for all parent and nested agents. Human-selected manual/selective prompting and device/CLI/interactive authentication remain exceptions. See [Single Tool Authorization](../skills/factory-mvp-and-recovery/SKILL.md#single-tool-authorization).

This report diagnoses setup; it does not select the mode, verify live inheritance, or enforce a prompt budget. Count actual initial and subsequent routine confirmations in the selected harness before claiming session-autonomous readiness. Repeated host-required prompts remain a visible configuration limitation, never permission to bypass the host.

## Usage

```powershell
# Capability report for an engagement record
node .github/tools/capability-preflight.mjs --format md --records-dir <product-records-dir> [--unattended] [--supervisor-config <file>]

# Hook health
node .github/tools/hook-health.mjs

# Park a blocked action for a batched human decision, then record the human's decision
node .github/tools/approval-queue.mjs enqueue --queue <queue.jsonl> --requester Kanban --tool edit --target <path> --params '{"op":"move"}' --purpose "<why>" --card CARD-1
node .github/tools/approval-queue.mjs list --queue <queue.jsonl> --status pending
node .github/tools/approval-queue.mjs resolve --queue <queue.jsonl> --id AQ-1 --decision approved --approver "<human>" --source "<chat or approval record>"

# Baseline proposal from completed slices (CSV: id,start,end,class[,exclude])
node .github/tools/baseline-calc.mjs --input slices.csv --class CRUD --statistic median --unit minutes --sample 3 --seed 42

# Suspected-halt check (deadline is required; exit 1 = halt suspected, 3 = needs input)
node .github/tools/liveness-check.mjs --board <kanban.md> --progress <progress.jsonl> --approvals <approvals.jsonl> --deadline-ms <ms> --deadline-status provisional
```

## Assumptions and limits

- **No arbitrary defaults.** `liveness-check.mjs` requires a deadline, `revision-lock.mjs` has no stale-age timeout, and `baseline-calc.mjs` requires a statistic and unit. Operating values are measured and owner-confirmed, per Empirical Baselines.
- **Board format.** The board parser counts cards under `To Do` and `In Progress` headings as nested headings, table rows, or column-0 list items, and ignores `None` placeholders. It reports `parsed: false` rather than guessing when a bucket is missing.
- **Approval records** (`factory-shutdown-approval`, `stoppage-approval`) must name a human approver, a source, and a timestamp. The tools cannot verify authorship; keep the file in a path agents cannot write to (for example CODEOWNERS-protected).
- **Stop hook.** Verified against the GitHub Copilot hooks reference: `agentStop` (VS Code `Stop`) takes `stop_hook_active` and `cwd`, honors `{"decision":"block","reason":"..."}`, and the runtime overrides after 8 consecutive blocks. The script accepts both documented payload shapes. A live end-to-end block has not been observed in a Factory workspace; confirm it the first time a board is configured.
- **Supervisor.** `supervisor.mjs tick` is meant to be run by an external scheduler that you install; this repository does not install one. Use the full path to the resume executable (no shell is used, so `.cmd` shims may not run). The resumed run inherits the scheduler user's environment and the supervisor stores no credentials. The resume command must use the owner's intended host permissions; the supervisor and hooks never add an autonomy grant. Unattended mode does not replace host approvals with blanket denials. A stalled resumed run is reported as `child-stalled`, never killed.

## Tests and the quality gate

```powershell
node .github/tools/run-tests.mjs
```

One command runs every suite under `.github/tools/tests/` and `.github/hooks/tests/` and enforces the owner-specified policy. It exits `1` and names each violation if any of these fail:

| Rule | Requirement |
|---|---|
| All tests pass | 100%, including the acceptance suite. Skipped and TODO tests count as failures. |
| Every test is classified | Its title starts with `positive: ` or `negative: `. A negative test asserts a rejection, denial, block, failure, or refusal to act. |
| Negative-to-positive ratio | At least 2 negative tests per positive test. |
| Coverage | Every source file is at least 85% on lines, branches, and functions. Test files and the runner itself are excluded. |

Run a single file while developing with `node --test <file>`. `run-tests.mjs` is the pass/fail authority.
Failures also retain their top-level TAP diagnostics, including assertion
locations, observed values and timeouts; a later retry does not erase a failure.
Use only approved synthetic fixtures, never real credentials or private data,
in tests or diagnostic reports.

[`credit-rate-contract.test.mjs`](tests/credit-rate-contract.test.mjs) checks
the five agents' shared daily-rate instructions, pricing/freshness boundaries,
and worked credit-cost arithmetic. These are static contract checks, not a live
billing meter, scheduled human refresh, or proof of actual agent compliance.

[`agent-language-contract.test.mjs`](tests/agent-language-contract.test.mjs)
checks all nine agents' routing/permission metadata, explicit shared-contract
loading, local guards, relocated procedures/catalogs and relative links.
[`parallel-replenishment-contract.test.mjs`](tests/parallel-replenishment-contract.test.mjs)
checks concurrent-stream and independent-readiness wiring. These static checks
are not proof of simultaneous execution or outcome equivalence in a live host.
[`historian-contract.test.mjs`](tests/historian-contract.test.mjs) checks the
history procedure and the accepted assignment/mandatory-intake startup contract,
not an every-human-turn listener.
[`operating-profile.test.mjs`](tests/operating-profile.test.mjs) exercises profile
validation, bounded returns, legacy/continuous stop checks, preflight unknowns
and refusal of incompatible supervisor launches without process/state effects.
[`framework-contract.test.mjs`](tests/framework-contract.test.mjs) checks shared
loading, baseline obligations, editor/CI settings, unchanged query-only MCP
surfaces and the separation of configuration, authority and live evidence.
These are fixture/static checks, not a live-host assurance verdict.

The acceptance suite counts real spawned child PIDs independently of the
supervisor's final status. Post-spawn state-lock contention may correctly leave
one reservation and require explicit recovery, rather than report `restarted`.
Tests exercise that case and prohibit another launch or blind replay; independent
worker entrypoints must also exit cleanly. This proves the scoped process/state
behavior, not unattended Factory-session or customer-outcome assurance.

[`pricing-skill-contract.test.mjs`](tests/pricing-skill-contract.test.mjs) checks
PricingAIPoweredServices discovery, source/page provenance and conditional
pricing/authority safeguards. It does not validate the paper empirically,
verify live vendor prices, or approve a customer offer.

[`loss-leader-skill-contract.test.mjs`](tests/loss-leader-skill-contract.test.mjs)
checks LossLeaderTheory discovery, source/page provenance, model boundaries
and worked accounting fixtures. It is not an approximation solver, empirical
promotion validation, or authority to subsidize a customer offer.

[`federal-accounting-skill-contract.test.mjs`](tests/federal-accounting-skill-contract.test.mjs)
checks the FASAB skill's discovery, source/page provenance, hierarchy and
edition controls, and separation of accounting, forecasts and procurement
authority. These are static instruction checks, not an audit, compliance
certification or validation of a live transaction's accounting treatment.

The [Factory quality workflow](../workflows/factory-quality.yml) runs that exact gate for every pull request and pushes to `main`, on Windows with Node `22.21.0`. It records the tested revision and runtime, uses commit-pinned actions with read-only repository permissions, and does not ignore gate failures. The stable check name is `Factory quality gate`; making it required is a separately verified repository-owner setting. A local workflow file is not evidence that GitHub has run the check.

### Acceptance tests

[`acceptance.test.mjs`](tests/acceptance.test.mjs) drives the shipped hook and tools as real processes in a temporary product-like workspace, one group per Continuity Acceptance Scenario that tooling can verify. Scenarios that depend on agent judgment are not machine-testable and need an authorized product test engagement.

| Scenario | Coverage |
|---|---|
| AC-1 Assignment completes with unfinished cards | Machine-tested: the stop gate blocks a turn end without a shutdown approval |
| AC-5 Session ends or a call returns | Machine-tested: a real resumed process, duplicate-run prevention, retry bound, and disclosure when no supervisor exists |
| AC-7 Voluntary stop, revocation, safety | Machine-tested: inhibit file, agent-forged approvals rejected, human approval honored |
| AC-8 Queue exhaustion without invoker approval | Machine-tested: an empty board is still not a shutdown |
| AC-10 Approval pending, timed out, or denied | Machine-tested: permission-neutral hooks, explicit secret-redacted queue requests, yield on a pending decision, no re-queue after denial, no board-based approval bypass; active host permission behavior also requires manual verification |
| AC-11 Engagement term missing | Machine-tested: measured proposal, no-data, and refusal to run on unsourced values |
| AC-12 Writer unavailable | Machine-tested: a held lock returns a proposal and no mutation |
| AC-13 Runtime capability missing | Machine-tested: preflight degradation with owner decisions; settings never edited |
| AC-14 Idle role with no approval | Machine-tested: logged as a suspected unapproved halt, healthy after progress |
| To Do exists but reserve is unready; all WIP blocked; required role unavailable; authority or budget expires; missing or dissenting attestation | **Not machine-testable**: agent behavior, not tooling |

Tests that start real processes must not depend on timing: a resumed child stays alive until the test releases it, deadlines in those tests are far above scheduling delay, and the child is reaped inside the test before the workspace is removed (Windows keeps a directory busy while a child uses it).

## Supervisor usage

```powershell
node .github/tools/supervisor.mjs tick            # dry run: logs "would-restart" and never spawns
node .github/tools/supervisor.mjs tick --execute  # resumes the Factory when every condition holds
```

Exit codes: `0` nothing to do or restarted, `1` halt suspected without a restart (dry run, restart limit reached, spawn failed, stalled child), `3` needs input (not configured, invalid config, unverifiable board). To stop all restarts immediately, create the file named by `supervisor.inhibitPath` or record a human `factory-shutdown-approval`.

Only an absent supervisor state file starts a new history. Empty, malformed, or structurally invalid existing state produces `state-recovery-required` (exit `3`), preserves the file, and never launches a child. Reconcile the state with the actual run and approval history before explicitly repairing it; do not delete it to reset retry limits.

Before spawning, the supervisor revision-checks and durably writes a `reserved` attempt. A held lock, changed base revision, or write failure returns `state-reservation-failed` without launching. After spawning it records `started` or `failed` against that reservation's revision. An unrecordable launch result returns `state-recovery-required` with the observed attempt instead of claiming success or overwriting a newer state.

Audit lock and filesystem failures return `audit-write-failed` (exit `3`) with `operationStatus` and the observed attempt retained. A process may already have started: inspect the durable state and PID before reconciliation. Never restart a consequential action merely to repair a missing audit entry.

A `reserved` attempt, or a legacy attempt with neither a PID nor a recorded spawn failure, has an unknown outcome. The supervisor returns `state-recovery-required` even after cooldown or new progress. A crash before spawning and a crash after spawning but before recording its PID cannot safely be distinguished from that state alone. An authorized operator must reconcile the real process/effects and preserve the attempt history before repairing the record. Unknown phases, contradictory PID/phase/error fields, and nonsequential attempt histories are invalid; automatic retries never resolve that ambiguity.
