---
name: fullstack-cohort-collaboration
description: "Coordinate solo, pair-programming, swarming, or cohort delivery on one feature, branch, or repository. Use to select collaboration mode, assign non-overlapping ownership, synchronize contracts, integrate frequently, and verify combined work without fabricating concurrency or shared context."
argument-hint: "Provide the card, participants, runtime capabilities, task graph, ownership boundaries, branch policy, and integration owner."
---

# Full-stack Cohort Collaboration

## Procedure

1. Confirm the authorized card, participants actually available, runtime concurrency, branch and repository policy, task graph, shared artifacts, and one accountable integration owner.
2. Choose solo work for tightly coupled or very small changes; pair programming for high uncertainty, shared reasoning, or risky edits; swarming for a high-value card with separable tasks; and a cohort for multiple coordinated specialists with explicit contracts.
3. For pairing, establish driver and navigator responsibilities, a rotation trigger, the current hypothesis, and the validation target. Do not claim pairing when work occurred in isolated sequential sessions without interaction.
4. For swarming or cohorts, assign non-overlapping files or components and explicit interface ownership. Protect shared schemas, lock files, migrations, generated code, and central configuration with one writer or serialized changes.
5. Define handoff packets: task and card IDs, assumptions, changed artifacts, commands and results, unresolved risks, interface version, and integration condition. Agents do not retain hidden shared memory.
6. Integrate in small increments using the repository's branch policy. Resolve conflicts by preserving intended behavior and user changes, not by choosing the easiest side.
7. Run contract and end-to-end validation on the combined result. Individual task success does not prove the card is done.
8. Record actual contributors, reviews, evidence, and unresolved dissent. Never invent parallel execution, consensus, review, or validation.

## Output and Checks

Return collaboration mode and rationale, ownership map, contracts, synchronization points, shared-write controls, handoff records, integration evidence, and blockers. Concurrency is useful only when it reduces delay without weakening correctness or traceability.