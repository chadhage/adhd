---
name: fullstack-openvas
description: "Use OpenVAS/Greenbone Vulnerability Management to conduct authorized, rate-limited vulnerability assessments and triage findings with reproducible evidence."
argument-hint: "Provide the approved target list, scan configuration, schedule, credentials policy, rate limits, and report storage rules."
---

# OpenVAS Vulnerability Assessment

## When to Use
- Assess owned hosts for known vulnerabilities and unsafe exposure.
- Validate whether a targeted remediation changed the scanner's evidence.

## Procedure
1. Confirm target ownership, exact IPs/ranges, exclusions, scan window, credential approval, concurrency, and a stop contact.
2. Check Greenbone/OpenVAS version and feed freshness. Create a target restricted to the approved allowlist and choose a conservative configuration appropriate to the service.
3. Review the scan configuration for potentially disruptive tests; use authenticated checks only with explicit approval and least privilege. Preview target resolution before starting.
4. Preserve the report and task metadata in an approved location. Verify each important result using version/configuration evidence or a safe targeted check; record confidence and false-positive rationale.
5. Recommend root-cause remediation and retest the affected checks after change. State feed age, scan coverage, exclusions, and limitations.

## Boundaries
Do not scan public or third-party systems without explicit authorization. Avoid destructive, brute-force, and denial-of-service tests. Do not expose raw reports containing sensitive data to unapproved recipients.
