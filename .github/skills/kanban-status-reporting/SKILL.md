---
name: kanban-status-reporting
description: "Report the evidence-backed status of every Kanban card and the total unfinished-work lot. Use for board snapshots, flow-health reports, WIP-limit checks, blocker and risk summaries, stale or unowned work, dependency concerns, and reconciled To Do versus In Progress counts."
argument-hint: "Provide the board, reporting timestamp, freshness rule, WIP limit, scope, and any comparison period."
user-invocable: true
disable-model-invocation: false
---

# Kanban Status Reporting

## Purpose and Inputs

Produce a report in which the item-level detail and aggregate totals agree. Obtain the authoritative board, scope, reporting timestamp and time zone, freshness or staleness rule, configured work-in-progress limit, and optional prior snapshot. If a rule or limit is not configured, report it as unknown rather than inventing one.

For a Factory engagement, also obtain the approved reserve threshold/unit/scope, readiness criteria, replenishment lead time, current/next accepted assignments, progress evidence, acknowledgement/waiting/liveness deadlines, recovery ownership, and actual runtime monitoring availability. Bind the report to board/source revisions or content digests; changed sources require a refreshed report, not a claim of current status from a stale snapshot.

## Procedure

1. Validate that the board uses `To Do` and `In Progress` as its only live buckets. Treat blocked, waiting, review, paused, stale, and at-risk as attributes.
2. List every card exactly once with ID, bucket, evidence-backed current status, owner, blocker or risk, next action, last update, dependencies, and source reference when available.
3. Check freshness using the supplied rule. If no rule exists, show last-update dates without labeling cards stale.
4. Count total unfinished cards and counts by bucket. Derive the totals from the listed card IDs, not from copied summary values.
5. Count and list IDs for blocked, at-risk, stale, unowned, dependency-constrained, and evidence-deficient cards. Attribute categories may overlap; disclose overlap rather than summing them as disjoint totals.
6. Compare the `In Progress` count with the configured WIP limit. Report headroom or excess and the affected IDs; if no limit exists, state that WIP-limit health cannot be assessed.
7. Surface omissions, duplicates, contradictory states, unauthorized scope, and cards lacking enough evidence for their bucket. Recommend reconciliation rather than silently repairing the board unless edits are authorized.
8. When a prior comparable snapshot exists, report additions, removals, transitions, and attribute changes. Do not infer throughput, cycle time, trend, or causality from incompatible or incomplete snapshots.
9. Recompute all totals and ensure every aggregate can be traced back to item-level IDs before publishing.
10. Reconcile reserve from distinct authorized True Ready `To Do` IDs, excluding active, blocked, unready, or overlapping work. Compare against approved limits and lead time; report starvation forecast with uncertainty and request replenishment through Factory when the next assignment is missing or reserve is below or forecast below threshold. Report accepted handoffs, last observed progress, deadline breaches, recovery owner, and authorized furlough/custody/reopen evidence. Status updates or returned calls alone are not progress or lifecycle termination. Missing terms remain owner-decision gaps; a report does not implement scheduled monitoring.

## Output Contract

Return:

- Scope, sources, reporting timestamp, freshness rule, WIP limit, and evidence gaps.
- `To Do`: every card's ID, status, owner, blocker or risk, next action, and last update.
- `In Progress`: the same fields for every active card.
- Total lot: unfinished count; counts by bucket; counts and IDs for blocked, at-risk, stale, unowned, dependency-constrained, and evidence-deficient work; WIP headroom or excess.
- Reconciliation concerns and, when valid comparison data exists, changes since the prior snapshot.
- Snapshot: board/source revisions or digests, reporting scope, and unresolved changes or inaccessible evidence.
- Reserve: approved threshold/unit/scope and authority reference, current/next assignment IDs and acceptance, eligible reserve IDs/count and readiness evidence, replenishment trigger/lead time, forecast/uncertainty, deficit owner, and next action.
- Liveness: last observed progress/evidence, accepted handoffs, next checkpoint, approved acknowledgement/waiting/progress deadlines and breaches, recovery owner, runtime monitoring availability, and any approved furlough with custody/reopen evidence. For non-Factory reports, mark these fields not applicable with rationale.
- The next required action or human decision.

## Quality Gate

- Item lists and aggregate counts reconcile exactly.
- Attribute categories disclose overlap and are not misrepresented as workflow buckets.
- Missing configuration and evidence are explicit.
- The report does not fabricate progress percentages, owners, dates, limits, trends, completion, or delivery evidence.