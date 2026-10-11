---
name: fullstack-azure-waf-go-live-report
description: "Generate and review a PowerPoint executive summary from a Microsoft Azure Well-Architected Go-Live assessment CSV using WARP GenerateWAFReport.ps1."
argument-hint: "Provide the approved Go-Live assessment CSV, copied template and category descriptions, isolated PowerPoint environment, and output location."
---

# WAF Go-Live Executive Report

## When to Use
- Summarize an authorized Well-Architected Go-Live assessment in an executive PowerPoint deck.
- Prepare a draft report for technical and workload-owner review.

## Procedure
1. Read the current [GenerateWAFReport.ps1 source](https://github.com/Azure/WellArchitected-Tools/blob/cd7e629b230e78fd556170dd11265175b358d239/WARP/Go-Live/GenerateWAFReport.ps1) and its [README](https://github.com/Azure/WellArchitected-Tools/blob/cd7e629b230e78fd556170dd11265175b358d239/WARP/Go-Live/README.md). Confirm PowerShell 7.3+, desktop PowerPoint/COM availability, required files, and the exact input/output parameters.
2. Verify the CSV came from the intended Go-Live assessment and is approved for local processing. Use a dedicated working directory with copies of the CSV, `PnP_PowerPointReport_Template.pptx`, and `WAF Category Descriptions.csv`.
3. Preserve source files and existing reports. Check output naming for collisions and ensure no unrelated PowerPoint work is open before using COM automation.
4. Run the generator against the copied assessment. Do not alter the source CSV or original presentation template.
5. Review the deck for expected overall and pillar scores, ratings, recommendation links, and correct assessment context. Add workload-specific context only from approved evidence and clearly mark any manual interpretation.
6. Save the reviewed report to the owner's approved protected location and record script revision, source assessment, output, and any manual edits.

## Safety and Limits
Assessment reports may disclose architecture, risk, or business context. Do not upload them to unapproved services or distribute the generated deck without owner authorization. The report is a summary artifact; it does not certify go-live readiness or authorize deployment.

## Source Basis
- [Go-Live report generator](https://github.com/Azure/WellArchitected-Tools/blob/cd7e629b230e78fd556170dd11265175b358d239/WARP/Go-Live/GenerateWAFReport.ps1)
- [Go-Live report instructions](https://github.com/Azure/WellArchitected-Tools/blob/cd7e629b230e78fd556170dd11265175b358d239/WARP/Go-Live/README.md)
- [Go-Live tool license](https://github.com/Azure/WellArchitected-Tools/blob/cd7e629b230e78fd556170dd11265175b358d239/WARP/Go-Live/LICENSE.md)
