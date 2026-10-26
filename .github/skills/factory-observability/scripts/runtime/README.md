# Factory Operations Center runtime

This standalone product-owned instance observes one Factory. It does not need
ADHD on its module search path, an npm install, a cloud account, or a database
service. Node.js 22.21+ and the product's reviewed local files are sufficient.
Never run an instance from the reference/framework source directory.
Artifact content/history access additionally requires local Git. It never
fetches remote objects or executes repository filters or fsmonitor hooks.

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

### Responsive layout

The UI supports viewports from 320 CSS pixels through desktop widths. The fixed
desktop sidebar scrolls independently on short windows and becomes an in-flow
navigation grid on tablets and phones. Metric grids reduce to two columns and
then one; filters, panel actions, metadata, dialogs, and artifact panes reflow
without page-level horizontal scrolling. Long identifiers and paths wrap.
Artifact source previews retain their own scrollable area for unwrapped code.
Phone and tablet controls have a minimum 44-pixel height. The comparison chart
redraws at its actual container width so axis labels remain readable on resize.

For browser regression checks, exercise Live and Historical with both facets,
expanded metadata, fact/MCP dialogs, and the Artifacts list and reader at 320,
375, 480, 760, 768, 1024, and 1440 CSS pixels, including a short desktop window.
Confirm the measured viewport matches the requested width, the document's
`scrollWidth` does not exceed `clientWidth`, controls and labels are not clipped,
and long synthetic identifiers do not widen panels. Check keyboard navigation,
dialog dismissal, and a 320-CSS-pixel reflow equivalent to 400% zoom on a
1280-pixel-wide viewport. Internal code-preview scrolling is intentional;
browser checks do not establish full assistive-technology compatibility.

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

## Factory artifact library

Open **Artifacts** to browse documents, source code, evidence, reports, data,
images, archives, and other Factory outputs. Search by title/path/producer,
filter by category, inspect provenance, and select **Current working file** or
a recorded Git commit. Text/code/Markdown/JSON/HTML/SVG are displayed as inert
sanitized text, not rendered as active content. Text is paged without splitting
UTF-8 characters. PDF/Office/image/archive and other binary formats use an
explicit download rather than plugins, scripts, or macros.

The inventory is the union of Factory `item.*` reports with `item.type=artifact`
and a reviewed product-owned `artifacts.json` catalog in this center. It is not
an indiscriminate repository scan. Reports alone never authorize reading their
paths: **Reported only** entries retain provenance but need a catalog entry
before preview/download. Unsafe report paths are excluded with an explicit
coverage count. Empty inventory is not proof that the Factory produced nothing.

The designated product record owner maintains this catalog as a reviewed
view/export of the canonical artifact index, not a competing authority. Record
the canonical index in `source`, preserve access/retention restrictions, and
reconcile every in-scope document, source file, research output, decision,
evidence record, and generated deliverable. The catalog is an allowlist for this
local viewer, not general business approval or a host permission grant.
Populate it during launch/resume and update it as outputs are produced.

```json
{
  "version": 1,
  "factory_id": "example",
  "source": { "ref": ".docs/records-index.json", "revision": null },
  "updated_at": null,
  "artifacts": [
    {
      "path": "docs/report.md",
      "title": "Factory report",
      "category": "report",
      "producer": null,
      "source_ref": null,
      "commits": []
    }
  ]
}
```

Categories are `document`, `source`, `evidence`, `report`, `data`, `image`,
`archive`, and `other`. Paths are relative to the actual product Git root,
never the reference checkout or a root taken from profile text. `commits`
contains only full locally available commit IDs recorded for that exact artifact,
not branches, arbitrary revision expressions, or client-selected Git objects.
Historical reads use the cataloged path in that commit, including when the
working file was deleted. Git link blobs are refused. Missing local objects and
unmaterialized LFS pointers remain explicit gaps; no fetch or external filter
is attempted. Current files may be untracked/uncommitted: the viewer does not
certify Git tracking, acceptance, or Done Done.

Repository bindings use native canonical paths so equivalent Windows path
casing resolves to the same product root without weakening link or cross-root
checks.

Use installer `--artifacts <reviewed-catalog.json>` to explicitly replace the
catalog with a validated/redacted snapshot. Otherwise resume preserves existing
bytes; missing older catalogs are initialized empty with coverage gaps rather
than guessed from unrelated files. Runtime 1.2.0 upgrades 1.0.0/1.1.0 centers
without replacing their profiles, journals, settings, or catalog records.
Invalid existing catalogs block replacement until their owner repairs them.
Use atomic replacement for live catalog edits.

Content access rejects traversal, absolute/UNC/drive paths, alternate data
streams, sensitive/credential files, observation control files, ignored paths,
symlinks/junctions, hard links, and non-files. The catalog is bounded at 2 MiB
and 10000 entries, each with at most 100 recorded commits. Artifact content is
bounded at 10 MiB; larger files remain listed but return a clear content-limit
error. Preview sections default to 16 KiB with a 64 KiB maximum.

Text previews and downloads use the shared credential redactor, including URL
credentials/query/fragment. The response distinguishes original SHA-256 from
sanitized text SHA-256; sanitized downloads are not an exact copy of original
bytes. Binary downloads preserve the cataloged bytes and cannot be semantically
redacted: the record owner must review their sensitivity first. All downloads
are attachments under `application/octet-stream`, `nosniff`, and sandbox CSP.
Treat every downloaded file as untrusted; do not execute source or enable macros.

The list refreshes every five seconds while visible, on new facts, and through
**Refresh artifacts**. Preview content is read only after selection, version
change, or section navigation; it is not silently replaced while being read.
Missing, inaccessible, oversized, binary, reported-only, and invalid-catalog
states have explicit messages. Browsing never edits artifacts or changes boards.

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
| `/api/v1/artifacts` | Factory-scoped inventory, catalog provenance, and discovery gaps |
| `/api/v1/artifacts/<id>` | One artifact's metadata and recorded versions |
| `/api/v1/artifacts/<id>/content` | A bounded sanitized UTF-8 text section |
| `/api/v1/artifacts/<id>/download` | Explicit safe attachment; sanitized text or reviewed binary |

Artifact-list parameters are `q`, `category`, `offset`, and `limit` (1..200,
default 50). Content accepts `revision` (`working`, or a full commit ID present
in that artifact's catalog record), UTF-8 byte `offset`, and `limit` (1..65536,
default 16384). Follow `next_offset` for complete text. A non-boundary offset
or a limit too small for the next character is rejected, not silently corrupted.
Downloads accept only `revision`; metadata accepts no query parameters.
Artifact IDs are Factory-specific opaque IDs returned by the inventory.
No endpoint accepts an arbitrary filesystem path.

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
| `factory_artifacts` | Same search/category/pagination as the artifact inventory |
| `factory_artifact` | Required `artifact_id`; metadata and recorded versions |
| `factory_artifact_content` | Required `artifact_id`; optional `revision`, `offset`, `limit` |

Tools return text JSON plus `structuredContent`, advertise read-only annotations,
and return `isError` for operational/query failures. Unknown tools/resources and
out-of-order initialization return JSON-RPC errors. Resources
`factory://<factory-id>/overview`, `/metadata`, `/events`, `/analytics`, and `/artifacts` expose identical
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
