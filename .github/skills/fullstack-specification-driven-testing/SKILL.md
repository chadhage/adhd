---
name: fullstack-specification-driven-testing
description: "Apply BDD, TDD, Arrange-Act-Assert, and negative-first testing to full-stack behavior. Use to turn acceptance criteria into executable examples, drive minimal implementation, test security and failure boundaries first, and build a risk-proportionate regression suite."
argument-hint: "Provide acceptance criteria, current behavior, risk boundaries, test framework, failing check, and permitted implementation scope."
---

# Full-stack Specification-driven Testing

## Procedure

1. Translate each relevant acceptance criterion into observable examples using Given-When-Then or an equivalent behavior statement. Include actor, preconditions, action, result, and externally visible side effects.
2. Identify high-risk negative cases first for authentication, authorization, validation, injection, isolation, idempotency, concurrency, failure recovery, and data integrity. Negative-first means proving prohibited or unsafe behavior fails correctly before optimizing the happy path.
3. Choose the narrowest test level that proves the behavior: pure unit, component, contract, integration, end-to-end, infrastructure, migration, or operational check. Do not replace a required integration claim with mocks.
4. Write one failing test for one behavior. Structure tests with Arrange-Act-Assert when it clarifies causality. Verify the failure is for the intended reason, not broken setup.
5. Implement the minimum coherent production change to pass. Run the focused test immediately, then refactor under green tests without changing behavior.
6. Repeat in small increments. Add boundary, failure, and regression examples proportionate to impact and likelihood; avoid asserting private implementation details.
7. Run the relevant broader suite and quality gates. Record exact commands, environment, observed result, and material exclusions.
8. Map passing executable examples back to acceptance criteria. Keep criteria unresolved when evidence is flaky, skipped, simulated beyond its claim, or unavailable.

## Quality Gate

Tests are deterministic, isolated where appropriate, readable, and capable of failing when behavior regresses. Never claim TDD for tests written only after implementation, or BDD for prose that was not connected to observable acceptance.