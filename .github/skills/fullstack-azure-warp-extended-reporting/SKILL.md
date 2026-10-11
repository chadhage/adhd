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
4. Inspect the script's cleanup and output logic before execution. This variant may remove an existing same-named output and its cleanup logic may terminate PowerPoint processes; use a dedicated disposable Windows session with no unrelated PowerPoint documents open. Do not proceed if process cleanup or output replacement cannot be safely constrained.
5. Confirm report thresholds and `-ShowTop` against stakeholder requirements. Execute only on the copied inputs and templates; keep network access unnecessary for report generation disabled where practical.
6. Review the presentation and intermediate CSV for correct mode, scope, scores, recommendations, descriptions, and hyperlinks. Check for empty or malformed categories and unintended omissions. Record the script revision and any manual edits in the report handoff.

## Safety and Limits
Assessment exports can contain sensitive workload details. Do not upload them to third parties or include credentials in parameters. The script's generated severity groupings and summary are not a substitute for engineering judgment or owner acceptance.

## Source Basis
- [DevOps WARP report generator](https://github.com/Azure/WellArchitected-Tools/blob/cd7e629b230e78fd556170dd11265175b358d239/WARP/devops/GenerateAssessmentReport.ps1)
- [DevOps WARP documentation](https://github.com/Azure/WellArchitected-Tools/blob/cd7e629b230e78fd556170dd11265175b358d239/WARP/devops/README.md)
- [Upstream MIT license](https://github.com/Azure/WellArchitected-Tools/blob/cd7e629b230e78fd556170dd11265175b358d239/LICENSE)
