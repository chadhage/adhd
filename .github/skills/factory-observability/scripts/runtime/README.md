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

The UI provides live facts, pausing the **view** without stopping capture, search,
severity and entity filters, older records, fact details, and descriptive
analytics with explicit sample sizes and limitations. No synthetic facts replace
missing data. Loading, offline, stale, unknown, and ingestion-error states differ.
Source age continues to advance while disconnected. Dialogs have explicit
keyboard dismissal, and facts arriving during a history request are retained.
Revalidation preserves the existing label/freshness configuration; amend
`center.json` under the product owner's review rather than silently resetting it.

## HTTP API

Only `GET` is supported. Responses are JSON except the UI/assets and SSE.

| Route | Result |
| --- | --- |
| `/healthz` | Service readiness and separate Factory freshness/coverage; 503 for rejected inbox emissions or unreadable/corrupt records |
| `/api/v1/schema` | JSON Schema for emitted facts |
| `/api/v1/overview` | Whole-Factory observed entities, latest 100 facts, source freshness, coverage, errors, and last sequence |
| `/api/v1/events` | Ordered journal page with `next_cursor`, `has_more`, `last_sequence` |
| `/api/v1/analytics` | Up to 31 days of descriptive counts, 24 time buckets, role/skill facts, matched reported lead time, and rule-based insights |
| `/api/v1/stream` | SSE `snapshot`, `fact`, `status`, and `capture-error` events |

Events and analytics accept `agent_id`, `skill`, `item_id`, `kind`, `severity`,
`q`, `from`, and `to`. Time filters use ISO 8601 with timezone. Events support
`limit` (1..500, default 100), `after` (exclusive forward sequence), `before`
(exclusive earlier sequence), and `order=asc|desc` (default asc). Do not combine
`before` and `after`. The next page uses `after=next_cursor` for ascending pages,
or `before=next_cursor&order=desc` for descending pages. Invalid, duplicate,
unsupported, or cross-journal cursors fail explicitly. Overview/health/schema
describe the whole Factory and accept no filters.
Analytics rejects event pagination arguments instead of silently ignoring them.

SSE accepts the fact filters and an optional `after` sequence. It sends a current
snapshot, then matching facts after that cursor. Without a cursor it tails new
facts. A browser's validated `Last-Event-ID` overrides the original URL cursor
on reconnection. Sequence IDs are per Factory. It sends status updates without
inventing Factory heartbeats. Up to 20 streams and a 2 MiB outgoing buffer per
stream are supported; slow consumers disconnect and can replay their cursor.
Do not use event-page `before`, `order`, or `limit` with streaming.

Analytics defaults to the last 24 hours. Lead time measures matched reported
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
| `factory_events` | Same filters and pagination as HTTP events |
| `factory_analytics` | Same filters/window as HTTP analytics |

Tools return text JSON plus `structuredContent`, advertise read-only annotations,
and return `isError` for operational/query failures. Unknown tools/resources and
out-of-order initialization return JSON-RPC errors. Resources
`factory://<factory-id>/overview`, `/events`, and `/analytics` expose identical
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
