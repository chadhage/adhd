---
name: kanban-card-flow
description: "Evaluate and apply evidence-backed Kanban card transitions among To Do, In Progress, and removal after verified completion. Use to classify active work, move or pause cards, enforce authorization and WIP limits, and hand completed cards to an established completion record without inventing extra buckets."
argument-hint: "Provide card IDs, current evidence, requested transitions, authority, WIP limit, and completion-record location."
user-invocable: true
disable-model-invocation: false
---

# Kanban Card Flow

## State Rules

- `To Do` means known unfinished work that has not started or is not currently being worked.
- `In Progress` means unfinished work with an identified owner or active agent and concrete evidence that work has started.
- Blocked, waiting, review, paused, stale, and at-risk are attributes. They do not create additional buckets.
- Verified completion removes a card from the unfinished board only after its completion criteria and verification evidence are recorded in the repository's established completion or iteration record.

## Procedure

1. Establish each card's current bucket, requested transition, owner, acceptance or exit criteria, evidence, dependencies, iteration authority, edit authority, configured work-in-progress limit, and completion-record location.
2. Validate that the card is in scope and appears exactly once. Stop and request reconciliation when its identity, scope, or current state is contradictory.
3. For `To Do` to `In Progress`, require concrete activity evidence and an identified owner or active agent. Priority, planning, assignment without activity, or iteration selection alone is insufficient.
4. For `In Progress` to `To Do`, require evidence that active work has stopped or an authorized decision to pause it. Preserve blocker, partial-work, dependency, and restart context as attributes.
5. For removal after completion, require satisfied exit criteria, observed verification evidence, and an authorized established completion record. Record the evidence there before removing the card; never add `Done`, archive, or completed as a live board bucket.
6. For blocked, waiting, review, paused, stale, or at-risk work, update the relevant attributes, next action, owner, and date without changing buckets unless the active-work rule independently requires a move.
7. Before moving work into `In Progress`, calculate the resulting WIP count. If it would exceed the configured limit, block the transition until an authorized human explicitly approves the exception. Record the override and resulting excess; never hide excess work or invent a limit.
8. Apply only authorized transitions, update source references and timestamps, and preserve unrelated card facts. Otherwise return the proposed transition and the missing evidence or decision.
9. Recount both buckets and verify that transitioned cards remain represented exactly once unless they were validly handed off as completed.

## Output and Quality Gate

Return each card ID, prior state, requested state, evidence, authorization, WIP impact, decision, changes made or proposed, completion-record reference when applicable, and unresolved blocker or next action.

- Every transition follows evidence rather than intention or status labels alone.
- A move that exceeds the configured WIP limit has an explicit authorized override.
- No transition silently starts an iteration, expands locked scope, or marks planned work complete.
- Completion removal has an established evidence record outside the unfinished board.
- Bucket counts and card IDs reconcile after all authorized changes.
- No owner, activity, verification result, date, limit, or approval is fabricated.