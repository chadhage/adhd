---
name: fullstack-pentoo
description: "Use Pentoo as an isolated environment for authorized security assessment and training, with explicit target scope, reproducible package state, and protected evidence handling."
argument-hint: "Provide the approved assessment scope, Pentoo image/version, isolation model, allowed tools, and evidence-retention policy."
---

# Pentoo Assessment Environment

## When to Use
- Conduct an authorized assessment or training exercise in a dedicated Pentoo environment.
- Reproduce a finding with a documented and controlled toolchain.

## Procedure
1. Confirm written authorization and enumerate targets, techniques, test window, rate limits, data boundaries, and stop contact.
2. Obtain Pentoo from its official distribution channel and verify integrity information where available. Record release, kernel, hardware, and assessment-tool versions.
3. Use an isolated, disposable VM or lab device with a restorable baseline and synthetic data. Restrict network routes to the approved range.
4. Review package provenance and local package-manager guidance before updates. Avoid changing tool versions during an assessment; capture the installed package state for reproducibility.
5. Use only approved tools and low-impact checks first. Keep reports, captures, and logs protected, sanitized, and stored per the asset owner's policy.
6. Restore the environment and report findings, evidence, limits, package baseline, and cleanup status.

## Boundaries
The distribution's security focus is not authorization. Do not target third-party systems, evade monitoring, harvest credentials, persist, or disrupt services without a distinct approved exercise explicitly covering that activity.
