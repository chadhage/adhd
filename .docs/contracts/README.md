# Agent Engagement Contracts

This directory is the canonical home for operational contracts among an agent, the human invoker, relevant subjects or affected parties, and other participating agents. These records clarify scope and accountability; they are not legal agreements and do not themselves grant authority, consent, budget, access, or release approval.

Every agent invocation that performs work must create or update one canonical contract record before acting. Use the same record across a multi-agent engagement rather than creating competing copies. Each agent is responsible for recording its own accepted assignment and any amendment to its obligations. The initiating agent owns coordination of the shared record; serialize edits when multiple agents participate.

## Record Lifecycle

Use these statuses:

- `Proposed`: terms are drafted; required human, receiving-agent, or subject permissions are not yet confirmed.
- `Accepted`: each party whose agreement is required has explicitly accepted the terms or the record cites the exact authorizing instruction and authority.
- `Amended`: an accepted contract changed; record what changed and obtain renewed acceptance from parties affected by the change.
- `Blocked`: a required agreement, authority, permission, or dependency is missing or disputed; do not perform work that depends on it.
- `Closed`: deliverables and acceptance evidence are reconciled, or the engagement ended under its agreed stop terms. Record residuals and reopen triggers.

A clear human request may serve as acceptance only for the scope and authority it explicitly states. Do not infer approval for unstated scope, financial commitment, customer contact, sensitive data use, deployment, release, or other consequential actions. Agent-to-agent delegation requires an explicit bounded assignment and receiver acceptance. For research or other subject-involving work, record required consent and permission evidence; never represent a subject as having agreed when they have not. Affected parties who are not participants are not presumed to have consented.

## Required Contract Fields

Each record must contain, as applicable:

- Contract ID, status, created/updated timestamps, engagement or work-item ID, and canonical scope.
- Human invoker identity/role at the minimum needed, claimed authority, authority evidence, and escalation contact or route.
- Subjects, participants, or affected-party groups; their role, impact, required consent/notice, and the evidence reference or `not applicable` rationale. Do not store names, contact details, transcripts, credentials, or sensitive personal data unless specifically necessary, authorized, and protected under repository policy.
- Every participating agent: role, accountable owner, bounded assignment, decision rights, and explicit acceptance or pending status.
- Objectives, in-scope and out-of-scope work, deliverables, format/location, acceptance criteria, and verification evidence expected.
- Inputs and source references, data/access permissions, privacy/security/safety constraints, and handling or retention requirements.
- Dependencies, interfaces, timebox/cadence, resource or cost limits, escalation route, stop conditions, amendment triggers, and reopen criteria.
- Acceptance evidence by party: who accepted what, their authority, date/time, and the exact instruction or durable evidence reference. Separate proposal, approval, and observed execution.
- Closeout: actual deliverables, acceptance result, unresolved items, residual risks, and links to resulting authoritative records.

Mark irrelevant fields `Not applicable` with a brief rationale. Do not record credentials or copy sensitive source content into the contract; link to access-controlled sources where authorized.

## File Naming and Coordination

Create one file per bounded engagement using a stable, filesystem-safe identifier, for example:

`YYYY-MM-DD-<work-id>-<contract-id>.md`

Do not put personal names or sensitive subject information in filenames. Link the contract from relevant work artifacts and handoffs. For a new participating agent, amend the same contract with its assignment and acceptance before delegation proceeds. Record each amendment and preserve prior terms and acceptance history. Avoid parallel writes; the coordinating agent serializes changes and verifies the final shared record.

If the directory or record cannot be written, report the blocker and provide the proposed contract fields to the authorized record owner. Do not claim a contract was recorded or proceed with work requiring an accepted contract until the record is durable.
