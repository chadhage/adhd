---
name: fullstack-google-cloud-well-architected-skills
description: "Derive individual fullstack-* skills from the current Google Cloud Well-Architected Framework pillars and cross-pillar perspectives, then register them with Fullstacker. Use to create or refresh Google Cloud architecture guidance skills from official documentation."
argument-hint: "Provide the requested documentation snapshot/date, whether to include every current cross-pillar perspective, and any Google Cloud project, billing, security, or production-change boundaries."
---

# Google Cloud Well-Architected Skill Extraction

## Outcome

Create source-grounded, individually discoverable Fullstacker skills from the official Google Cloud Well-Architected Framework. Use the `fullstack-*` naming convention and register each generated skill with Fullstacker. The framework is design guidance, not authorization to change a Google Cloud environment.

## When to Use
- Create individual Fullstacker skills from Google Cloud Well-Architected pillars or cross-pillar perspectives.
- Refresh existing Google Cloud Well-Architected skills after official documentation changes.
- Reconcile framework coverage against the current official pillar and perspective catalog.

## Procedure

1. **Pin the source snapshot.** Record the access date and canonical `docs.cloud.google.com` URLs. Check the framework's last-reviewed date, printable overview, and What's New page. Google documentation is continuously updated and is not tied to a Git commit; never state an unverified snapshot or revision.

2. **Inventory the framework.** Start from the [framework overview](https://docs.cloud.google.com/architecture/framework) and its [printable all-pillars view](https://docs.cloud.google.com/architecture/framework/printable). Enumerate all current pillars and all current cross-pillar perspectives from the official page, following their canonical links. As observed on 2026-10-11, the overview lists six pillars: Operational Excellence, Security, Privacy, and Compliance, Reliability, Cost Optimization, Performance Optimization, and Sustainability; it also lists AI and ML and Financial Services perspectives. Recheck rather than assuming this inventory remains complete.

3. **Choose one skill unit per framework view.** Create one skill for each distinct pillar and each distinct cross-pillar perspective. Keep shared core principles as common decision guidance in the extraction process and relevant pillar skills; do not create duplicate skills for repeated principles. If a perspective or official page contains independently actionable sub-guides whose separation materially improves discovery, split only those units and explain the mapping. Do not create skills for navigation, printable wrappers, marketing pages, release notes, or linked product documentation alone.

4. **Read each official page in full.** Extract its objectives, principles, recommendations, decision criteria, trade-offs, anti-patterns, operational practices, and verification signals. Follow linked Google Cloud documentation where required to establish implementation details and current product constraints. The Well-Architected Framework is the design recommendation source; Google Cloud product documentation is the implementation/configuration source of truth.

5. **Write focused, original procedures.** Each generated skill should state its workload scope, when to use it, decision sequence, relevant Google Cloud controls/services, options and trade-offs, required owner approvals, safe validation steps, and empirical completion evidence. Adapt recommendations to the authorized card, architecture, region, service availability, compliance constraints, and cost envelope; do not turn recommendations into universal mandates.

6. **Honor safety and authority.** Before suggesting or performing resource, IAM, network, data, billing, or production changes, verify the human's authority, project/environment, approved scope, least-privilege identity, cost impact, rollback/cleanup, and required approvals. Do not request or persist credentials. Use plan/preview and non-production validation where applicable. A framework recommendation does not authorize deployment or release.

7. **Preserve source attribution without copying.** Google Cloud documentation content is generally under CC BY 4.0 unless a page says otherwise; code samples are generally Apache 2.0. Verify the current page-level notice. Summarize in original language, avoid copying substantial source text, and cite the relevant official pages in each skill. If reproducing material, follow its applicable license and attribution requirements.

8. **Create and register each skill.** Create `.github/skills/fullstack-google-cloud-<pillar-or-perspective-slug>/SKILL.md`. The folder and frontmatter `name` must match and use lowercase kebab case. Include a keyword-rich description under 1024 characters, argument hint, focused procedures, source basis, safety boundaries, and completion checks. Keep each skill under 500 lines. Add one row per generated skill to the existing `Reusable Skills` table in `.github/agents/fullstacker.agent.md`, with a concise use description and relative link to `../skills/<name>/SKILL.md`. Preserve existing rows and selective-loading guidance.

9. **Validate coverage and quality.** Build a matrix of current pillars/perspectives to generated skill names. Confirm every current entry is covered exactly once, with newly added, retired, renamed, or merged entries recorded. Check frontmatter, folder/name equality, description length, links, citations, absence of copied passages, and Fullstacker registrations. Report source access date, catalog count, generated skill count, coverage exceptions, validation results, and unresolved questions.

## Source Map

- [Google Cloud Well-Architected Framework overview](https://docs.cloud.google.com/architecture/framework)
- [Printable framework view](https://docs.cloud.google.com/architecture/framework/printable)
- [What's new](https://docs.cloud.google.com/architecture/framework/whats-new)
- [Google Cloud documentation](https://docs.cloud.google.com/)
- [Google Developers Site Policies and licensing](https://developers.google.com/site-policies)

## Example Prompts

- "Use Fullstacker to create one skill for each current Google Cloud Well-Architected pillar and perspective."
- "Refresh the Google Cloud Well-Architected skills from the current official docs and report any new or retired perspectives."
- "Use the Google Cloud Reliability skill to evaluate this authorized design; do not change cloud resources."
