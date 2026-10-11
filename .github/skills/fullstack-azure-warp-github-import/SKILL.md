---
name: fullstack-azure-warp-github-import
description: "Import Well-Architected assessment recommendations into an authorized GitHub repository as milestones and issues using WARP PnP-Github. Requires explicit approval for repository writes."
argument-hint: "Provide the approved CSV, exact GitHub owner/repository, assessment label, secure token source, test-repository status, and approved issue/milestone count."
---

# WARP GitHub Import

## When to Use
- Turn a scoped assessment CSV into GitHub milestones and issues.
- Validate the integration in a dedicated test repository before considering a production repository.

## Procedure
1. Read the current [PnP-Github script](https://github.com/Azure/WellArchitected-Tools/blob/cd7e629b230e78fd556170dd11265175b358d239/WARP/PnP-Github.ps1) and [WARP import documentation](https://github.com/Azure/WellArchitected-Tools/blob/cd7e629b230e78fd556170dd11265175b358d239/WARP/devops/README.md). Verify current API behavior, parameters, label and milestone mapping, rate-limit handling, and duplicate checks.
2. Require explicit authorization for the exact owner/repository and creation of milestones and issues. Use a new or empty test repository first; confirm the CSV covers one intended workload and contains no unrelated or sensitive data.
3. Validate the assessment CSV schema, issue titles, bodies, category mappings, tag truncation, milestone count, and total proposed issues. Present the expected writes before execution.
4. Retrieve a least-privilege short-lived token from an approved secret store. Never request or expose the PAT in chat, logs, commands, or files. Verify repository write scope and target URI immediately before execution.
5. Proceed only after explicit confirmation of the preview. Expect API reads and writes, rate-limit delays, milestone creation, and issue creation. Stop on unexpected repository context, rate-limit errors, partial failures, or changed counts.
6. Verify milestones and issues in GitHub, check for duplicates or missing links, and document partial results before retrying. Store only sanitized evidence in the approved location.

## Safety and Limits
This workflow creates durable remote records. Do not run against an unapproved or production repository. Duplicate matching is limited and is not a guarantee of idempotency; never rerun after a partial result without reconciling existing issues and milestones. Apply the workspace's artifact-storage and data-handling rules to exports and reports.

## Source Basis
- [PnP-Github.ps1](https://github.com/Azure/WellArchitected-Tools/blob/cd7e629b230e78fd556170dd11265175b358d239/WARP/PnP-Github.ps1)
- [WARP GitHub import documentation](https://github.com/Azure/WellArchitected-Tools/blob/cd7e629b230e78fd556170dd11265175b358d239/WARP/devops/README.md)
- [Upstream MIT license](https://github.com/Azure/WellArchitected-Tools/blob/cd7e629b230e78fd556170dd11265175b358d239/LICENSE)
