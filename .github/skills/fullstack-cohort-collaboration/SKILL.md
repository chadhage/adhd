---
name: fullstack-cohort-collaboration
description: "Coordinate solo, pair, swarm or independent card cohorts from one common Squad Kanban. Use ready-task dispatch, disjoint ownership, scoped writers, incremental integration and accepted handoffs without fabricating concurrency or shared context."
argument-hint: "Provide the card, participants, runtime capabilities, task graph, ownership boundaries, branch policy, and integration owner."
---

# Full-stack Cohort Collaboration

Bind [Shared Product Planning and Squad Kanban](../kanban-one-factory-many-squads/SKILL.md#shared-product-planning-and-squad-kanban),
[Concurrent Dispatch](../kanban-one-factory-many-squads/SKILL.md#concurrent-dispatch)
and [Handoff Continuity](../kanban-one-factory-many-squads/SKILL.md#handoff-continuity).
One-piece flow applies per member/card cohort, not as a single-card ceiling for
the whole Squad. Additional independent cohorts need admitted cards, approved
WIP and disjoint actual capacity; do not duplicate members or boards.

## Procedure

1. Confirm the authorized card, participants actually available, runtime concurrency, branch and repository policy, task graph, shared artifacts, and one accountable integration owner.
2. Choose solo work for tightly coupled or very small changes; pair programming for high uncertainty, shared reasoning, or risky edits; swarming for a high-value card with separable tasks; and a cohort for multiple coordinated specialists with explicit contracts.
3. For pairing, establish driver and navigator responsibilities, a rotation trigger, the current hypothesis, and the validation target. Do not claim pairing when work occurred in isolated sequential sessions without interaction.
4. For swarming or cohorts, assign non-overlapping files or components and explicit interface ownership. Protect shared schemas, lock files, migrations, generated code, and central configuration with one writer or serialized changes. Use approved isolated worktrees where needed; never switch a shared dirty checkout underneath another writer.
5. Define source-linked handoffs with stable task/card/handoff IDs, expected revisions, assumptions, changed artifacts, commands/results, risks, interface version, integration condition and actual receiver acceptance. Dispatch the ready set before waiting; reconcile each result and release eligible dependent work without a full-member/cohort barrier. Agents do not retain hidden shared memory.
6. Define reassignment recovery before parallel work: if an owner becomes unavailable or misses an approved checkpoint, preserve its branch/worktree and partial artifacts, freeze conflicting writes, identify an authorized replacement, and obtain explicit handoff acceptance covering current revision, unresolved decisions, and validation debt. Do not infer abandonment or discard another contributor's work. If ownership cannot be transferred safely, keep the task blocked and escalate while other independent work continues.
7. Integrate in small increments using the repository's branch policy. Serialize shared integration writes, not independent implementation or tests. Resolve conflicts by preserving intended behavior and user changes, not by choosing the easiest side.
8. Run contract and end-to-end validation on the combined result. Individual task success does not prove the card is done.
9. Record actual contributors, accepted ownership transfers, reviews, evidence, and unresolved dissent. Never invent parallel execution, consensus, review, or validation.

## Output and Checks

Return collaboration mode and rationale, ownership map, contracts, synchronization points, shared-write controls, handoff records, integration evidence, and blockers. Concurrency is useful only when it reduces delay without weakening correctness or traceability.