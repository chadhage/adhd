---
name: fullstack-azure-warp-ado-import
description: "Import Well-Architected assessment recommendations into Azure DevOps as Epics and Features or Issues using WARP PnP-DevOps. Use only with explicit authorization for the target project and work-item writes."
argument-hint: "Provide the approved assessment CSV, exact Azure DevOps project URI, work-item process/type, assessment tag, secure token source, sandbox, and confirmation of planned writes."
---

# WARP Azure DevOps Import

## When to Use
- Convert an authorized assessment export into linked Azure DevOps Epics and work items.
- Plan a controlled import of recommendations into an approved non-production project.

## Procedure
1. Read the current [PnP-DevOps script](https://github.com/Azure/WellArchitected-Tools/blob/cd7e629b230e78fd556170dd11265175b358d239/WARP/PnP-DevOps.ps1) and [WARP import documentation](https://github.com/Azure/WellArchitected-Tools/blob/cd7e629b230e78fd556170dd11265175b358d239/WARP/devops/README.md). Confirm the script revision, parameters, API version, work-item behavior, and duplicate-detection limits.
2. Require explicit authorization for the exact organization/project, assessment, tag, item type, and write operation. Prefer a new or empty test project. Do not infer permission from repository access or assessment ownership.
3. Validate the CSV schema, workload identity, recommendation count, category mappings, and intended item type (`Feature` or `Issue`) against the target project's process. Preview the planned Epics, titles, tags, and item count before writes.
4. Obtain a narrowly scoped, short-lived PAT from an approved secret store or secure environment variable. Never ask for, print, persist, or embed a token in chat, command history, a skill, or report. Do not proceed if the approved token scope is broader than necessary.
5. Verify the target URI and account immediately before the run. Use the script's confirmation prompt only after independently checking the preview; stop if the target, count, or payload differs. Expect network reads and creation of Epics and work items.
6. Verify created items and hierarchy links in the target project, check for duplicates and failed/partial writes, and preserve a sanitized import record. Reconcile partial results before any retry.

## Safety and Limits
This is a write-capable integration, not a read-only assessment. Never import to production or a shared backlog without the work-item owner's explicit approval. The upstream tool's duplicate checks are not a guarantee of idempotency; do not blindly rerun after timeout or partial failure. Follow [Artifact Storage and Engagement Contracts](../artifact-storage-and-engagement-contracts/SKILL.md) for assessment data and evidence handling.

## Source Basis
- [PnP-DevOps.ps1](https://github.com/Azure/WellArchitected-Tools/blob/cd7e629b230e78fd556170dd11265175b358d239/WARP/PnP-DevOps.ps1)
- [WARP DevOps import documentation](https://github.com/Azure/WellArchitected-Tools/blob/cd7e629b230e78fd556170dd11265175b358d239/WARP/devops/README.md)
- [Upstream MIT license](https://github.com/Azure/WellArchitected-Tools/blob/cd7e629b230e78fd556170dd11265175b358d239/LICENSE)
