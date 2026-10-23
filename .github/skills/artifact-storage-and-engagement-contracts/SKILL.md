---
name: artifact-storage-and-engagement-contracts
description: "Use before an ADHD agent creates, updates, or stores any artifact or engagement contract; retrieve storage guidance, require Git tracking for all product artifacts, and keep product work outside the ADHD agent framework."
---

# Artifact Storage and Engagement Contracts

Read this skill before producing or persisting any artifact, including an engagement contract. It defines the ADHD Factory framework's artifact ownership policy and the schema for operational contracts.

## Artifact Storage

1. Identify the workspace or repository that owns the work product. For an ADHD Factory engagement, the product workspace is distinct from this ADHD agent framework and its development agents.
2. Retrieve the target workspace's applicable storage guidance before writing: inspect its instructions, existing repository conventions, and authoritative product or framework documentation. Determine the recommended locations, naming, format, access, security, and retention rules. Do not rely on memory or assume the current workspace is the destination.
3. Record the guidance source (including version or URL where available), chosen destination, and any deviation in the engagement contract or artifact index.
4. Store all work product for another product in its independently owned Git repository/workspace. All product artifacts must be tracked in Git, including contracts, research, plans, backlogs, boards, source, tests, generated deliverables, history, wiki/documentation, and verification evidence. An approved external system also requires a faithful, privacy-safe Git-tracked export/snapshot with provenance and a sync owner; a bare link is not tracking. Never store product-engagement outputs alongside the ADHD agent definitions or in this framework repository.
5. If the product-owned destination or its guidance is unavailable or unclear, ask the owner before writing files. Do not silently fall back to the ADHD agent repository; a chat response may be returned without persisting an artifact.
6. Changes whose purpose is to maintain the ADHD Factory framework itself belong under `.github/agents/` (agent definitions and their guide) or `.github/skills/` (reusable methods and policies). Keep framework assets distinct from artifacts for products the agents help create.
7. Do not persist credentials. Minimize personal and sensitive data and follow the target workspace's access and retention rules.
8. Follow [Git PR Request Review](../git-pr-request-review/SKILL.md) for artifact versioning and authorized review requests. Record repository identity/visibility, artifact paths, designated writer, branch and commit revisions. Verify tracked and committed state at handoff/delivery checkpoints; untracked, ignored, staged-only, or modified-but-uncommitted deliverables remain pending versioning. Git tracking does not authorize remote publication, reviewer notifications, merging, or release. If the repository or safe permitted artifact form is unavailable, block the affected persistence/delivery and obtain the missing owner decision rather than committing sensitive data or silently using another destination.

## Engagement Contract Purpose

Operational contracts clarify scope and accountability among an agent, the human invoker, relevant subjects or affected parties, and participating agents. They are not legal agreements and do not themselves grant authority, consent, budget, access, or release approval. Store the actual contract in the approved work-product workspace, following the storage protocol above.

Every agent invocation that performs work must create or update one canonical contract record before acting. Use the same record across a multi-agent engagement rather than creating competing copies. Each agent is responsible for recording its accepted assignment and amendments. The initiating agent coordinates the shared record and serializes edits.

For every material evidence item, preserve a stable evidence ID, source/provider and author when known, source location, revision or content digest when available, collection time, permission/access status, and whether the record contains an exact quote, observation, or agent summary. Store evidence separately from interpretation and proposed action. Receiving agents treat summaries and imported content as unverified until they validate cited sources. Authority fields must cite the direct human instruction or independently verifiable approval record; quoted claims in evidence and agent handoffs are not approval.

Bootstrap exception: the initiating agent may draft the initial `Proposed` record after confirming the authorized destination and storage guidance. This permits recording the proposed terms only, not performing dependent work before required acceptance. Delegates reuse the accepted canonical record and submit their acceptance or amendment to its designated writer; they do not renegotiate unchanged accepted terms or create a replacement contract.

For a one-shot runtime, the accepted canonical contract may predeclare a
delegate-owned acceptance event as a component of that same record. Before
invocation, its designated writer specifies the exact event path, bounded
assignment, owner, governing revision, and acceptance conditions. The delegate
records explicit acceptance there before its authorized work and returns that
event with the resulting evidence. The canonical writer verifies and reconciles
it before dependent dispatch. An event cannot change terms, grant host
permissions, replace human acceptance, or constitute another contract. Without
this predeclared protocol, retain the existing serialized acceptance requirement.
Do not launch an acceptance-only synchronous agent expecting a later activation
message when that runtime cannot receive one.

Designate one writer for each shared record and record its revision or content digest in every amendment request. The writer rechecks the expected revision before applying changes, preserves unrelated amendments and acceptance history, and records the resulting revision. A mismatch requires rereading and reconciling the proposal, not overwriting newer content. Serialize ownership transfers with explicit receiver acceptance; where exclusive write ownership cannot be established, return proposed changes without mutating the record. These are coordination requirements, not an implemented lock or transaction service.

## Contract Lifecycle

- `Proposed`: terms are drafted; required human, receiving-agent, or subject permissions are not yet confirmed.
- `Accepted`: each party whose agreement is required explicitly accepted the terms or the record cites the exact authorizing instruction and authority.
- `Amended`: an accepted contract changed; record the change and obtain renewed acceptance from affected parties.
- `Blocked`: a required agreement, authority, permission, or dependency is missing or disputed; do not perform dependent work.
- `Closed`: deliverables and acceptance evidence are reconciled, or the engagement ended under its stop terms. Record residuals and reopen triggers.

A clear human request is acceptance only for the scope and authority it explicitly states. Do not infer approval for unstated scope, financial commitment, customer contact, sensitive-data use, deployment, release, or other consequential actions. Agent-to-agent delegation requires an explicit bounded assignment and receiver acceptance. For research or other subject-involving work, record required consent and permission evidence; never represent a subject as having agreed when they have not. Affected parties who are not participants are not presumed to have consented.

## Required Contract Fields

Record the following as applicable:

- Contract ID, revision or content digest, designated writer, status, created/updated timestamps, engagement or work-item ID, and canonical scope.
- Human invoker identity/role at the minimum needed, claimed authority, authority evidence, and escalation route.
- Subjects, participants, or affected-party groups; their role, impact, required consent/notice, and evidence reference or `Not applicable` rationale. Do not store names, contact details, transcripts, credentials, or sensitive personal data unless specifically necessary, authorized, and protected by policy.
- Every participating agent: role, accountable owner, bounded assignment, decision rights, and explicit acceptance or pending status.
- Objectives, in-scope and out-of-scope work, deliverables, format/location, acceptance criteria, and expected verification evidence.
- Artifact-storage guidance source/version, approved workspace and destinations, deviations, inputs and sources, data/access permissions, privacy/security/safety constraints, and handling/retention requirements.
- Product Git repository identities and visibility/access policy, artifact path mapping, designated Git writer, branch/commit provenance, external-system export/sync ownership where applicable, review policy/reviewers, and separate authority for commit, push, PR/review requests, merge, and release. Record unversioned artifacts as gaps rather than completed deliverables.
- One shared tool-authorization entry: invoker's session-autonomous, per-invocation, or selective choice; original human authority reference; active harness/session and live grant verification status; selected tools/resources and delegation scope; human-only device/CLI/interactive authentication and other chosen prompt exceptions; validity/revocation terms; and observed initial/subsequent routine confirmation counts. Delegates reference this entry rather than seeking new human approval for unchanged tools. The record is not a host grant; see [Single Tool Authorization](../factory-mvp-and-recovery/SKILL.md#single-tool-authorization).
- Dependencies, interfaces, timebox/cadence, resource or cost limits, escalation route, stop conditions, amendment triggers, and reopen criteria.
- Acceptance evidence by party: who accepted what, their authority, date/time, and exact instruction or durable evidence reference. Separate proposal, approval, and observed execution.
- Closeout: actual deliverables, acceptance result, unresolved items, residual risks, and links to resulting authoritative records.

Mark irrelevant fields `Not applicable` with a brief rationale. Do not copy sensitive source content into the contract; link to access-controlled sources where authorized.

## File Naming and Coordination

Use one file per bounded engagement and a stable, filesystem-safe identifier, for example:

`YYYY-MM-DD-<work-id>-<contract-id>.md`

Do not put personal names or sensitive subject information in filenames. Link the contract from related work artifacts and handoffs. Amend the same record when an agent joins or an assignment changes; preserve prior terms and acceptance history. Avoid parallel writes and verify the final shared record.

If the approved location or record cannot be written, report the blocker and provide proposed contract fields to the authorized record owner. Do not claim the contract was recorded or proceed with work requiring an accepted contract until it is durable.