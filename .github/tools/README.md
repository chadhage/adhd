# Factory Halt-Prevention Tooling

Dependency-free Node (ESM) utilities that support the Unapproved-Halt Gate and Empirical Baselines in [Factory MVP and Recovery](../skills/factory-mvp-and-recovery/SKILL.md). They take paths as arguments, so the same scripts serve any product workspace. Product records stay in the product-owned workspace, never in this framework repository.

None of these tools grants authority or approves anything. Only `supervisor.mjs` can start a process, and only with `--execute`, only within owner-approved bounds, and only when scheduled by something you install. Locks are advisory, not a transaction service.

| Tool | Purpose | Status |
|---|---|---|
| `capability-preflight.mjs` | Read-only report of capabilities the Factory depends on (nested delegation, approval availability, hook health, network, records write access, supervisor), each with its effect and the owner decision that would restore it. | Ready |
| `hook-health.mjs` | Exercises the workspace hook as the runtime would: registration, script resolution from the workspace root, allow/ask/fail-closed behavior, latency against the configured timeout. Never changes the policy. | Ready |
| `approval-queue.mjs` | Append-only queue of blocked non-read actions with exact (secret-redacted) parameters, purpose, and card, so a human can decide them together. A denied action cannot be re-queued without changed evidence. Recording a request or decision never executes or approves anything. | Ready |
| `revision-lock.mjs` | Revision-checked writes with an advisory lock. A held lock or moved revision returns the proposed change instead of mutating. | Ready |
| `baseline-calc.mjs` | Computes a median or nearest-rank percentile baseline from observed samples, with n, range, exclusions, and optional seeded random sampling, and drafts the Yes/No/replace request for the owner. | Ready |
| `liveness-check.mjs` | Read-only detector for a suspected unapproved halt: unfinished work, no valid approval, no progress within a supplied deadline. Detection only; it never resumes work. | Detection only |
| `stop-gate.mjs` | `agentStop` hook script. That event fires at the end of **every** main-agent turn, so the gate lets a turn end when a valid human Factory-shutdown approval exists or a human decision is pending in the approval queue. Otherwise it blocks once; the forced retry is released (`stop_hook_active`) and reported as a suspected unapproved halt, so it can never trap a session. Inert unless a configured board file exists. | **Registered** in `tool-policy.json` (inert until a board is configured) |
| `supervisor.mjs` | One supervisor pass for an external scheduler (`tick`). Resumes the Factory only when unfinished work, no valid approval, and no progress within the deadline all hold. Honors an inhibit file, valid stoppage approvals, duplicate-run prevention, a cooldown, and a retry bound. Dry run unless `--execute`. Never uses a shell, never stores credentials, never kills a stalled run. | Built; **not scheduled** (needs your values and exact command) |

## Workspace configuration: `.github/hooks/factory-ops.json`

One reviewed file configures the hook, stop gate, and supervisor for a workspace. It ships empty, so nothing is allowed or resumed until the owner fills it in through the normal reviewed change process (the hooks directory is a protected path).

| Field | Meaning |
|---|---|
| `boardPaths` | Exact board files (`.md`, inside the workspace) whose structurally valid edits and reads need no prompt. Entries under agent, skill, hook, tool, `.vscode`, secret, or key paths, or that collide with the approvals, queue, progress, or config files, are dropped with a reason. |
| `approvalsPath` | Human approval records (`factory-shutdown-approval`, `stoppage-approval`). Keep it where agents cannot write. |
| `approvalQueuePath` | Approval queue file. |
| `progressPath` | Optional progress ledger (JSONL with `ts`) for the supervisor. Board modification time also counts as progress. |
| `unattended` | When `true`, an `ask` that no human can answer becomes an explicit `deny` and the exact action is parked in the queue. It only turns `ask` into `deny`; it never allows anything. |
| `supervisor` | `null` until configured. Requires `owner`, `authorizedBy`, `resume` (`command`, `args`, `cwd`), `restartPacketPath`, `statePath`, `logPath`, `inhibitPath`, and `deadline` and `retry` values, each with a `status` (`provisional` or `confirmed`) and a `source`. There are no defaults. |

Scoped board writes validate **structure, not meaning**: after the edit the board must still have To Do and In Progress and no Done/Archive bucket. They apply only to the `edit` and `create` tools, and anything else still asks.

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
- **Supervisor.** `supervisor.mjs tick` is meant to be run by an external scheduler that you install; this repository does not install one. Use the full path to the resume executable (no shell is used, so `.cmd` shims may not run). The resumed run inherits the scheduler user's environment and the supervisor stores no credentials. A resumed run is still subject to the hook: with `unattended` on, non-allowlisted actions are denied and queued, not performed. A stalled resumed run is reported as `child-stalled`, never killed.

## Tests

```powershell
node --test .github/tools/tests/queue-and-lock.test.mjs .github/tools/tests/baseline-calc.test.mjs .github/tools/tests/detection-and-preflight.test.mjs .github/tools/tests/supervisor.test.mjs .github/hooks/tests/factory-ops.test.mjs
```

## Supervisor usage

```powershell
node .github/tools/supervisor.mjs tick            # dry run: logs "would-restart" and never spawns
node .github/tools/supervisor.mjs tick --execute  # resumes the Factory when every condition holds
```

Exit codes: `0` nothing to do or restarted, `1` halt suspected without a restart (dry run, restart limit reached, spawn failed, stalled child), `3` needs input (not configured, invalid config, unverifiable board). To stop all restarts immediately, create the file named by `supervisor.inhibitPath` or record a human `factory-shutdown-approval`.
