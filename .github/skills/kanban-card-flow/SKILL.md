---
name: kanban-card-flow
description: "Evaluate and apply evidence-backed Kanban card transitions among To Do, In Progress, and removal after verified completion. Use to classify active work, move or pause cards, enforce authorization and WIP limits, and hand completed cards to an established completion record without inventing extra buckets."
argument-hint: "Provide card IDs, current evidence, requested transitions, authority, WIP limit, and completion-record location."
user-invocable: true
disable-model-invocation: false
---

# Kanban Card Flow

For delivery admission apply
[Atomic and Independent Cards](../factory-mvp-and-recovery/SKILL.md#atomic-and-independent-cards);
assigned refinement is not verified delivery reserve.

## State Rules

- `To Do` means known unfinished work that has not started or is not currently being worked.
- `In Progress` means unfinished work with an identified owner or active agent and concrete evidence that work has started.
- Blocked, waiting, review, paused, stale, and at-risk are attributes. They do not create additional buckets.
- Verified completion removes a card from the unfinished board only after its completion criteria and verification evidence are recorded in the repository's established completion or iteration record.

## Procedure

1. Establish each card's current bucket, requested transition, owner, acceptance or exit criteria, evidence, dependencies, iteration authority, edit authority, configured work-in-progress limit, and completion-record location.
2. Validate that the card is in scope and appears exactly once. Stop and request reconciliation when its identity, scope, or current state is contradictory.
3. For `To Do` to `In Progress`, require concrete activity evidence and an identified owner or active agent. Delivery implementation additionally requires current True Ready evidence under approved criteria. Separately authorized research, refinement, or recovery uses its own exit criteria and permissions; its activity cannot count as delivery admission or ready reserve. Priority, planning, assignment without activity, or iteration selection alone is insufficient.
4. For `In Progress` to `To Do`, require evidence that active work has stopped or an authorized decision to pause it. Preserve blocker, partial-work, dependency, and restart context as attributes.
5. For removal after completion, require satisfied exit criteria, observed verification evidence, and an authorized established completion record. Record the evidence there before removing the card; never add `Done`, archive, or completed as a live board bucket.
6. For blocked, waiting, review, paused, stale, or at-risk work, update the relevant attributes, next action, owner, and date without changing buckets unless the active-work rule independently requires a move.
	For Factory work, a paused/quiesced attribute is a continuity incident: alert Factory and the required recovery panel, keep the work accurately represented, and do not treat the label itself as a recovery or completion.
7. Before moving work into `In Progress`, calculate the resulting WIP count. If it would exceed the configured limit, block the transition until an authorized human explicitly approves the exception. Record the override and resulting excess; never hide excess work or invent a limit.
8. Use one designated board writer and record the expected board revision or content digest. Under exclusive write ownership, recheck that revision, readiness/admission evidence, and resulting WIP immediately before applying the authorized transition; then record the new revision. On a mismatch, reread and recompute instead of overwriting or using stale WIP counts. If exclusive ownership is unavailable, return a proposed transition, not a board mutation. Update source references and timestamps and preserve unrelated card facts. For completion, record a stable completion ID and verification evidence first, then remove the card; after interruption, reconcile both records using that ID before retrying so neither completion nor removal is duplicated.
9. Recount both buckets and verify that transitioned cards remain represented exactly once unless they were validly handed off as completed.

## Output and Quality Gate

Return each card ID, prior state, requested state, evidence, authorization, WIP impact, decision, changes made or proposed, completion-record reference when applicable, and unresolved blocker or next action.

Include the designated writer, expected/resulting board revisions, admission evidence, and completion ID where applicable. Single-writer/version checks are required coordination, not proof of atomic storage support or concurrent safety; disclose unavailable enforcement.

- Every transition follows evidence rather than intention or status labels alone.
- A move that exceeds the configured WIP limit has an explicit authorized override.
- No transition silently starts an iteration, expands locked scope, or marks planned work complete.
- Completion removal has an established evidence record outside the unfinished board.
- Bucket counts and card IDs reconcile after all authorized changes.
- No owner, activity, verification result, date, limit, or approval is fabricated.