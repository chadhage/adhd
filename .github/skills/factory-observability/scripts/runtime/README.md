# Factory Operations Center runtime

This standalone product-owned instance observes one Factory. It does not need
ADHD on its module search path, an npm install, a cloud account, or a database
service. Node.js 22.21+ and the product's reviewed local files are sufficient.
Never run an instance from the reference/framework source directory.

## Run

From this directory:

```powershell
node .\cli.mjs serve
node .\cli.mjs serve --port 4318
node .\cli.mjs status
node .\cli.mjs emit --input C:\product\safe-event.json
node .\cli.mjs mcp
```

`serve` prints its actual loopback UI/API/health URLs. Use the host-approved
background process facility for a long-lived service, verify readiness, and
record its owner/restart route. `status` does not claim the UI service is running.
The generated MCP registrations start a separate stdio reader of the same
Factory journal; HTTP need not be running to use MCP.

The UI provides two modes (Live, Historical) and two facets (Metadata internals,
Value stream To Do→Done flow). Live and Historical series for the selected facet
are superimposed on one graph. Live is a near-real-time reconstruction; Historical
aggregates the same measures over 1 day to 1 year. The fact stream can pause the
**view** without stopping capture. Search, severity and entity filters, older
records, fact details, and descriptive analytics keep explicit sample sizes and
limitations. No synthetic facts replace missing data. Loading, offline, stale,
unknown, and ingestion-error states differ.
Source age continues to advance while disconnected. Dialogs have explicit
keyboard dismissal, and facts arriving during a history request are retained.
Revalidation preserves the existing label/freshness configuration; amend
`center.json` under the product owner's review rather than silently resetting it.

## Factory metadata card and profile

The **Factory metadata** card is visible on the Metadata facet in Live and
Historical modes. Its summary
shows mission, identity, product, accountable owners, reported lifecycle, runtime,
and workspace. Expand **Explore all Factory metadata** for every supported
metadata field: the complete profile, all center configuration fields, declared
roster, source-reported lifecycle timestamps and latest report, product-owned
storage locations, UI/API/MCP interfaces, limits, session coverage, observed
inventory totals, and provenance. Metadata is never filtered away by fact search
or severity filters. Profile-only changes refresh via SSE, even with no new facts.

`profile.json` belongs to this Factory's product, is separate from generated
runtime files, and must contain only reviewed operational metadata. The installer
accepts `--profile <reviewed-profile.json>`; providing it **replaces** the complete
profile with its normalized/redacted form. Otherwise existing profile bytes are
preserved on resume. A new or older center without a profile receives only its
verified product workspace, installer source, and explicit null/empty fields.
Revalidation upgrades 1.0.0 configuration to runtime 1.1.0 while retaining its
identity, creation time, freshness threshold, journal, and unrelated settings.

Populate the profile from the accepted launch/resume records, not guessed
identities or unauthorized filesystem discovery. Example shape (use actual,
authorized values; null means **Not recorded**, not approval):

```json
{
  "version": 1,
  "factory_id": "example",
  "mission": null,
  "product": {
    "name": null,
    "repository": null,
    "workspace": null,
    "branch": null
  },
  "owners": { "factory": null, "product": null, "operations": null },
  "governance": {
    "engagement_id": null,
    "contract_ref": null,
    "charter_ref": null,
    "board_ref": null,
    "operating_window": null,
    "resource_limits": null,
    "retention_policy_ref": null
  },
  "roster": {
    "agents": [],
    "skills": [],
    "squads": []
  },
  "source": { "ref": null, "revision": null },
  "updated_at": null
}
```

Agent roster entries have `id`, `role`, and optional `assignment`; skills are
filesystem-safe skill names; squads are stable instance IDs. Each list is bounded
at 100 entries with duplicate identities rejected. The full profile is bounded
at 16 KiB, mission at 1000 characters, other text at 512, and agent role at 64.
Unknown fields, sensitive-file references, credential-shaped roster IDs, invalid dates, cross-Factory
profiles, linked files, and malformed JSON fail explicitly. Common credential
patterns and URL credentials/query/fragment are redacted; this is not a guarantee
against all secret formats. Use responsible role labels instead of unnecessary
personal/contact data. Never include raw environment variables, tool payloads,
transcripts, or credentials.

Provenance identifies the profile state, missing fields, collection time, and
SHA-256 of normalized/redacted profile JSON (not raw-file bytes). No profile means
**PROFILE NOT RECORDED**; incomplete fields mean **PARTIAL PROFILE**. A declared
agent is not counted as observed, and a reported start/resume does not certify
current health. Provisioning time is not a Factory creation/start timestamp.
Late lifecycle imports do not replace newer reports.

The profile is reread on every metadata read/stream pass. Use an atomic file
replacement when editing it while running. Invalid metadata returns explicit
API/MCP errors, degrades health/stream reads, and is never replaced by an empty
success. The UI labels any retained card **LAST KNOWN METADATA** with the error;
fix the exact owner-maintained record to recover. Metadata does not alter the
journal's activity/freshness clock or grant authority. Configuration changes
still require a service restart to change the actual runtime settings.

## HTTP API

Only `GET` is supported. Responses are JSON except the UI/assets and SSE.

| Route | Result |
| --- | --- |
| `/healthz` | Service readiness and separate Factory freshness/coverage; 503 for rejected inbox emissions or unreadable/corrupt records |
| `/api/v1/schema` | JSON Schema for emitted facts |
| `/api/v1/overview` | Whole-Factory metadata, observed entities, latest 100 facts, source freshness, coverage, errors, and last sequence |
| `/api/v1/metadata` | Complete safe Factory metadata projection used by the card and MCP |
| `/api/v1/events` | Ordered journal page with `next_cursor`, `has_more`, `last_sequence` |
| `/api/v1/analytics` | Up to 365 days of descriptive counts, 24 time buckets, Live/Historical overlay series for `facet=metadata` or `facet=value-stream`, role/skill facts, matched reported lead time, and rule-based insights |
| `/api/v1/stream` | SSE `snapshot`, `fact`, `status`, and `capture-error` events |

Events and analytics accept `agent_id`, `skill`, `item_id`, `kind`, `severity`,
`q`, `from`, and `to`. Analytics also accepts `facet=metadata|value-stream`
(default `metadata`) and returns superimposed Live (last hour) and Historical
window series. Time filters use ISO 8601 with timezone. Events support
`limit` (1..500, default 100), `after` (exclusive forward sequence), `before`
(exclusive earlier sequence), and `order=asc|desc` (default asc). Do not combine
`before` and `after`. The next page uses `after=next_cursor` for ascending pages,
or `before=next_cursor&order=desc` for descending pages. Invalid, duplicate,
unsupported, or cross-journal cursors fail explicitly. Metadata/overview/health/schema
describe the whole Factory and accept no filters.
Analytics rejects event pagination arguments instead of silently ignoring them.

SSE accepts the fact filters and an optional `after` sequence. It sends a current
snapshot, then matching facts after that cursor. Without a cursor it tails new
facts. A browser's validated `Last-Event-ID` overrides the original URL cursor
on reconnection. Sequence IDs are per Factory. It sends status updates without
inventing Factory heartbeats. Up to 20 streams and a 2 MiB outgoing buffer per
stream are supported; slow consumers disconnect and can replay their cursor.
Do not use event-page `before`, `order`, or `limit` with streaming.
`snapshot.metadata` and `status.metadata` carry the same unfiltered metadata
projection; profile edits do not need an artificial fact to reach the card.

Analytics defaults to the last 24 hours and at most 365 days. The UI Historical
window offers 1, 7, 30, 90, and 365 days. Lead time measures matched reported
`item.created` to `item.completed` timestamps; unmatched completions are counted,
not assigned zero duration. It is not verified Done Done, utilization, causal
diagnosis, or realized customer value. Filtering does not change the canonical
board or journal.

## MCP contract

The stdio server negotiates MCP `2025-06-18` (also accepts `2025-03-26` and
`2024-11-05`) and implements initialize/initialized, ping, tool discovery/call,
resource discovery/read, and empty resource-template discovery. No logging is
written to stdout. Messages are bounded at 64 KiB.

| Tool | Arguments |
| --- | --- |
| `factory_overview` | Empty object |
| `factory_metadata` | Empty object; identical safe metadata projection to HTTP |
| `factory_events` | Same filters and pagination as HTTP events |
| `factory_analytics` | Same filters/window as HTTP analytics |

Tools return text JSON plus `structuredContent`, advertise read-only annotations,
and return `isError` for operational/query failures. Unknown tools/resources and
out-of-order initialization return JSON-RPC errors. Resources
`factory://<factory-id>/overview`, `/metadata`, `/events`, and `/analytics` expose identical
JSON read models. No arbitrary file resources, Factory controls, approval tools,
or network MCP endpoint exist. Consumers must treat all source text as untrusted.

## Persistence, coverage, and recovery

`events.jsonl` is the durable append-only source. Writers serialize via
`.write.lock`, fsync records, reject changed-content duplicate IDs and
cross-Factory events, and assign monotonic sequences plus collection timestamps.
Late events update history without rolling back newer entity state or hiding
stale source time. Event time over five minutes in the future is rejected.

Agents without execution access write uniquely named safe JSON files to `inbox`.
API/MCP readers validate and ingest them. Only successfully persisted/acknowledged
files are removed. Invalid files remain pending and are shown in coverage; raw
contents are never sent in error messages. Fix or remove only the specific
invalid emission under its owner's authority. More than 100 pending emissions
are drained over successive passes. Inbox inputs and locks are transient and
ignored by Git; review and version the sanitized journal, not raw inputs.

No raw prompts, tool payloads/results, or transcript scraping are enabled.
Summaries use an allowlisted schema, credential-pattern redaction, sensitive
artifact-path rejection, and inert text rendering. Pattern redaction is not a
guarantee against every secret format: producers must minimize/review data
before emission. Source identity is reported, not authenticated by JSON.

The journal is bounded at 32 MiB; individual emissions at 16 KiB. A full,
malformed, truncated, inaccessible, or linked journal fails visibly rather than
discarding records. Under the product's approved retention policy: stop affected
capture, preserve a privacy-safe archive and its sequence range/digest in Git,
resolve the writer/permissions/corruption, then explicitly resume with a
reconciled journal/cursor. This MVP does not silently rotate/delete evidence,
break stale locks, or repair partial records automatically. Do not truncate a
live journal; invalidated client cursors require a fresh snapshot.

An online center is not Factory liveness. Hook registration is not observed
capture. Bind actual sessions during launch/resume and verify the product hooks
under the active harness; opaque tool payloads/nested sessions require explicit
agent/skill/item emissions. Do not expose this loopback service beyond the local
OS-account trust boundary without adding a separately designed authenticated
hosting layer. No credentials or outbound telemetry are needed.
