---
name: fullstack-one-piece-flow
description: "Deliver an authorized Kanban card in one-piece flow from pull through integrated verification. Use to limit WIP, avoid context switching, build a complete vertical outcome, respond to blockers, and stay with work until empirical Definition of Done evidence exists."
argument-hint: "Provide the card ID, iteration authority, acceptance criteria, Definition of Done, WIP limit, repository commands, and environment permissions."
---

# Full-stack One-piece Flow

## Procedure

1. Verify the card is authorized, appears once in `To Do` or `In Progress`, has usable acceptance and done criteria, and fits the current mandate. Do not start work because this skill was invoked.
2. Pull only the highest authorized card that can make meaningful progress. Respect the configured WIP limit and obtain an explicit override before exceeding it.
3. Request the governing Kanban role to move `To Do` to `In Progress` only when concrete work begins. Supply owner, start evidence, next action, and relevant risks; the delivery role does not mutate board state directly.
4. Establish the controlling implementation path, one falsifiable hypothesis, and the cheapest check that can disprove it. Make the smallest coherent change, then immediately validate the touched behavior.
5. Continue through the complete vertical outcome. Include every necessary layer and operational artifact; defer optional scope rather than leaving mandatory integration unfinished.
6. Keep the card active through local failures. Repair supported defects and rerun the same focused check. If blocked, record the blocker, evidence, attempted resolution, accountable owner, and unblocking condition; do not quietly pull unrelated work.
7. Integrate and broaden validation in proportion to risk. Confirm acceptance, regressions, security, accessibility, data safety, packaging, infrastructure, deployment readiness, and observability where applicable.
8. Produce the criterion-by-criterion empirical done evidence. Submit it to the governing Kanban role, which owns the completion-record update and board removal. Release and production changes require their own authority.

## Quality Gate

The card is either evidenced done or explicitly unfinished with a concrete blocker. Partial layers, planned tests, generated files, elapsed effort, or another agent's unsupported report are not completion evidence.