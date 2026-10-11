---
name: fullstack-sqlmap
description: "Use sqlmap only for tightly scoped, authorized SQL injection validation on local, staging, or isolated lab applications; prioritize minimal non-extractive proofs and remediation."
argument-hint: "Provide the exact test endpoint and parameter, authorization, synthetic test data, request budget, environment, and stop conditions."
---

# SQLmap Injection Validation

## When to Use
- Confirm a specific SQL injection hypothesis in an owned application or training lab.
- Verify that a parameterized-query remediation prevents the original behavior.

## Procedure
1. Confirm explicit authorization for the exact URL, HTTP method, parameter, account, and test window. Use a disposable or staging environment with synthetic data; verify redirects and request routing remain in scope.
2. Review the request for tokens, personal data, and state-changing actions. Prepare a baseline request and a request limit; use a test identity with minimal permissions.
3. Prefer a manual regression test or the lowest-impact sqlmap detection options. Limit tests to the named parameter and conservative detection settings; monitor request volume and application health.
4. Stop after confirming or rejecting the injection hypothesis. Preserve only sanitized request/response evidence and relevant logs; do not enumerate databases or retrieve records.
5. Recommend parameterized queries and safe error handling. Retest the original input and negative controls, and report tool/version, environment, request bounds, and remaining uncertainty.

## Boundaries
Do not use database enumeration or dumping, OS or SQL shells, file read/write, stacked-query execution, tamper/evasion options, or tests against production or third-party targets. Never use discovered data or credentials. Tool flags do not substitute for authorization.
