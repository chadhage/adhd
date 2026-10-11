---
name: fullstack-metasploit
description: "Use Metasploit for authorized vulnerability validation and penetration testing in an explicitly scoped lab or test environment. Prefer safe checks and minimal proofs over exploitation."
argument-hint: "Provide target allowlist, rules of engagement, environment, approved module classes, time window, and stop conditions."
---

# Metasploit Assessment

## When to Use
- Validate a specific vulnerability hypothesis against an authorized test asset.
- Reproduce a finding in a disposable lab to confirm remediation or a regression.

## Procedure
1. Confirm the target, resolved address, ports, environment, approved modules, time window, request limits, and monitoring contact. Verify that no redirect or pivot leaves scope.
2. Record the framework version, module path, target build, and test preconditions. Read the module documentation and inspect its `check` capability before considering any test action.
3. Prefer version/configuration checks and non-invasive validation. If a proof requires exploitation, require explicit approval for that exact module and use a disposable environment with synthetic data.
4. Use the smallest proof that demonstrates the control failure. Capture sanitized commands, output, timestamps, and expected-versus-observed behavior.
5. Stop on instability, unexpected routing, sensitive data, or scope drift. Remove only test-created artifacts under the approved cleanup plan, then report coverage and remediation criteria.

## Boundaries
Do not use payloads, shells, post-exploitation modules, persistence, credential harvesting, lateral movement, stealth, or destructive modules unless a separately approved controlled exercise explicitly authorizes that exact activity. A module's availability is not authorization.
