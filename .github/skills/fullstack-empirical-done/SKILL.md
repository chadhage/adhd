---
name: fullstack-empirical-done
description: "Determine whether a full-stack card satisfies acceptance criteria and Definition of Done using empirical evidence. Use to build a criterion-by-criterion evidence matrix, distinguish artifacts from observed results, expose gaps, record completion, and prevent unsupported done claims."
argument-hint: "Provide the card, acceptance criteria, Definition of Done, changed artifacts, test outputs, environment evidence, and completion-record location."
---

# Full-stack Empirical Definition of Done

## Procedure

1. Freeze the evaluated card version, authorized scope, acceptance criteria, Definition of Done, required quality gates, environment, and evidence timestamp. Do not silently weaken criteria after implementation.
2. Build a matrix with one row per criterion: required observable outcome, artifact or system under test, validation method, exact evidence, result, environment, and residual limitation.
3. Inspect produced artifacts for existence, relevance, integrity, and traceability. Source files, schemas, IaC, images, packages, documentation, and reports demonstrate production only when their contents and provenance are verified.
4. Require observed behavior for behavioral claims. Use test results, API responses, UI interaction and screenshots where relevant, migration checks, infrastructure validation, deployment health, telemetry, security scans, performance measurements, accessibility checks, and recovery exercises according to the criterion.
5. Distinguish passed, failed, blocked, not run, and not applicable. `Not applicable` requires rationale. Skipped, flaky, stale, mocked beyond the claim, or unavailable checks do not pass.
6. Verify regression and integration evidence for the affected blast radius. Confirm required documentation, operations, security, data, packaging, and deployment-readiness artifacts.
7. Declare candidate done only when every mandatory row passes with current traceable evidence and no unresolved blocker contradicts completion. Otherwise keep the card unfinished and state the smallest remaining work.
8. Submit the evidence to the governing Kanban role. Kanban owns recording it in the established completion or iteration artifact and removing the card from the unfinished board. Keep release, production deployment, and outcome realization as separate decisions and evidence.

## Output and Quality Gate

Return card and scope, evidence timestamp and environment, criterion matrix, artifact inventory, commands/checks and observed results, exclusions, residual risks, verdict, missing work, completion-record update, and release decision required.

Never accept plans, code presence, generated reports, elapsed effort, confidence, review assertions, or unsupported agent summaries as proof. Evidence must be reproducible or directly inspectable and must support exactly the claim made.