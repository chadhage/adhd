---
name: fullstack-azure-warp-extended-reporting
description: "Use the WARP devops GenerateAssessmentReport variant to create reports for WAF, Cloud Adoption Security, DevOps Capability, or GenAI assessment exports. Review variant-specific PowerShell and PowerPoint side effects before running."
argument-hint: "Provide the exact CSV, intended assessment mode, isolated Windows session, template copies, output destination, and review criteria."
---

# WARP Extended Assessment Reporting

## When to Use
- Generate a report from the newer `WARP/devops/GenerateAssessmentReport.ps1` variant.
- Handle GenAI assessment reporting or a report format not supported by the root WARP script.

## Procedure
1. Read the pinned [devops report generator](https://github.com/Azure/WellArchitected-Tools/blob/cd7e629b230e78fd556170dd11265175b358d239/WARP/devops/GenerateAssessmentReport.ps1), its [README](https://github.com/Azure/WellArchitected-Tools/blob/cd7e629b230e78fd556170dd11265175b358d239/WARP/devops/README.md), and the exact template/description files it expects. Record source revision and verify compatibility before use.
2. Confirm an authorized CSV export and identify the intended mode: WAF, Cloud Adoption Security Assessment, DevOps Capability Review, or GenAI. Use only one explicit switch (`-CloudAdoption`, `-DevOpsCapability`, or `-GenAI`) when auto-detection is uncertain.
3. Work on copies of the source CSV, PowerPoint templates, and category-description files in a disposable directory. Preserve an immutable source copy and confirm PowerShell 7 and desktop PowerPoint prerequisites.
4. Inspect the pinned script's exact process-selection, cleanup, and output-replacement logic before execution. A dedicated session alone does not prove cleanup is scoped safely: permit termination only for PowerPoint process IDs started by this report run and tracked by the wrapper. If the script can terminate pre-existing or untracked PowerPoint processes, do not run it unchanged; use an approved isolated disposable VM/session with no unrelated work and an owner-approved mitigation, or replace the cleanup path in a reviewed copy with process-ID-scoped cleanup. Write outputs to a unique new path; never delete or overwrite an existing report without explicit approval and a recoverable backup.
5. Confirm report thresholds and `-ShowTop` against stakeholder requirements. Execute only on the copied inputs and templates; keep network access unnecessary for report generation disabled where practical.
6. Parse the source CSV and reconcile workload identity, mode, recommendation/category IDs and counts, and documented inclusion/exclusion rules against the intermediate CSV and generated deck. Review scores, descriptions, hyperlinks, empty/malformed categories, and truncation. If outputs cannot prove source-to-report coverage, record that limitation rather than claiming completeness. Record the script revision and any manual edits in the report handoff.

## Safety and Limits
Assessment exports can contain sensitive workload details. Do not upload them to third parties or include credentials in parameters. The script's generated severity groupings and summary are not a substitute for engineering judgment or owner acceptance.

## Source Basis
- [DevOps WARP report generator](https://github.com/Azure/WellArchitected-Tools/blob/cd7e629b230e78fd556170dd11265175b358d239/WARP/devops/GenerateAssessmentReport.ps1)
- [DevOps WARP documentation](https://github.com/Azure/WellArchitected-Tools/blob/cd7e629b230e78fd556170dd11265175b358d239/WARP/devops/README.md)
- [Upstream MIT license](https://github.com/Azure/WellArchitected-Tools/blob/cd7e629b230e78fd556170dd11265175b358d239/LICENSE)
