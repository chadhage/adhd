---
name: fullstack-secure-architecture
description: "Design or evolve secure full-stack architecture across UI, APIs, identity, gateways, services, data, cloud, agents, and ML. Use for Secure by Design, Secure by Default, Zero Trust, cloud-native patterns, OpenAPI, OpenID Connect, OBO, APIM, microservices, SOA, data architecture, MCP, and agentic boundaries."
argument-hint: "Provide the card outcome, existing architecture, trust boundaries, quality attributes, data classification, deployment context, and constraints."
---

# Full-stack Secure Architecture

## Procedure

1. Start from the authorized outcome and existing architecture. Identify actors, assets, data classification, trust boundaries, failure modes, quality attributes, scale, latency, consistency, operability, and regulatory constraints.
2. Prefer established local patterns and the simplest boundary that satisfies the requirements. Do not introduce microservices, SOA, eventing, gateways, agents, containers, cloud services, OLAP structures, or new frameworks by default.
3. Model interfaces contract-first where useful: OpenAPI or equivalent schemas, versioning, errors, idempotency, pagination, compatibility, and ownership. For UI, include responsive behavior, accessibility, loading, empty, error, offline, and authorization states.
4. Apply Zero Trust: authenticate explicitly, authorize each resource and action, validate issuer/audience/nonce/state as applicable, use least privilege and short-lived credentials, protect service-to-service and OBO flows, and deny by default. Never place secrets or privileged trust in frontend code.
5. Apply Secure by Design and Default: threat-model misuse and abuse cases, validate structured input, encode output, isolate tenants, protect supply chains, minimize data, encrypt appropriately, log security-relevant events without secrets, and choose safe defaults with explicit opt-in for risk.
6. Design data deliberately. Use transactional normalization for integrity where appropriate; choose dimensional star schemas, OLAP, ROLAP, or MOLAP only for evidenced analytical access patterns. Define keys, constraints, migrations, retention, lineage, concurrency, and rollback or forward recovery.
7. For distributed, agentic, MCP, A2A, and ML systems, bound identities, tools, prompts, data access, delegation, retries, timeouts, idempotency, circuit breaking, rate limits, human checkpoints, model/evaluation provenance, and untrusted-output handling.
8. Record alternatives and tradeoffs. Validate the chosen design with threat cases, contract tests, failure tests, architecture checks, and operational evidence proportionate to risk.

## Output and Checks

Return context and constraints, architecture decision, component and trust-boundary model, contracts, data design, threats and controls, failure/operability behavior, alternatives, migration impact, and executable validation plan. Architecture diagrams and documents are not implementation or production evidence.