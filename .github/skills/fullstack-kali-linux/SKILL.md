---
name: fullstack-kali-linux
description: "Use Kali Linux as a controlled environment for authorized security assessment, lab exercises, and forensic workflows; select tools by scope and minimize host and network risk."
argument-hint: "Provide the assessment objective, authorized targets, Kali version/image, isolation model, permitted tools, and data-handling constraints."
---

# Kali Linux Assessment Environment

## When to Use
- Prepare a disposable environment for an authorized security assessment or training lab.
- Select and operate a Kali-provided tool under documented rules of engagement.

## Procedure
1. Define the assessment objective and authorization before booting tools. Name exact targets, allowed techniques, time window, data rules, and stop contact.
2. Obtain the distribution from its official source and verify published integrity/authenticity data where available. Record image, release, and tool versions.
3. Use an isolated VM or dedicated lab network with snapshots, least-privilege access, and synthetic data. Disable shared folders, bridged networking, or host integration unless needed and approved.
4. Install or update packages only under the environment's change policy. Pin the assessment baseline and record tool versions so results are reproducible.
5. Run only the tools and tests allowed by scope. Store evidence outside the image in approved protected storage; sanitize captures and reports before sharing.
6. Revert or rebuild the disposable environment after the exercise, preserve required audit evidence, and report coverage, limitations, and cleanup status.

## Boundaries
Kali's included tools do not grant permission to scan, exploit, intercept, or access any system. Do not use the environment for stealth, persistence, credential theft, destructive testing, or out-of-scope activity.
