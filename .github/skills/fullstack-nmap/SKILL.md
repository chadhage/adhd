---
name: fullstack-nmap
description: "Use Nmap for authorized network inventory, service discovery, and bounded exposure validation. Keep scans limited to an explicit host and port allowlist."
argument-hint: "Provide the authorized CIDRs/hosts, port range, scan window, rate limits, and permitted probe types."
---

# Nmap Network Assessment

## When to Use
- Inventory hosts and listening services on an owned network.
- Check whether a documented exposure or firewall change is present.

## Procedure
1. Confirm the exact network/host allowlist, permitted ports, scan window, rate limits, and operational contact. Resolve names and validate every destination against the allowlist.
2. Begin with a bounded discovery check. For example, `nmap -sn -oA inventory <authorized-cidr>` performs host discovery without a port scan; confirm the chosen probes are allowed on the network.
3. For approved hosts, use a narrow port list and conservative service detection. Save normal output with `-oA` in an access-controlled location and note Nmap version and scan options.
4. Use NSE scripts only when their behavior is understood and explicitly permitted. Review script documentation first; do not use intrusive, brute-force, exploit, or denial-of-service scripts.
5. Validate unexpected services with the owner, compare findings to intended network policy, and report false-positive checks, scan coverage, and remediation verification.

## Boundaries
Do not use decoys, spoofing, evasion, aggressive timing, or broad Internet ranges. A scan result is an observation at a point in time, not authorization to probe further.
