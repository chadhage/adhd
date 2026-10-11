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
2. Select a scan template proportionate to the environment. Start with discovery or safe checks; coordinate authenticated checks with the system owner and use a least-privilege, purpose-limited identity.
3. Configure rate and performance limits appropriate to the service. Review the target resolution and scan settings before launch; avoid denial-of-service and destructive checks.
4. Record scanner, plugin-feed, policy, and target versions. Treat results as leads: verify affected versions, configuration, reachability, and compensating controls.
5. Prioritize confirmed, actionable issues; redact secrets and personal data from exports. Retest fixes with the same relevant checks and document exclusions and residual risk.

## Boundaries
Never scan addresses merely because they are reachable. Do not export credentials or unredacted findings to unapproved locations, and do not equate a clean scan with proof of security.
