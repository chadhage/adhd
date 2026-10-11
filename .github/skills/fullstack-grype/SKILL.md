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
2. Record Grype version, vulnerability database build/update time, source type, and scan command. Use a trusted, current database and preserve machine-readable output where policy permits.
3. Triage matches against package versions, distro metadata, fixed versions, and the actual shipped artifact. Determine whether the affected component is present and reachable; do not equate a CVE match with exploitability.
4. Prioritize by severity, exposure, fix availability, and local policy. Recommend a minimal dependency/base-image update, then rebuild and rescan the resulting digest.
5. Report scan scope, database freshness, ignored rules and rationale, confirmed findings, fixes, and residual risks. Redact private registry details and secrets.

## Boundaries
Do not suppress findings merely to obtain a clean result. Keep ignore rules reviewed, scoped, and time-bounded; do not claim a clean scan proves the artifact is secure.
