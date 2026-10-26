---
name: fullstack-wireshark
description: "Use Wireshark to analyze packet captures lawfully obtained from owned systems or explicitly authorized network tests, with careful handling of sensitive traffic."
argument-hint: "Provide capture provenance, analysis question, protocol/time bounds, data classification, and approved report location."
---

# Wireshark Traffic Analysis

## When to Use
- Investigate a network issue or security alert using an authorized packet capture.
- Validate protocol behavior or exposure using a bounded lab capture.

## Procedure
1. Confirm capture provenance, permission, time range, interfaces, and retention rules. Do not capture or inspect third-party communications without authorization.
2. Record Wireshark/tshark version, capture filters used, clock assumptions, and file hash. Work on a copy and keep the original access-controlled.
3. Form a narrow analysis question and use display filters to isolate relevant traffic. For example, `dns` or `tcp.flags.syn == 1 && tcp.flags.ack == 0` can help inspect protocol events without implying maliciousness.
4. Correlate packet observations with endpoint, firewall, and application logs. Distinguish encrypted metadata from plaintext content and avoid conclusions unsupported by the capture.
5. Produce a sanitized derivative rather than modifying the evidentiary original. Remove or pseudonymize payloads, addresses, identifiers, and secrets using an approved tool; then reopen and inspect the derivative (including packet details and exported objects) for residual sensitive fields before sharing. Hash and retain the original only under the approved access/retention policy. Document time bounds, packet loss, capture/display filters, excluded interfaces, redaction method and reviewer, conclusions, and retention/deletion actions. If sanitization cannot be verified, do not share the derivative.

## Boundaries
Do not decrypt traffic without explicit key/data authorization. Never publish raw captures containing credentials, personal data, or unrelated communications; store them only in approved protected locations.
