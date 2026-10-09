# ADHD

```text
    _    ____  _   _ ____  
   / \  |  _ \| | | |  _ \ 
  / _ \ | | | | |_| | | | |
 / ___ \| |_| |  _  | |_| |
/_/   \_\____/|_| |_|____/ 
```

Agent Driven Hybrid Development.

## Prerequisites

This repository depends on the following tools and services:

- **Visual Studio Code**: The supported editor and host for the agent definitions, skills, and GitHub Copilot integration in this repository.
- **GitHub account**: Required to access GitHub services and authenticate GitHub Copilot in Visual Studio Code.
- **GitHub Copilot**: The Visual Studio Code extension and AI service used to run the repository's agents and skills.
- **GitHub Copilot account access**: The signed-in GitHub account must have an active GitHub Copilot plan or access provided by an organization.

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
