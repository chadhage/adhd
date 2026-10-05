---
name: fullstack-atomic-decomposition
description: "Decompose a complex full-stack card into atomic, independently verifiable tasks that preserve a vertical outcome and enable safe pairing or concurrent swarming. Use for dependency mapping, interface contracts, ownership boundaries, integration order, and avoiding layer-only or overlapping work."
argument-hint: "Provide the authorized card, acceptance criteria, architecture constraints, candidate collaborators, and shared-file or interface risks."
---

# Full-stack Atomic Decomposition

## Procedure

1. Restate the card's customer or operational outcome, acceptance criteria, Definition of Done, fixed constraints, and authorized scope. Decomposition must not expand the card.
2. Identify the thinnest end-to-end walking skeleton and the observable seams: behavior, interfaces, data contracts, migrations, UI states, security boundaries, infrastructure, telemetry, and tests.
3. Split work into tasks that each have one outcome, bounded files or components, explicit inputs/outputs, a discriminating validation, and a merge or integration condition. Prefer vertical slices; use layer tasks only when a contract makes them independently verifiable.
4. Map dependencies and the critical path. Remove artificial sequencing by defining contracts or fixtures, but do not mock away the integration behavior required by acceptance.
5. Assign non-overlapping write ownership. Mark shared files, schemas, generated artifacts, migration order, and interface owners. One owner integrates each shared boundary.
6. Choose solo, pair, or swarm execution. Parallelize only independent tasks whose coordination cost and merge risk are lower than the expected delay reduction.
7. Define frequent integration checkpoints and an end-to-end validation owner. Atomic tasks are implementation controls, not automatically new Kanban cards or separate claims of done.
8. Reconcile all tasks to the original criteria. Remove tasks with no criterion, risk control, or required enablement; flag criteria with no task or validation.

## Output and Checks

Return the task graph, critical path, contracts, ownership, validations, shared-file risks, integration checkpoints, and mapping from every task to acceptance or risk. The plan must be executable without duplicate ownership and must preserve one integrated card outcome.