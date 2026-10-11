---
name: fullstack-azure-warr-report
description: "Generate and review a Well-Architected Reliability Review executive PowerPoint report for Azure VMware Solution (AVS) or Azure Virtual Desktop (AVD) assessment exports."
argument-hint: "Provide the authorized AVS/AVD assessment CSV, assessment type, approved presenter name, copied template, and protected output destination."
---

# Well-Architected Reliability Review Reporting

## When to Use
- Produce an executive summary deck from an AVS or AVD Well-Architected assessment CSV.
- Review reliability findings and priorities with the authorized workload team.

## Procedure
1. Inspect the current [GenerateWARRReport.ps1 source](https://github.com/Azure/WellArchitected-Tools/blob/cd7e629b230e78fd556170dd11265175b358d239/WARR/GenerateWARRReport.ps1) and template. Confirm PowerShell and PowerPoint requirements, parameter names, template path, and expected assessment CSV format.
2. Verify the report is for one authorized AVS or AVD workload. Set `-AssessmentType` to exactly `AVS` or `AVD`; provide `-AssessmentReport` and `-YourName` only when the approved deck requires presenter attribution.
3. Use copies of the CSV and `WARR_PowerPoint_Template.pptx` in an isolated working directory. Keep the originals unchanged and ensure the destination does not overwrite a prior report.
4. Run the generator through PowerShell 7+ with desktop PowerPoint available. Capture errors and warnings without exposing assessment data in shared logs.
5. Review overall scores, design-area ratings, recommendation priorities, links, presenter name, and assessment type. Confirm recommendations match the source CSV; correct presentation issues without changing the underlying assessment findings.
6. Store the final deck only in the approved protected location and record source revision, input file, report type, validation, and manual edits.

## Safety and Limits
The CSV and deck may contain sensitive workload details and named-person information. Minimize attribution, redact where policy requires, and do not share outside the authorized audience. A generated report is not a reliability certification or approval to release.

## Source Basis
- [WARR report generator](https://github.com/Azure/WellArchitected-Tools/blob/cd7e629b230e78fd556170dd11265175b358d239/WARR/GenerateWARRReport.ps1)
- [WARR PowerPoint template](https://github.com/Azure/WellArchitected-Tools/blob/cd7e629b230e78fd556170dd11265175b358d239/WARR/WARR_PowerPoint_Template.pptx)
- [Upstream MIT license](https://github.com/Azure/WellArchitected-Tools/blob/cd7e629b230e78fd556170dd11265175b358d239/LICENSE)
