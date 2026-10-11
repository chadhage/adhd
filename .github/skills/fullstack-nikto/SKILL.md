---
name: fullstack-nikto
description: "Use Nikto for authorized, non-destructive web-server exposure checks against owned test targets, followed by manual verification and remediation guidance."
argument-hint: "Provide the exact test URL/host, approved paths and ports, request limits, environment, and test window."
---

# Nikto Web Server Assessment

## When to Use
- Review an owned web server for known unsafe files, server disclosures, or configuration issues.
- Check whether a specific hardening change removed a verified exposure.

## Procedure
1. Confirm the exact origin, redirects, ports, paths, environment, request budget, and test window. Use staging where possible and synthetic data only.
2. Check Nikto version and options. Restrict the target and plugins/tests to those approved; estimate request volume and coordinate with the service owner.
3. Run one bounded assessment and retain sanitized output. Stop if the target redirects out of scope, shows instability, or returns sensitive data.
4. Manually verify important findings without retrieving private content. Separate version banners from confirmed vulnerable components and account for proxy/CDN behavior.
5. Recommend configuration or patch fixes, then repeat the focused check and report exact coverage, tool version, exclusions, and unresolved items.

## Boundaries
Do not use evasion modes, authentication guessing, destructive checks, or broad host lists. Do not treat a banner match as proof of exploitability.
