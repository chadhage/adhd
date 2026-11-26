# ADHD

```text
    ###       #########      ##       ##    #########
   ## ##      ##      ##     ##       ##    ##      ##
  ##   ##     ##       ##    ##       ##    ##       ##
 ##     ##    ##       ##    ##       ##    ##       ##
###########   ##       ##    ###########    ##       ##
##       ##   ##       ##    ##       ##    ##       ##
##       ##   ##       ##    ##       ##    ##       ##
##       ##   ##      ##     ##       ##    ##      ##
##       ##   #########      ##       ##    #########
```

Agent Driven Hybrid Development.

## ADHD Studio

[ADHD Studio](prototype/index.html) retains the visual blueprint editor and
offers three execution locations: **hosted**, **local companion**, and
**self-hosted**. All use the same authenticated [Node.js service](studio/server.mjs).
GitHub Pages hosts only the interface, not the executable service.

Planning works without signing in and saves the draft on the current device.
Connect deliberately to a service you operate or trust, then save the blueprint
to its product-owned Git repository. Connection does not overwrite a saved
product blueprint automatically.

### Blueprint-generated Factory

The **Factory control center** adds container deployment and cyclic production
alongside the existing manual-card workflow. Save a deployment-enabled blueprint,
export its product-Git-tracked package, and authorize a separate operating
mandate. A blueprint is configuration, not spending or production authority.

The package generator emits a derived Dockerfile, runtime configuration,
Docker Compose, Kubernetes, AKS, ACA and ACI templates, and a plan/apply script.
It requires an owner-reviewed runtime image pinned by registry digest. Export
does not build or publish an image, create cloud resources, or install a scheduler.
Downloaded package files can be materialized without overwriting existing paths:

```powershell
node .\studio\package.mjs materialize C:\downloads\adhd-factory-package.json C:\products\factory-deployment
```

The source runtime image is built from `containers/Dockerfile` with explicit
provenance arguments; a dirty worktree is not represented by its old commit alone:

```powershell
$Revision = git rev-parse HEAD
$Timestamp = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
docker build --file .\containers\Dockerfile --tag adhd-factory:local --build-arg "SOURCE_REVISION=$Revision" --build-arg "SOURCE_URL=https://github.com/chadhage/adhd" --build-arg "BUILD_TIMESTAMP=$Timestamp" .
```

The image records source-file hashes and installed dependency inventories.
The [published Linux/amd64 runtime](https://github.com/chadhage/adhd/pkgs/container/adhd-studio)
is `ghcr.io/chadhage/adhd-studio`. Revision tags use `sha-<full Git commit>`;
`latest` is a discovery tag, not an immutable deployment binding. Review the
published digest and use `ghcr.io/chadhage/adhd-studio@sha256:<digest>` in your
portable deployment. An image publication does not start a hosted backend.

The [container assembly workflow](.github/workflows/factory-container.yml)
checks a non-published PR image without AI inference or cloud provisioning.
Critical findings and the full scan report are retained in Actions even when
the gate fails; a failed scan is not hidden or treated as release approval.
The [publication workflow](.github/workflows/factory-publish.yml) runs only after
both main-branch quality gates pass. It builds that exact source revision,
verifies non-root SDK imports and browser assets, generates an SPDX inventory,
and blocks publication on critical Grype findings. Database hash/age checks
remain enabled with a maximum age of five days; lower-severity findings stay
in the retained report. Only that tested image is pushed, and an older revision
cannot replace the current `latest` tag.

GHCR initially creates private packages even for public repositories. The package
owner must set public visibility in its settings before anonymous pulls work;
repository visibility alone is not evidence of public image access.
Toolchain binaries are pinned with upstream checksums; OS package inventories
are retained. The inventory and critical-vulnerability gate do not replace
licensing review, lower-severity triage or live operational assurance.

Runtime inputs are protected files outside the product Git workspace:
`STUDIO_CONFIG_FILE`, `STUDIO_TOKEN_FILE`, `STUDIO_COPILOT_TOKEN_FILE`,
`STUDIO_CERT_FILE` / `STUDIO_KEY_FILE`, and optional database, executor, reviewed
operation and signed-mandate files. `STUDIO_WORKSPACE` binds the approved product
volume. An authenticated HTTPS executor can be selected with
`STUDIO_EXECUTOR_ORIGIN`; an operator-owned Docker daemon may instead use a
digest-pinned `STUDIO_VERIFICATION_IMAGE`. No Docker socket is mounted by default.
Hosted SDK connectors require `STUDIO_COPILOT_RUNTIME_URL` and
`STUDIO_CONNECTOR_TOKEN_FILE` plus an owner-managed authenticated loopback TLS
tunnel: SDK 1.0.34 URI transport does not implement HTTPS itself.

Owners choose the deployment shape, startup trigger, identity and persistence.
The same blueprint supports a single container or controller/role workers;
Studio, API or signed-mandate automatic startup; and human-in-the-loop,
human-on-the-loop or human-out-of-the-loop operation. Owners select permitted
work-product toolchains, clouds and redundancy, or delegate a source-backed
technical proposal to the Fullstacker council. A technical decision does not
itself provision or move infrastructure.

The operating mandate explicitly binds cumulative AI-credit escrow, per-session
caps, concurrency, cycle horizon, expiry, recovery retries, product write paths,
model selection and delegated actions. Optional currency ceilings require an
owner-confirmed credit rate and infrastructure reserve. Unknown billing consumes
the entire reserved session cap; it is not reported as zero. Independently capped
sessions require at least the runtime's 30-credit minimum each, and the available
escrow must fund the complete configured concurrent roster before delivery starts.

Factory production registers VOC intake, obtains dependent readiness handoffs,
starts independent role assignments, generates a candidate in a Git worktree,
verifies it, integrates it, verifies the integrated product, and learns the next
bounded outcome from evidence. Human-in-the-loop operation pauses at individual
gates. On-loop/out-of-loop progression uses the accepted mandate rather than
repeating per-card approval, but requires an isolated verification executor.
Native and managed approvals, human-only authentication, repository protections
and expiry remain binding. Remote publication, infrastructure and release require
configured plan/apply adapters and explicitly delegated actions; absent adapters
fail rather than pretending to deploy.

Delivery WIP remains one product card. Role sessions and technical reviewers can
overlap; planned team counts are not independent concurrent-card throughput.
This is bounded cyclic operation, not a claim that a returned SDK invocation
remains alive or that the full continuously staffed parallel/supervised framework
profile has passed real-host assurance.

Durable checkpoints, signed owner authority and state integrity live in the
product records. PostgreSQL is an optional canonical store with an advisory
controller lease, revision-checked writes and a Git projection. The product Git
workspace/worktrees still require durable storage. Container volume operation
uses an inherited exclusive POSIX file lock, not PID guesses across container
namespaces. Legacy leases, conflicting exports, unknown effects during apply and
missing worktrees require reconciliation instead of blind replay.

Each accepted Factory installs its product-owned Operations Center. Explicit
controller/SDK events, HTTP readiness and an in-process MCP protocol probe share
the same journal. External host MCP discovery and ambient hook coverage remain
separate checks. Central Studio can monitor multiple product services with
distinct page-memory credentials; disconnecting does not stop backend production.

**ACI exception:** Azure Files requires a root container mount bootstrap. Its
template requires explicit approval of that provider constraint; the launcher
drops to UID/GID 1000 before Git, SDK or service execution. Other deployments
default to non-root operation. Certificates, protected secrets, compatible
storage, executor access and actual orchestrator capacity remain operator
prerequisites, not automatically proven by a template.

Local fixture tests verify three Git-integrated increments, independent concurrent
roles, budget containment, revocation and checkpoint recovery. They are injected
SDK tests, not live Copilot, container or cloud operational assurance. Live image
build/run, provider execution, Kubernetes and Azure deployment gates require
separate observations and applicable spending/deployment authorization.

### Manual card execution

The manual service executes one bounded card at a time. Actual Copilot SDK role
handoffs register intake, allocate work, hand it to a Squad, and generate a
candidate in an isolated Git worktree. Sequential roles share one SDK context
and credit-accounting window; planned team sizes are not live concurrency.
Progress comes from backend observations, not scripted browser timers.

Inspect the generated diff before running the owner-configured acceptance
command. A passing candidate is Git-committed but remains unfinished until
**Accept and integrate** is requested. Integration reruns acceptance checks
before completion is recorded. Failed and cancelled attempts remain traceable.
No remote push, deployment, customer contact, or automatic next cycle is implied.

### Start a local companion

Use Node.js 22.21+ and Git. The pinned SDK includes its compatible runtime.
Complete any required Copilot sign-in yourself; never provide credentials in
chat. The selected model or Auto routing entry must be reported by the
session-scoped provider catalog. Authentication alone is not inference proof.

```powershell
npm ci --ignore-scripts
npm start -- --workspace C:\myworkspace1\product --verify-command node --verify-args '["--test","tests/acceptance.test.mjs"]' --token-file C:\approved-secrets\studio-access-token.txt
```

The product directory must be an existing Git repository with an initial commit,
separate from ADHD. Configure the acceptance executable and arguments for that
product; a missing command is not replaced by a sample check. On Windows use
a real executable, not a shell-dependent `.cmd` wrapper.

Supply a 32-256 character access token from your approved secret store, either
through `--token-file` or `STUDIO_ACCESS_TOKEN`. Keep the token outside Git.
The service never prints it. Enter it only in the trusted service's interface;
the browser retains it in memory, not local storage or URL parameters.

Open the actual loopback URL printed by the service. Local mode cannot bind to
all interfaces. If using the separately hosted Pages interface, explicitly allow
its exact origin with `--allow-origin https://chadhage.github.io`; browser local
network access consent, if required, remains human-only.

### Hosted and self-hosted instances

Deploy the same source and lockfile to approved Node.js infrastructure with Git,
a private product workspace, provider authentication, an operations owner, and
protected secrets. Choose `--mode hosted` or `--mode self-hosted` and provide
`--cert <certificate-file>` and `--key <private-key-file>`. Remote modes refuse
to start without TLS. Set `--host` and `--port` deliberately and restrict network
access; the default bind remains loopback.

The interface asks users to select their location and trusted service origin.
It rejects credential-bearing URLs, insecure non-loopback addresses, and
service/mode mismatches. Instances are private, single-owner/product-scoped
services, not an anonymous multi-tenant SaaS. This repository does not provision
cloud resources or grant a hosting budget.

### Records, recovery, and limits

Canonical records live in the product's `.adhd/studio/records.json`; the
records index identifies its blueprint, demand register, runs, history, and
completion sections. Product records are committed independently of candidate
code. Local record reads and writes share one queue so concurrent observations
do not mistake authorized writes for external drift. A per-product service lease
and revision checks still reject competing writers and external record changes.
Worktree, credential, dependency, linked-file, and
parent-path boundaries constrain model tools; native and managed approvals
are not bypassed.

The runtime currently requires at least a **30 AI-credit cap**. A cap is not an
estimated charge or a dollar price. Missing billing stays unknown. The original
30-900 second generation window remains binding through pause/resume; service
restart records interruption without replaying work. Reconnect with the token
to recover durable state. Leaving a page does not cancel a backend run.

Review generated code before verification: local execution is **not an OS
sandbox**. Copilot retains its own host-side session history for recovery.
Studio's durable history stores operational metadata rather than full transcripts.
Optional feedback is explicitly saved to the product demand register as
`Pending VOC`; receipt is not research, acceptance, or authorization for new work.

Run focused backend/client/SDK regressions with `npm run test:studio`; the
existing framework quality gate also includes them through `npm test`.
The framework tool/hook coverage thresholds retain their existing scope.
Browser and live inference observations are separate evidence, not inferred
from mocked SDK integration tests.

The [Pages workflow](.github/workflows/github-pages.yml) checks the interface and
publishes only `prototype/`. Backend code, product records, credentials, and
runtime state are not part of the static site.

## Prerequisites

The currently documented VS Code/Copilot execution route depends on the
following tools and services; these are not prerequisites for the prototype:

| Prerequisite | Description | Action / Link |
| --- | --- | --- |
| **Visual Studio Code** | The supported editor and host for the agent definitions, skills, and GitHub Copilot integration in this repository. | [Download and Install VS Code](https://code.visualstudio.com/Download) |
| **GitHub account** | Required to access GitHub services and authenticate GitHub Copilot in Visual Studio Code. | [Sign up for GitHub](https://github.com/signup) · [Account creation guide](https://docs.github.com/get-started/start-your-journey/creating-an-account-on-github) |
| **GitHub Copilot account and extension** | An active subscription or free plan access is required, and the extension must be properly installed in VS Code. | [GitHub Copilot plans](https://github.com/features/copilot) · [Set up Copilot in VS Code](https://code.visualstudio.com/docs/copilot/setup) · [Copilot extension](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot) |
| **Active agent harness verification** | Verify that GitHub Copilot is selected as the active and current session harness in VS Code using the Session Target control in Chat. | [Choose and use an agent harness](https://code.visualstudio.com/docs/agents/run/agent-harnesses) |

## Getting started

1. Complete all [prerequisites](#prerequisites).
2. Create a workspace directory with `reference` and `product` subdirectories. For example:

   ```text
   C:\myworkspace1
   ├── reference
   └── product
   ```

   On a Unix-like system, you could use `/myworkspace1` instead.
3. Clone ADHD into the `reference` directory:

   ```sh
   git clone https://github.com/chadhage/adhd.git C:\myworkspace1\reference\adhd
   ```

   On a Unix-like system, use `/myworkspace1/reference/adhd` as the destination.
4. Launch Visual Studio Code.
5. Open the `adhd` folder you cloned under `myworkspace1\reference` (for example, `C:\myworkspace1\reference\adhd`).
6. Open GitHub Copilot Chat and change the mode to **FactoryLauncher**.
7. Type your prompt.
8. Press **Enter** to start.

## Operating profiles and history

New engagements default to proposed bounded execution under
[Operating Profiles](.github/skills/factory-mvp-and-recovery/SKILL.md#operating-profiles).
Bind the accepted scope, checkpoint, budget and resume owner before dependent
work. Parallel and supervised-unattended guarantees require explicit selection
and observed host capabilities; configuration does not install live workers or
a scheduler. Existing accepted engagements retain their terms until an approved
amendment. A bounded turn ending is not Factory shutdown approval.

For second and subsequent invocations, follow
[Repeat-Run Continuation](.github/skills/factory-mvp-and-recovery/SKILL.md#repeat-run-continuation).
Recover the existing records and unfinished work, distinguish a child return
from a real restart or new iteration, and name the actual next executor.
The first setup cycle does not authorize later iterations, and no-stop wording
does not install a scheduler. Required restart rate confirmations and permission
boundaries still apply; reuse unchanged valid decisions rather than rerun setup.

Historian starts/resumes for accepted recording assignments and mandatory demand
intake. Demand-event history remains required; full transcripts are separately
scoped. No every-human-turn listener is installed. Use approved product-owned
storage, daily records and independent retention; expose unsaved/capture gaps.

## Concurrent Factories and Squads

Factories and Squads for the same product share one backlog and roadmap.
Each Squad uses one common Kanban; Factory/product rollups reconcile canonical
allocations without duplicating cards. Independent Squads and admitted card
cohorts may execute concurrently within approved aggregate WIP and actual
capacity, with one-piece flow per member/cohort and scoped board writers.

Individual verified returns release eligible next work without whole-team
barriers. Handoffs preserve IDs, revisions, partial work and sender custody until
actual acceptance; preparing next work never bypasses readiness or WIP.
See [shared planning, concurrent dispatch and handoff continuity](.github/skills/kanban-one-factory-many-squads/SKILL.md).
Existing engagements require an authorized topology migration; definitions and
tests do not prove live parallel operation or install unattended supervision.

## Factory Operations Center

Every Factory launch provisions its own product-owned observation tower; every
resume/restart installs one if missing or revalidates the existing center.
The product repository and stable Factory identity are derived at invocation
time. Running centers and telemetry never live in the ADHD reference checkout.

The [Factory Observability skill](.github/skills/factory-observability/SKILL.md)
provides the reusable installer and standalone Node.js runtime:

- Visual live streaming and agent, skill, and product-item drill-down.
- A comprehensive Factory metadata card covering identity, mission, product,
  owners, governance, roster, lifecycle, runtime, coverage, and provenance,
  available through the same read-only API/MCP surfaces.
- Analytics and evidence-limited insights with explicit freshness/capture gaps.
- Versioned read-only HTTP JSON/SSE API and per-Factory MCP stdio tools/resources.
- Product-owned durable facts, metadata-only hooks, and an inbox for agents
  without execution tools. No synthetic production activity or automatic controls.

See the [runtime/API/MCP guide](.github/skills/factory-observability/scripts/runtime/README.md)
for contracts, limits, and local security boundaries. Actual host capture and
connectivity must be verified; configuration is not proof of live observation.

## Licensing disclaimer

This repository is licensed under the [MIT License](LICENSE), following Microsoft's open-source licensing model. Copyright is held by Microsoft Corporation. The software and agent definitions are provided "as is," without warranty of any kind. The license permits use, copying, modification, distribution, sublicensing, and sale, subject to preservation of the copyright and license notices.

## Agent execution model

The agents in this repository run **on behalf of (OBO)** the user who invokes them. In this context, OBO means that an agent acts through the user's configured Visual Studio Code and GitHub Copilot environment. It does not give the agent a separate privileged identity, elevate the user's permissions, or by itself imply that an OAuth 2.0 On-Behalf-Of token exchange is taking place. A particular tool or service may separately implement an OAuth OBO flow.

OBO execution has the following implications:

- Agent actions are constrained by the invoking user's accounts, permissions, organizational policies, tool approvals, and environment configuration.
- Operations may be performed against resources the user can access and may be logged, audited, attributed, rate-limited, or billed as activity initiated through that user or their organization.
- The user remains responsible for reviewing requested and completed actions, granting approvals, protecting credentials, and confirming that outputs are appropriate before committing, publishing, deploying, or sharing them.
- Instructions and tool output can be untrusted. Users should apply least privilege, review tool permissions, and avoid exposing secrets or sensitive data that are not required for the task.

### MCP servers and extensions

Agents may use Model Context Protocol (MCP) servers, Visual Studio Code extensions, and other tools that the invoking user's environment exposes to GitHub Copilot. Depending on the installed and enabled tools, this may allow an agent to read or modify workspace files, run local commands, access local services, or call remote systems that the user is authorized to use.

Availability does not imply unrestricted access. Each MCP server or extension controls its own authentication, authorization, consent prompts, data handling, and execution boundaries. Agents can use only capabilities exposed to them for the current session and remain subject to user approvals, operating-system permissions, repository instructions, organizational policy, and service-specific controls. Users should install trusted integrations only, inspect their scopes and configuration, and disable capabilities that are unnecessary for the task.

The framework's agent definitions and operating guide live in [`.github/agents/`](.github/agents/README.md). Reusable methods and policies live in [`.github/skills/`](.github/skills/).

Workspace security controls for agent tool approvals, trust boundaries, and prompt-injection regression tests are documented in [`.github/SECURITY.md`](.github/SECURITY.md). Review the selected VS Code session harness and its effective sandbox policy; repository hooks and settings do not enforce controls in unsupported or untrusted workspaces.

### Work IQ

The shared [`.mcp.json`](.mcp.json) connects compatible Copilot harnesses to
Microsoft's hosted Work IQ MCP server. All ADHD agents select only its
query/read tools for authorized Microsoft 365 evidence; write/action tools
are not selected. No local npm installation or credentials in Git are needed.
Start or refresh a Copilot session in this workspace and complete any required
Microsoft sign-in and tenant consent yourself. A configured connection is not
proof of authenticated access. See the
[Work IQ activation and query/read contract](.github/agents/README.md#work-iq-connection).

### Fabric IQ

The same [`.mcp.json`](.mcp.json) configures Microsoft's hosted, read-only
Fabric IQ MCP server for all ADHD agents. It supports Power BI report and
semantic-model discovery, metadata/schema inspection, value search, and DAX
queries. Work IQ is preserved; no credentials or local packages are added.
Refresh MCP connections or start a new session, locate `fabriciq`, and complete
Microsoft Entra sign-in and any required tenant consent yourself. Actual
authenticated data access remains to be verified. See the
[Fabric IQ activation and read-only contract](.github/agents/README.md#fabric-iq-connection),
including private-link requirements and the distinction from ontology and
published data-agent endpoints.

### Invoker-controlled permissions

Choose the permission level in the active VS Code/Copilot session. All tools and nested subagents follow the host's effective permissions: manual approvals stay manual, while an invoker-granted autonomous mode does not encounter extra repository-forced per-call prompts. The hooks leave valid tool approval decisions unset rather than auto-approving calls themselves.

For autonomous Factory work, select **Allow all** in that session's permissions picker (**Bypass Approvals** in older/Local hosts) and accept its native warning once. This is the single initial tool-authorization gate, shared by FactoryLauncher, Factory, Squads, ProductOwner, VOC, AssociateProductOwner, Fullstacker, and Kanban, including nested subagents; they must not ask again for unchanged routine tools or delegation. An already-active grant needs no new confirmation. Choose **Manual permissions** instead if you want per-invocation or selective tool prompting. Device authentication, CLI authentication, and other authentication requiring human input remain human-only exceptions. This workflow does not enable global/workspace auto-approval or replace the host's controls. See [Single Tool Authorization](.github/skills/factory-mvp-and-recovery/SKILL.md#single-tool-authorization).

The workspace enables hooks and nested delegation without pinning approval, browser, network, or sandbox settings. User and organizational controls still apply, and sandboxing remains independent of the permission level. A tool grant does not expand the authorized task or authorize unrelated spending, customer contact, deployment, release, or secret disclosure. See [Manage approvals and permissions](https://code.visualstudio.com/docs/agents/run/approvals) and the [security verification guide](.github/SECURITY.md) for setup and harness-specific checks.
