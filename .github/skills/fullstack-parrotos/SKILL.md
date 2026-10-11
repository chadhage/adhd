---
name: fullstack-parrotos
description: "Use ParrotOS in an isolated, authorized security-testing environment; verify the image, constrain tool activity to approved targets, and protect assessment data."
argument-hint: "Provide the authorized objective and targets, ParrotOS edition/release, isolation model, approved checks, and evidence rules."
---

# ParrotOS Assessment Environment

## When to Use
- Prepare a controlled environment for authorized security testing, forensics, or training.
- Run a selected assessment tool against an explicitly approved asset.

## Procedure
1. Establish written scope: exact assets, allowed techniques, time window, request limits, data handling, and operational stop contact.
2. Download ParrotOS from its official channel and verify integrity/authenticity information where available. Record edition, release, kernel, and tool versions.
3. Use a disposable VM or isolated lab network with snapshots, least privilege, and synthetic data. Keep routes restricted to approved targets.
4. Maintain a reproducible package baseline; apply updates according to the environment's change policy and record package/tool versions.
5. Run only the authorized assessment checks. Protect original captures and reports, redact sensitive evidence, and retain only what the owner approved.
6. Restore the baseline and report observed results, coverage gaps, toolchain versions, and cleanup status.

## Boundaries
ParrotOS and its bundled tools do not confer authorization. Do not use them for unauthorized scanning, exploitation, interception, evasion, credential access, persistence, or service disruption.
