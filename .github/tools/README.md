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
| `stop-gate.mjs` | `agentStop` hook script. That event fires at the end of **every** main-agent turn, so the gate lets a turn end when a valid human Factory-shutdown approval exists or a human decision is pending in the approval queue. Otherwise it blocks once; the forced retry is released (`stop_hook_active`) and reported as a suspected unapproved halt, so it can never trap a session. Inert unless a configured board file exists. | **Registered** in `tool-policy.json` (inert until a board is configured) |
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
| `boardPaths` | Exact board files (`.md`, inside the workspace) for Factory operations and structural checks, not a tool-approval allowlist. Entries under agent, skill, hook, tool, `.vscode`, secret, or key paths, or that collide with the approvals, queue, progress, or config files, are dropped with a reason. |
| `approvalsPath` | Human approval records (`factory-shutdown-approval`, `stoppage-approval`). Keep it where agents cannot write. |
| `approvalQueuePath` | Approval queue file. |
| `progressPath` | Optional progress ledger (JSONL with `ts`) for the supervisor. Board modification time also counts as progress. |
| `unattended` | Declares that no interactive human is present for capability reporting. Host-permitted calls still proceed. Host-blocked requests can be recorded explicitly with the approval-queue tool when permitted; the pre-tool hook cannot observe host approval results and does not automatically queue calls. |
| `supervisor` | `null` until configured. Requires `owner`, `authorizedBy`, `resume` (`command`, `args`, `cwd`), `restartPacketPath`, `statePath`, `logPath`, `inhibitPath`, and `deadline` and `retry` values, each with a `status` (`provisional` or `confirmed`) and a `source`. There are no defaults. |

The board helper validates **structure, not meaning or authority**: after an `edit` or `create`, a valid board must still have To Do and In Progress and no Done/Archive bucket. A successful helper result never pre-approves a tool call. Board edits, protected-path edits, reads, shell commands, web calls, MCP calls, and delegation all use host permissions.

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

[`credit-rate-contract.test.mjs`](tests/credit-rate-contract.test.mjs) checks
the five agents' shared daily-rate instructions, pricing/freshness boundaries,
and worked credit-cost arithmetic. These are static contract checks, not a live
billing meter, scheduled human refresh, or proof of actual agent compliance.

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
