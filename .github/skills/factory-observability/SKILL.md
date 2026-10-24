---
name: factory-observability
description: "Use on every Factory launch or resume to provision or revalidate its product-owned Factory Operations Center, and when emitting or reading live agent, skill, product-item, provenance, coverage, streaming, API, MCP, or analytics facts."
---

# Factory Operations Center

Every Factory has its own observation tower. Provision it during **every new
launch**; on **every resume/restart**, install it if absent and revalidate it if
present. Existing Factories acquire it at their next restart. This is a required
operating capability, not an optional history-agent invocation.

## Ownership and authority

ADHD contains only the reusable installer and runtime source. Derive the
**existing product-owned Git root and stable Factory ID from the accepted
launch/resume records**. Never default to the reference checkout, current working
directory, a sibling guessed from its name, or a new unrelated product repository.
Do not ask the human to choose these again when verified records resolve them.
Resolve missing/conflicting ownership through the existing decision route.
Follow [Artifact Storage and Engagement Contracts](../artifact-storage-and-engagement-contracts/SKILL.md).

The installed center, code, configuration, safe retained facts, and evidence
belong to the product at `.factory/observability/<factory-id>`. Separate
directories, journals, browser processes/ports, and MCP servers isolate Factories.
The product-level registry routes only explicitly bound host sessions; an
unbound session is never assigned to the only available Factory by guesswork.

This MVP **observes** command/governance/control facts; it does not execute
commands, approve actions, change priority/boards, pause/resume production, or
start a supervisor. A fact, decision report, returned invocation, or tool result
is not authority. Product acceptance remains with the established roles.

## Required launch/resume procedure

1. Reuse the canonical engagement, its single tool-authorization entry, product
   storage/access/retention guidance, stable Factory ID, and actual host session
   identity. Scope capture to this Factory's participating agents and operational
   metadata. No private transcript or cross-session discovery is authorized.
2. Assign an execution-capable Fullstacker/designated writer to run the installer
   from the reference checkout, under the same effective host permissions:

   ```powershell
   node .github\skills\factory-observability\scripts\install.mjs --product-root C:\products\example --factory-id example --session-id actual-host-session-id
   ```

   Substitute verified invocation-derived values; the example is not a default.
   Use `--label` for a safe display label. `--stale-after-ms` sets a display-only
   freshness threshold (default 60000 ms, not a production SLA or halt deadline).
   Reuse the same ID on resume. The installer is revision-aware and preserves
   journals, inboxes, existing settings, and local source edits (conflicts block
   upgrade rather than overwrite). It refuses a product inside or containing the
   reference tree, non-root/non-Git destinations, and linked managed paths.
3. If the actual session ID is unavailable, omit `--session-id`, explicitly
   record the unbound capture gap, and use attributable explicit emissions.
   Do not fabricate a session ID. Re-run with the actual ID when available.
   Additional nested sessions need their actual IDs bound to the same Factory.
   A session cannot be bound to two Factories in one product.
4. Start that installed center, **not the reference source**, using the host's
   approved long-lived/background process facility:

   ```powershell
   node C:\products\example\.factory\observability\example\cli.mjs serve
   ```

   The default is a free OS-assigned loopback port; `--port N` can select a port.
   Verify the returned UI URL and `/healthz`, then read an actual emitted fact.
   Record the actual process owner, URL, port, restart command, and capture gaps
   in the product's canonical launch/resume record. A process launch request
   or prepared registration is not readiness evidence. If the host cannot keep
   it alive, report the exact limitation; do not promise unattended monitoring.
5. Refresh the product workspace's MCP connections. Verify `initialize`,
   `tools/list`, and a read against `factory-observability-<factory-id>`.
   The installer preserves other entries in both `.mcp.json` and
   `.vscode/mcp.json`. CLI-style registration assumes the product root as cwd;
   VS Code registration uses `${workspaceFolder}`. Configuration alone does not
   prove host discovery, authentication/permission inheritance, or connectivity.
6. The product's `.github/hooks/factory-observability.json` registers a separate,
   permission-neutral metadata collector. Keep the existing security hooks.
   Verify the active harness actually loads these **product** hooks; a host
   opened only on the reference checkout may not. Reload/start the appropriate
   product session when required. Never silently modify the reference workspace
   or global settings to redirect another session's events.
7. Emit an actual Factory start/resume/progress fact when observed production
   begins; provisioning does not manufacture one. Confirm it in the browser,
   API, and MCP. Retain the canonical center location and same journal on restart.
   Hand Factory the center identity, source bindings, coverage, and health owner.
   Provision before claiming launch/resume ready; unsupported host capture is
   visible degraded coverage, not permission to hide the gap or halt unrelated
   authorized safe work.
8. Follow [Git PR Request Review](../git-pr-request-review/SKILL.md) to version
   generated sources/configuration and safe retained facts at the product's
   checkpoints. The installer does not stage, commit, publish, or initialize Git.
   Pending versioning remains explicit. Live locks/inbox/temp files are transient;
   raw rejected emissions must never be committed. Apply the product's approved
   minimization, retention, archive, access, and review policy.

## Emit facts from every participating role

Use stable actual agent instance IDs, role names, skill names, and product-item
IDs. Emit `agent.started/progress/completed/failed`, actual
`skill.started/completed/failed`, item creation/change/block/completion,
decisions, incidents, and evidence with source references. Include a
`correlation_id` (or valid nonzero `trace_id`/`span_id`) across related boundaries.
Never report a requested action as executed or an unverified card as accepted.

All roles have an edit capability: without execution access, create a **unique**
`inbox/<event-id>.json` in the assigned center, or hand the fact to its designated
writer. The UI server and MCP ingest valid inbox files into the same durable,
deduplicated journal. Producers without a running reader can retain the inbox
until the next read. Do not have agents concurrently edit the journal.

An emission has the following shape (replace example values and timestamp with
actual observations; **no example events are installed**):

```json
{
  "schema_version": 1,
  "event_id": "unique-event-id",
  "factory_id": "example",
  "occurred_at": "2026-10-23T20:00:00Z",
  "kind": "agent.progress",
  "message": "Bounded operational summary without prompts or secrets.",
  "agent": { "id": "actual-instance-id", "role": "Fullstacker" },
  "correlation_id": "actual-assignment-id",
  "source": {
    "kind": "agent-report",
    "ref": "product-owned-evidence-reference",
    "revision": "observed-revision-or-null"
  }
}
```

Execution-capable writers can use `cli.mjs emit --input <event.json>`. The full
emission schema is available at `GET /api/v1/schema`. IDs are idempotency keys:
same ID/content returns the existing record; different content is rejected.
Collection assigns `sequence` and `recorded_at`; producers cannot supply them.

Host hooks collect **allowlisted metadata only**: tool name, safe host IDs,
timestamps, skill-loader name, and safe in-product artifact path when an explicit
successful file write is reported. No raw prompts, arguments, results, file
contents, credentials, or hidden reasoning are recorded. Pre-tool facts are
`tool.requested`, never proof of execution. Unspecified outcomes remain
`tool.observed`. Skill loading is `skill.loaded`, not application/completion of
the method. Structured/opaque patch tools and inaccessible nested agents require
explicit emissions; do not claim exhaustive coverage from tool metadata.

## Interfaces and safety

See the installed [runtime guide](scripts/runtime/README.md) for API, replay,
analytics, MCP protocol, limits, recovery, and troubleshooting. All three
surfaces use the same validated journal and projection functions:

- **UI:** live stream with pause/follow, filters, history, provenance details,
  agent/skill/item drill-down, coverage, freshness, and analytics/insights mode.
- **API:** versioned read-only HTTP JSON and replayable Server-Sent Events.
- **MCP:** read-only stdio tools and `factory://<id>/...` resources; no mutation
  tools or network MCP listener.

The loopback-only HTTP origin is local OS-account scope, **not** multi-user
authentication or a hostile-local-process security boundary. Do not port-forward
it or expose it on a shared network. Host/Origin/Fetch-Metadata checks and CSP
reduce browser rebinding/cross-site exposure; they do not replace authentication
for a future hosted service.

Capture gaps, unknown attribution, invalid inbox entries, stale source time, and
I/O errors remain visible. Old imported facts do not refresh Factory freshness.
No inference of utilization, causal diagnosis, healthy production, accepted Done
Done, or customer value is made. This is not an OpenTelemetry collector or
automatic transcript history; Historian retains its separately accepted scope.

## Best-practice grounding

Official sources checked 2026-10-23; these inform the design, not new authority:

- [OpenTelemetry Logs Data Model](https://opentelemetry.io/docs/specs/otel/logs/data-model/):
  distinct event/observed timestamps, resource identity, severity, trace linkage.
  This small JSON schema is inspired by the model, not an OTLP implementation.
- [MCP stdio transport](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports):
  newline-delimited JSON-RPC, stdout reserved for protocol, stderr diagnostics.
- [MCP tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools):
  discoverable schemas, read-only annotations, bounded structured tool results.
- [Server-Sent Events](https://html.spec.whatwg.org/multipage/server-sent-events.html):
  event IDs and `Last-Event-ID` replay after reconnection.
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/):
  semantic controls, keyboard paths, focus, text/status alternatives, reflow,
  reduced motion. Browser checks are not full assistive-technology certification.
