---
name: fullstack-nessus
description: "Use Nessus to plan, run, and triage authorized vulnerability scans on owned assets, then verify findings and produce remediation evidence."
argument-hint: "Provide approved targets, scan window, scan intensity, credential approval, exclusions, and report destination."
---

# Nessus Vulnerability Assessment

## When to Use
- Inventory vulnerabilities on explicitly authorized hosts or applications.
- Compare scan evidence before and after a patch or configuration change.

## Procedure
1. Confirm the exact target list, ownership, scan window, exclusions, permitted plugins, concurrency, credential use, and monitoring/stop contact.
2. Select a named scan template proportionate to the environment. Export/save its exact versioned configuration, target allowlist, enabled plugin IDs/families, exclusions, credential mode, and rate settings for review before execution. Start only with owner-approved checks; coordinate authenticated checks with the system owner and use a least-privilege, purpose-limited identity.
3. Configure hard rate/concurrency and runtime limits appropriate to the service, plus monitoring thresholds and an operational stop contact. Review the resolved targets and exported scan profile before launch; disable destructive, denial-of-service, brute-force, or unapproved plugins rather than relying on a generic safe-check label.
4. Record scanner, plugin-feed version/build date, policy/configuration digest, enabled plugins, and target versions. Treat results as leads: verify affected versions, configuration, reachability, and compensating controls. If required feeds or configuration provenance are unavailable, report coverage as incomplete, not a clean result.
5. Prioritize confirmed, actionable issues; redact secrets and personal data from exports. Retest fixes with the same relevant checks and document exclusions and residual risk.

## Boundaries
Never scan addresses merely because they are reachable. Do not export credentials or unredacted findings to unapproved locations, and do not equate a clean scan with proof of security.
