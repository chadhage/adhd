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

## Prerequisites

This repository depends on the following tools and services:

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

### Invoker-controlled permissions

Choose the permission level in the active VS Code/Copilot session. All tools and nested subagents follow the host's effective permissions: manual approvals stay manual, while an invoker-granted autonomous mode does not encounter extra repository-forced per-call prompts. The hooks leave valid tool approval decisions unset rather than auto-approving calls themselves.

The workspace enables hooks and nested delegation without pinning approval, browser, network, or sandbox settings. User and organizational controls still apply, and sandboxing remains independent of the permission level. A tool grant does not expand the authorized task or authorize unrelated spending, customer contact, deployment, release, or secret disclosure. See [Manage approvals and permissions](https://code.visualstudio.com/docs/agents/run/approvals) and the [security verification guide](.github/SECURITY.md) for setup and harness-specific checks.
