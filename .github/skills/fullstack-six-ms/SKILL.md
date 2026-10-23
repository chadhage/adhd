---
name: fullstack-six-ms
description: "Use 6Ms or Six Ms cause-category analysis to examine People, Machine, Method, Material, Measurement, and Environment for observed or potential failures, including software, agent, process, and infrastructure failures."
argument-hint: "Provide the failure/effect or risk, system boundary, evidence, and domain-specific terminology."
---

# 6Ms

Use six lenses to reduce blind spots in cause discovery. Categories organize
questions; they do not establish causes. Fullstacker is the primary user; authorized VOC or AssociateProductOwner
practitioners may also use it independently, to populate
[Ishikawa](../fullstack-ishikawa/SKILL.md), or within
[RootCauseAnalysis](../fullstack-root-cause-analysis/SKILL.md).

## Boundaries

Before persistence, follow [Artifact Storage and Engagement
Contracts](../artifact-storage-and-engagement-contracts/SKILL.md) and approved
product-owned storage guidance. Keep source IDs, provenance, collection time,
and access status; exclude secrets and unnecessary personal data. Analysis
does not authorize investigation outside scope, changes, or fault injection.

## Six lenses

| Traditional lens | Inclusive/domain interpretation | Example investigation prompts |
| --- | --- | --- |
| Manpower | People, roles, and agent responsibilities | Were ownership, capacity, information, handoffs, and decision rights adequate? |
| Machine | Tools, software, infrastructure, and equipment | Which versions, interfaces, dependencies, permissions, or resource limits mattered? |
| Method | Procedures, algorithms, policies, and workflow | What sequence, contract, validation, or exception-handling assumption failed? |
| Material | Inputs, data, dependencies, and supplies | Was input quality, schema, provenance, availability, or compatibility inadequate? |
| Measurement | Observability, tests, instruments, and evaluation | Were metrics valid, calibrated, timely, sensitive, and interpreted correctly? |
| Mother Nature | Environment and operating conditions | Which host, network, timing, physical, workload, or organizational conditions contributed? |

## Procedure

1. Define the effect, expected outcome, scope/version, and observed versus
   prospective status. Adapt category labels to the domain without silently
   removing a lens.
2. Examine all six lenses using accessible authorized evidence. Record
   candidate causes, actual observations, counterevidence, and unknowns
   separately. A person or agent involved is not itself a root cause.
3. Give candidates stable IDs and link duplicate/cross-category mechanisms
   rather than double-counting them as independent evidence.
4. Mark a category not applicable only with a boundary-based explanation;
   missing evidence means unknown, not no risk.
5. Identify interactions and high-impact evidence gaps. Define the next
   discriminating observation/test and its owner, subject to existing
   authority. Feed credible candidates into causal testing or 5 Whys.

## Output

Return a six-category inventory: category, candidate ID, observation/source
and provenance, causal hypothesis, counterevidence, status/confidence,
cross-category links, applicability/gap rationale, and next test/owner.
Report coverage limitations; a completed checklist is not confirmed causation.
