# Official API research: personal account

Observed September 23, 2026 local time (September 24 UTC). Used the user-supplied PAT for read-only GET requests against `https://platform.quip.com`. This is an inventory and representative sampling exercise, not a complete export. No source documents were modified and no OAuth client was required.

Private response bodies, native export samples and probe scripts are outside the repository in `/tmp/quipisdead-private-research`, with restricted local permissions. The token remains at the supplied path; it is not copied into these documents or response files. These temporary research files are not the archival product and are not durable backups. The seven-day hosted retention policy will be implemented by the app; it is not an existing cleanup mechanism for these local research files.

## Account discovery

| Observation | Result |
| --- | --- |
| Current user | Five special root IDs (desktop, archive, starred, private, trash) and eight shared roots |
| Visible-thread traversal | Nine pages, 100 results per full page, 885 distinct threads, final empty cursor |
| Discovery parameters | `required_access_level=1`, `include_ofbwg=true`, `last_modified_after_usec=0`, `threads_meta=true`, `limit=100` |
| Listing types | 769 `TEXT_DOCUMENT`, 92 `SPREADSHEET_DOCUMENT`, 19 `CHAT`, three `OTHER`, two `SLIDES` |
| Listing deletion flag | All 885 had `is_deleted=false`; this is not evidence that no trash/deleted content exists |
| Root and recursive folder traversal | 68 distinct folders, including 55 additional recursive requests; no failed folder reads or remaining child-folder work |
| Folder thread membership | 884 distinct threads, all found in the listing; one listing-only `OTHER` thread |
| Multiple placements | 24 threads occurred in more than one returned folder, including special roots |
| Listing updated timestamps | Spanned 2016–2026; this does not measure earliest creation/history |

`/1/users/current/threads` was also sampled for its first page; only the broader visible-thread endpoint was fully paginated. Folder traversal followed returned child-folder IDs from the current user's roots. It did not exhaust every thread's `/folders` endpoint, every alternative discovery source, company administration interfaces, or unknown URL-only shares. “Everything accessible” still requires the multi-source discovery plan and explicit coverage reporting.

Folder responses carry `folder`, `member_ids`, `children` and `linked_from_folder_ids`. Children use `thread_id` or `folder_id`, with `added_usec`. Folder metadata can have `parent_id`, `inherit_mode`, class/type, timestamps and link/secret path. Keep links, containment and permission inheritance distinct; do not derive all relationships from a single parent field.

## Calendar: public HTML is richer than a placeholder

Fixture: [London February 2026 Sketching](https://quip.com/VtYCAiS9wab3/London-February-2026-Sketching). Native comparison: [Calendar model research](calendar-model-research.md).

`GET /2/threads/{secret_path}/html` returned a complete single page, with 35,887 HTML characters and an empty next cursor. It contains:

- The Calendar body section ID, a `data-unique-id` combining section/local identity, and `data-live-app-id` matching the inspected app configuration.
- `data-live-app-payload`: JSON containing `displayMonth` and 18 events with `color`, `dateRange`, and `content`.
- Eighteen rendered event table rows, each with `data-live-app-section-id`, color/background-color attributes, and cells for content, start date and end date.
- Exactly one matching row per payload event when comparing whitespace-normalized text, exact color, start date and end date. This establishes agreement between two API representations, not independent verification of all native event records or payload freshness.

The HTML contains 246 `id` occurrences but only 154 distinct ID strings across the whole document. The native inspector listed 218 section entries. Neither HTML count can be treated as a native section count. Preserve repeated occurrences, HTML-specific structure and custom identity attributes; do not rely solely on a DOM ID lookup.

The body payload itself omits event section IDs, while rendered rows supply them. Thus, an exporter which saves only the JSON payload loses identities available in the same API response. Conversely, HTML does not expose the complete native collection/record/rich-text graph, original body `json_data`, all local IDs, creation metadata or native version fields as inspected records.

`GET /1/messages/{thread_id}?message_type=edit&count=100` returned 11 edit messages. The exact title-edit message inspected in the debugger is present, including its section-targeted RTML insertion and diff grouping. Its API record omits native `version_before`, `version_after`, `sequence_before`, `sequence_after` and `edited_section_ids`. Ordinary-message capture for this document returned an empty list.

Re-querying edit messages with `max_created_usec` equal to the oldest returned timestamp yielded that oldest message again. This confirms an inclusive boundary in this fixture. It does not test more than 100 messages sharing a boundary timestamp. Deduplicate overlapping pages and retain an explicit ambiguity outcome for unsplittable ties.

## Spreadsheet representations complement one another

Sampled two spreadsheet threads selected at opposite ends of listing update time. Both V2 HTML requests and direct XLSX downloads succeeded. Both ZIP containers passed entry CRC checks; this verifies download/container integrity, not spreadsheet fidelity.

| Feature | Earlier-updated sample | Later-updated sample |
| --- | --- | --- |
| HTML tables / XLSX sheets | 1 / 1 | 2 / 2 |
| XLSX populated cell records | 93 | 598 |
| XLSX formula cells | 0 | 156 |
| XLSX formula cells with cached `<v>` values | 0 | 0 |
| API `spreadsheet_summary.has_charts` | false | true |
| XLSX chart XML parts | 0 | 0 |

The formula-bearing HTML has 156 `formula` attributes, all associated with nonempty displayed text. Its markup also exposes cell-format attributes and frozen-row metadata; some cells expose raw-content attributes. Preserve these attributes and rendered values in addition to XLSX formulas. No recalculation or cell-by-cell mathematical validation was performed.

The chart-bearing sample has no chart XML parts in XLSX, and its HTML consists of headings, tables and text rather than an obvious chart representation. This is a concrete representation gap to compare against the UI, not proof of which chart visuals/data are recoverable through every export format. The explorer should flag the mismatch between source metadata and captured representations. Do not claim the chart is preserved merely because HTML and XLSX succeeded.

## Conversations, comments and files

A sampled chat returned 13 ordinary messages. Exposed message fields included IDs, author identity/name, creation/update times, visibility, text and files. Three file references across that sample used `name` and `hash`; one was fetched through the official blob endpoint using its source hash and thread ID. It returned a complete 24,727-byte PNG with a recorded SHA-256 digest. The source `hash` remains an opaque blob identifier, separate from the archive's computed digest.

The second recent text-document sample returned three ordinary messages, all with annotations containing `id` and `highlight_section_ids`. Preserve annotation records verbatim; reply grouping, resolution state and reaction coverage still need dedicated fixtures. Empty message arrays in other samples were valid successful responses and must not be confused with request failures.

A sampled listing entry typed `OTHER` resolved through V2 metadata as `CHAT`. Requesting its HTML returned 404 with “Thread has no document,” while ordinary messages returned a successful empty list. Content acquisition must follow resolved capabilities and preserve this distinction; it must not treat every listing entry as a failed text document.

## Contracts versus observed behavior

- Listing type strings differ from V2 metadata (`TEXT_DOCUMENT` versus `DOCUMENT`, `SPREADSHEET_DOCUMENT` versus `SPREADSHEET`). Preserve raw enums and map them deliberately.
- `owning_company_id`, nominally required in the inspected thread schema, was absent in personal-account responses. Parsers must tolerate missing fields while preserving raw bytes and recording useful diagnostics.
- Rate headers reported a user limit of 1,000 with a minute reset and company limit of 600. This differs from the published 50/minute user default. An hourly limit was not measured. Honor live headers and documented 503 throttling responses (as well as 429) without assuming every account has the same quota.
- Epoch zero was accepted by broader visible-thread discovery on this account. This does not demonstrate identical company/open-folder behavior on enterprise accounts.

The probe used explicit API-origin authorization and did not follow redirects automatically. No session cookie was needed. No bulk export jobs, DOCX/PDF exports, member pagination, reactions, inaccessible/deleted history or internal HTTP endpoints were tested.

## Design consequences

1. Ship PAT-first; OAuth availability need not block the public app.
2. Keep a folder graph plus discovery-only objects. Preserve every placement and provenance.
3. Store raw responses before parsing. The archive inspector should reveal source discrepancies rather than hide them behind normalized output.
4. Give Calendar a useful API-only preview and identifier mapping, while labeling native graph/history gaps.
5. Save both HTML and XLSX, including custom attributes. Formula values and charts need feature-specific coverage.
6. Test native versions, Calendar operations and chart preservation in later acquisition research. Avoid promising universal full fidelity from these successful API calls.

Endpoint contracts were checked against the [current Quip Automation API specification](https://quip.com/dev/automation/documentation/current/openapi-specs). Account observations above come from direct authenticated requests, not claims in that documentation.
