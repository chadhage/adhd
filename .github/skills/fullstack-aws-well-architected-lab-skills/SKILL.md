---
name: fullstack-aws-well-architected-lab-skills
description: "Inventory awslabs/aws-well-architected-labs and derive one standalone fullstack-* agent skill for each in-scope, actionable Well-Architected lab or tool workflow, then register every generated skill with Fullstacker. Use to create or refresh AWS Well-Architected lab skill coverage."
argument-hint: "Provide the upstream repository/ref, whether migrated Workshop Studio content and individual dashboard entries are in scope, and any AWS account, cost, or test-environment boundaries."
---

# AWS Well-Architected Lab Skill Extraction

## Outcome

Produce a source-grounded set of individual workspace skills for current AWS Well-Architected Labs procedures, using the `fullstack-*` naming convention, and add a Fullstacker table entry for each skill. Do not turn an index, image, template, or redirect into a procedure skill.

## When to Use
- Create Fullstacker skills from the current `awslabs/aws-well-architected-labs` repository.
- Refresh existing skills after the upstream lab catalog changes or content migrates.
- Reconcile generated lab skills with Fullstacker's reusable-skills registry.

## Procedure

1. **Pin and inventory the source.** Query the repository's current default branch and commit. Walk `content/` and relevant code directories through the GitHub API or a local checkout; use bounded directory listings if a recursive tree is too large. Inventory Markdown entry pages, scripts, infrastructure templates, and their links. Do not assume a directory name implies current content.

2. **Classify actual workflows.** Read each candidate page and its linked source files. Classify it as one of:
   - A complete, locally documented, standalone lab.
   - A distinct tool workflow with its own inputs, outputs, and safety boundaries.
   - An index/catalog that points to other material.
   - Migrated, archived, empty, or redirect-only content.

   Create one skill per independently useful lab or tool workflow, not one per numbered section in a single lab. Treat a catalog's entries as separate skills only when the invoker explicitly includes them and each entry has enough current authoritative procedure to make a useful skill. Do not invent steps for a link-only page. Follow migrated material only within the authorized scope and use its current canonical source.

3. **Resolve the scope boundary.** The current upstream repository has a global redirect and includes migrated Workshop Studio destinations. Its remaining content includes a Cloud Intelligence Dashboards catalog, CFM TIPs and CUR Query Library links, a Well-Architected Tool workshop index, and a multi-part Dashbird partner lab. Ask one concise question if the request does not say whether migrated workshops or individual dashboard entries should become separate skills. While waiting, proceed only on clearly in-scope, locally documented procedures; do not represent catalog links as completed lab skill coverage.

4. **Check source, permission, and licensing.** Record each source path, commit, canonical external URL, and file-level license. Documentation in this repository may be under CC BY-SA 4.0, while code uses other licenses; verify the applicable notice instead of assuming one license covers everything. Write original summaries and procedures rather than copying pages or scripts. Include source attribution and required license references in each generated skill. Do not copy code, images, or large text passages into skills.

5. **Extract a safe, verifiable workflow.** For each in-scope lab, document its goal, prerequisites, ordered stages, expected observations, troubleshooting, teardown, and evidence. Identify AWS account/region assumptions, IAM changes, public endpoints, third-party integrations, destructive operations, resource costs, quotas, personal data, and test-load effects. Require an isolated non-production account, explicit target authorization, budget/cleanup plan, and owner approval before resource creation, external writes, or load generation. Never request or persist credentials; use placeholders and approved secret stores.

6. **Create individual skills.** Store each as `.github/skills/fullstack-<descriptive-slug>/SKILL.md`. The folder and frontmatter `name` must match and start with `fullstack-`. Use a keyword-rich description under 1024 characters, a concise argument hint, a clear trigger, step-by-step procedure, safety boundaries, source basis, and empirical completion checks. Keep each skill focused on one outcome and under 500 lines. Avoid reproducing upstream prose.

7. **Register skills with Fullstacker.** Add one row per generated skill to the existing `Reusable Skills` table in `.github/agents/fullstacker.agent.md`, with a brief task label and relative link to `../skills/<name>/SKILL.md`. Preserve existing entries and the rule to load only skills relevant to the current card.

8. **Validate coverage.** Check every in-scope source workflow is either mapped to exactly one skill or explicitly excluded with a reason. Verify folder/name match, valid frontmatter and descriptions, source attribution, all local Markdown links, and every Fullstacker link. Confirm no duplicate skill names or stale links remain. Report the source commit, included workflow count, exclusions/migrations, validations, and unresolved scope decisions.

## Current Source Notes

These are a starting point only; re-inventory upstream on every invocation:

- `content/Well-Architected-Partners/100_Labs/100_Automating_Serverless_Best_Practices_with_Dashbird/` contains a four-part lab: deploy a sample serverless application, connect Dashbird for Well-Architected insights, run a load test, and tear down.
- `content/Cloud-Intelligence-Dashboards/_index.md` is a catalog of dashboards whose current deployment procedures live in linked AWS documentation or Workshop Studio.
- `content/Cost-Optimization/CFM_TIPs/_index.md` points to the CFM TIPs Workshop Studio; `CUR_Queries/_index.md` says the CUR Query Library has moved to Workshop Studio.
- `content/Well-Architected-Tool/_index.md` links to Workshop Studio WAFR workshops rather than containing a complete procedure.
- The repository's current `rewrite.json` redirects site routes. A redirect is not evidence that its destination instructions were inspected or authorized for inclusion.

## AWS-Specific Stop Conditions

- No approved sandbox/account, region, cost limit, or teardown authority for a resource-provisioning lab.
- The lab requests broad IAM permissions, cross-account access, third-party access, or public exposure that has not been reviewed and explicitly approved.
- A load test would target production, an external service, or a shared endpoint without written owner approval and a bounded load plan.
- The source is migrated or stale and the canonical destination cannot be verified.

When blocked, report the exact missing permission or source. Do not run a lab merely to test or document it.

## Example Prompts

- "Use Fullstacker to inventory the current AWS Well-Architected Labs repo and create one skill per locally documented standalone lab."
- "Refresh the AWS Well-Architected skills from upstream main; include Workshop Studio migrations but not one skill per dashboard."
- "Create a separate Fullstacker skill for each Cloud Intelligence Dashboard using its current AWS deployment guide."

## Source Basis

- [AWS Well-Architected Labs](https://github.com/awslabs/aws-well-architected-labs)
- [Repository rewrite rules](https://github.com/awslabs/aws-well-architected-labs/blob/main/rewrite.json)
- [CC BY-SA documentation license](https://github.com/awslabs/aws-well-architected-labs/blob/main/LICENSE-CC-BY_SA.md)
- [AWS Well-Architected Tool Workshop](https://catalog.workshops.aws/well-architected-tool/)
- [AWS How to WAFR Workshop](https://catalog.workshops.aws/howto-wafr/en-US)
- [Cloud Intelligence Dashboards documentation](https://docs.aws.amazon.com/guidance/latest/cloud-intelligence-dashboards/getting-started.html)
