---
name: fullstack-delivery-automation
description: "Build and validate delivery automation for IaC, immutable infrastructure, containers, CI/CD, DevSecOps, observability, AIOps, and MLOps. Use for reproducible builds, secure packaging, deployment gates, migrations, rollback or recovery, provenance, and operational readiness."
argument-hint: "Provide the authorized card, target environments, existing pipeline, infrastructure toolchain, deployment authority, security gates, and recovery objectives."
---

# Full-stack Delivery Automation

## Procedure

1. Establish target environments, authority, existing IaC and pipeline conventions, artifact registries, identity model, data migrations, quality gates, observability, recovery objectives, and production-change boundaries.
2. Make builds reproducible and artifacts immutable. Pin or constrain dependencies according to policy, generate traceable versions and provenance, avoid environment-specific mutation, and never embed secrets.
3. Define infrastructure declaratively with idempotent validation and least-privilege identities. Use preview or plan operations before apply; detect destructive, replacement, region, quota, and cost effects.
4. Package containers with minimal trusted bases, non-root execution, explicit health behavior, bounded resources, deterministic builds, vulnerability and license checks, and signed or attestable artifacts when supported.
5. Build staged delivery gates for tests, static analysis, security scanning, contract compatibility, migration safety, infrastructure validation, deployment health, and promotion. Bind each plan/approval/apply to the same immutable artifact identity and digest. Revalidate the plan digest, source revision, target, and approval immediately before apply; any drift, regenerated plan, or changed artifact invalidates prior approval and requires a new review. Record the applied digest and observed result. A passing pipeline is evidence only for the gates it actually ran; where the platform cannot enforce digest binding, disclose that residual control gap.
6. Design database and state changes for compatibility and recovery. Separate expand, migrate, verify, and contract when zero-downtime or rollback constraints require it; never assume application rollback reverses data mutation.
7. Add actionable telemetry: health, logs, metrics, traces, SLO or outcome signals, deployment markers, alert ownership, and runbooks. AIOps or automated remediation must be bounded, auditable, reversible, and human-governed for consequential actions.
8. For MLOps and agentic delivery, version data, prompts, models, evaluations, policies, and deployment configuration; enforce offline and online quality/safety gates and monitor drift without claiming causality from alerts alone.
9. Validate in the safest representative environment allowed. Record exact plans, artifacts, scans, deployments, smoke tests, recovery tests, and exclusions. Production deployment and release remain separately authorized.

## Output and Checks

Return changed automation artifacts, build provenance, IaC/container validation, pipeline gates, security findings, migration/recovery strategy, telemetry/runbooks, environment evidence, residual risks, and required approvals. Never fabricate cloud access, deployment, scans, rollback tests, or operational health.