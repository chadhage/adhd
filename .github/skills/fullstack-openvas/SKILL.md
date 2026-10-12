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
2. Check Greenbone/OpenVAS version and feed build/freshness against the owner-approved maximum age. Export the exact scan configuration, enabled NVT/plugin IDs or families, exclusions, target allowlist, credentials mode, and rate/concurrency settings for review; choose only tests explicitly approved for the service.
3. Review each enabled test family for potentially disruptive behavior and define hard request/concurrency/time limits, health thresholds, monitoring, and stop contact. Use authenticated checks only with explicit approval and least privilege. Preview resolved targets and verify the running task uses the reviewed configuration before starting; missing configuration/feed provenance means incomplete coverage, not a clean result.
4. Preserve the report and task metadata in an approved location. Verify each important result using version/configuration evidence or a safe targeted check; record confidence and false-positive rationale.
5. Recommend root-cause remediation and retest the affected checks after change. State feed age, scan coverage, exclusions, and limitations.

## Boundaries
Do not scan public or third-party systems without explicit authorization. Avoid destructive, brute-force, and denial-of-service tests. Do not expose raw reports containing sensitive data to unapproved recipients.
