---
name: fullstack-grype
description: "Use Grype to scan authorized container images, filesystems, or SBOMs for known vulnerabilities, then validate applicability and guide remediation."
argument-hint: "Provide the image digest, filesystem or SBOM source, registry permissions, vulnerability database freshness, and severity policy."
---

# Grype Vulnerability Scanning

## When to Use
- Check an owned image, source filesystem, or SBOM for known vulnerable components.
- Compare a rebuilt artifact against a prior scan after dependency remediation.

## Procedure
1. Identify the exact immutable image digest, filesystem revision, or SBOM and confirm permission to access it. Avoid sending private artifacts to external services unless approved.
2. Record Grype version, vulnerability database build/update time and digest, source type, scan command, and the approved maximum database age. Verify database provenance and freshness against that policy; if provenance cannot be verified or the database is stale, mark results incomplete and do not call them a clean/current scan.
3. For SBOM input, verify document schema, subject identity, generation source, and expected artifact digest; report package coverage limits and whether the SBOM is complete enough for the decision. Triage matches against package versions, distro metadata, fixed versions, and the actual shipped artifact. Determine whether the affected component is present and reachable; do not equate a CVE match with exploitability.
4. Prioritize by severity, exposure, fix availability, and local policy. Record the policy version, fail thresholds, tool exit status, exceptions, and whether each threshold passed. Recommend a minimal dependency/base-image update, then rebuild and rescan the resulting digest.
5. Report scan scope, database provenance/freshness, SBOM coverage, exit status and applied policy, ignored rules and rationale, confirmed findings, fixes, and residual risks. Redact private registry details and secrets.

## Boundaries
Do not suppress findings merely to obtain a clean result. Keep ignore rules reviewed, scoped, and time-bounded; do not claim a clean scan proves the artifact is secure.
