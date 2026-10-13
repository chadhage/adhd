# Factory Halt-Prevention Tooling

Dependency-free Node (ESM) utilities that support the Unapproved-Halt Gate and Empirical Baselines in [Factory MVP and Recovery](../skills/factory-mvp-and-recovery/SKILL.md). They take paths as arguments, so the same scripts serve any product workspace. Product records stay in the product-owned workspace, never in this framework repository.

None of these tools grants authority, approves anything, or restarts anything. Locks are advisory, not a transaction service.

| Tool | Purpose | Status |
|---|---|---|
| `capability-preflight.mjs` | Read-only report of capabilities the Factory depends on (nested delegation, approval availability, hook health, network, records write access, supervisor), each with its effect and the owner decision that would restore it. | Ready |
| `hook-health.mjs` | Exercises the workspace hook as the runtime would: registration, script resolution from the workspace root, allow/ask/fail-closed behavior, latency against the configured timeout. Never changes the policy. | Ready |
| `approval-queue.mjs` | Append-only queue of blocked non-read actions with exact (secret-redacted) parameters, purpose, and card, so a human can decide them together. A denied action cannot be re-queued without changed evidence. Recording a request or decision never executes or approves anything. | Ready |
| `revision-lock.mjs` | Revision-checked writes with an advisory lock. A held lock or moved revision returns the proposed change instead of mutating. | Ready |
| `baseline-calc.mjs` | Computes a median or nearest-rank percentile baseline from observed samples, with n, range, exclusions, and optional seeded random sampling, and drafts the Yes/No/replace request for the owner. | Ready |
| `liveness-check.mjs` | Read-only detector for a suspected unapproved halt: unfinished work, no valid approval, no progress within a supplied deadline. Detection only; it never resumes work. | Detection only |
| `stop-gate.mjs` | Stop-hook script that blocks a stop unless a valid human Factory-shutdown approval is recorded. Opt-in via `--board`. | **Not registered** in `tool-policy.json` (see below) |

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
- **Stop hook.** The Stop event schema differs by harness. Verify it in the active harness, then register `stop-gate.mjs` deliberately through the reviewed hook-change process. A blocked stop is released on the next attempt (`stop_hook_active`) to avoid loops, and that release is reported as a suspected unapproved halt.
- **Supervisor.** Restarting or resuming unattended work requires a separately authorized supervisor. `liveness-check.mjs` supplies only its detection signal.

## Tests

```powershell
node --test .github/tools/tests/queue-and-lock.test.mjs .github/tools/tests/baseline-calc.test.mjs .github/tools/tests/detection-and-preflight.test.mjs
```
