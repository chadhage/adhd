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
6. Before writes, create a durable import ledger in the approved workspace: source assessment digest, target organization/project, script revision, mapping version, stable source recommendation IDs, planned item types/parent links, and per-record status. Record each returned remote work-item ID against its stable source ID as writes succeed. Verify created items and hierarchy links against the ledger. After timeout or partial failure, query and reconcile every planned source ID against existing remote items before resuming; continue only missing writes, and treat ambiguous matches as a stop for owner review. Never blindly replay a batch or infer successful writes from a command exit code.

## Safety and Limits
This is a write-capable integration, not a read-only assessment. Never import to production or a shared backlog without the work-item owner's explicit approval. The upstream tool's duplicate checks are not a guarantee of idempotency. The ledger makes recovery auditable but does not make the remote API transactional; if stable source identity cannot be preserved or remote records cannot be reconciled unambiguously, stop rather than retry. Follow [Artifact Storage and Engagement Contracts](../artifact-storage-and-engagement-contracts/SKILL.md) for assessment data and evidence handling.

## Source Basis
- [PnP-DevOps.ps1](https://github.com/Azure/WellArchitected-Tools/blob/cd7e629b230e78fd556170dd11265175b358d239/WARP/PnP-DevOps.ps1)
- [WARP DevOps import documentation](https://github.com/Azure/WellArchitected-Tools/blob/cd7e629b230e78fd556170dd11265175b358d239/WARP/devops/README.md)
- [Upstream MIT license](https://github.com/Azure/WellArchitected-Tools/blob/cd7e629b230e78fd556170dd11265175b358d239/LICENSE)
