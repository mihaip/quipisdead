# Quip archive: phase 1 PRD

Status: discussion draft, reorganized September 30, 2026. This document owns product scope, user experience, requirements and release acceptance. The [technical design](phase-1-design.md) covers acquisition, authentication, archive schema, architecture and implementation validation. Research supporting these requirements was performed September 23, 2026; see [API research](api-research.md), [Calendar model research](calendar-model-research.md) and [prior art](prior-art.md).

## 1. Product and scope

Build a public web app that lets a Quip user capture their accessible data into a durable, documented, downloadable archive. Preserve source representations and relationships so future importers can work without contacting Quip. Phase 2 destination integrations are out of scope.

The first release uses the official Automation API. Full fidelity is the overall goal; the release must accurately report its capture coverage rather than equate successful requests with complete preservation of everything in the UI. Subsequent phase 1 work can add desktop-cache and internal-web-API acquisition without replacing the archive format.

Confirmed preferences:

- Hosted export with automatic deletion seven days after completion.
- One complete, resumable export; recurring or incremental synchronization is not required.
- Capture everything accessible, with folder and workspace exclusions available.
- Prioritize a few first-party Live Apps, especially Calendar; arbitrary third-party app decoding is not a requirement.
- Prefer Cloudflare Workers-only hosting; Containers are not part of the baseline.
- One downloadable ZIP containing SQLite plus separate attachment/blob files is accepted.
- Personal access tokens are the primary connection method. OAuth is optional future work; reserve a session-cookie supplement for later phase 1 acquisition.
- Include a high-level folder/document explorer and a low-level captured-data inspector in the web app.
- The initial real-world account has approximately ten years of history and broad feature usage. A desktop cache is available for later investigation; account scale and fidelity findings are documented in the technical design and research notes.

The retirement deadline varies by account. Salesforce identifies March 1, 2027 as the end of renewals and March 31, 2027 as the access cutoff for free users; paid access follows the applicable subscription term. The app should ask users to check their own deadline. [Salesforce retirement notice](https://help.salesforce.com/s/articleView?id=005299603&language=en_US&type=1).

### Success criteria

1. A user can start an export, close the tab, return later, and resume after recoverable errors without discarding saved data.
2. Every discovered, in-scope item has a capture result or an explicit failure/limitation. A failed attachment cannot silently become a successful document.
3. The archive includes source IDs, folder relationships, available content, conversations, edit messages, referenced files, and provenance.
4. The download works without Quip, this service, or expiring remote attachment URLs.
5. An advanced user can inspect the schema and write an importer using standard SQLite and file tooling.
6. Users can browse folders and document previews, inspect threads/sections/messages/diffs and raw source observations, download partial results, and delete hosted data.

Non-goals for this release: a bundled offline reader, destination imports, a Quip editor replacement, recurring backup, organization-wide admin/eDiscovery export, arbitrary third-party Live App decoding, and a guarantee that every historical document revision can be replayed.

### Prior art and product focus

A hosted PAT-based rescue archive with an offline browser is already described by Quip Rescue. Open-source projects also demonstrate raw staging, SQLite progress tracking, separate blobs, local previews and session-authenticated file downloads. Our useful contribution is an inspectable preservation contract: broad discovery, raw observations, distinct message/edit streams, native identities when available, and explicit fidelity gaps. The detailed [prior-art review](prior-art.md) separates verified code behavior from product claims; none is assumed to be a ready-made capture engine for this scope.

## 2. User experience

**Connect.** Explain what is captured and when hosted data expires. Accept a personal API token and validate the connected account. Keep credentials out of URLs and browser persistent storage. Store the resulting Quip identity independently of the credential so renewed credentials cannot silently switch accounts. Show concrete API capability failures rather than rejecting a personal account based on plan assumptions.

**Discover.** Inventory all accessible roots and threads, including company/open-folder content, identify document types and known feature risks, and estimate work. Show where discovery is still running. Let the user exclude folders or workspaces before body capture. Keep the scope manifest explicit and preserve excluded-item dispositions. Proposed exclusion rule: an explicit exclusion wins even when the same document is also found in an included folder; show these overlaps before capture so the scope is understandable.

**Export.** Show phase, discovered/captured counts, bytes, errors, rate-limit waiting, and items needing renewed access. Avoid a misleading percentage before discovery finishes. Allow pause, resume, cancel, and download of captured data. Closing the tab does not pause hosted execution.

**Explore and download.** Make the captured-data explorer available during capture and throughout retention. Present folder browsing, sanitized document previews, conversations and edit history, an object inspector, and a coverage report. Distinguish “finished collecting available API data” from “full fidelity verified.” A document with unsupported Live App state remains visibly incomplete even if its HTML download succeeded.

**Delete.** Show the expiration date before export and beside each download. Confirmed: retain captured data, previews and downloads for seven days after completion. Proposed: delete credentials when collection/reconciliation ends, and expire abandoned or paused runs after fourteen days of inactivity. Ordinary browsing/downloads do not reset completion expiry. Show abandoned-run expiry explicitly; resuming collection can renew that inactivity deadline. Pausing does not retain data indefinitely. Explicit deletion immediately revokes access and schedules removal of artifacts, capture objects, operational state, and any active multipart uploads. Document any platform backup retention separately.

The exporter performs no source-content edits, sharing changes, restore operations, or “mark as moved” updates. Creating export jobs is allowed because it does not alter source documents.

### Archive explorer (required in v1)

The explorer reads the same saved observations and object hashes that feed the bundle. It must work after the Quip credential has been deleted, and browsing must not silently fetch fresh Quip content. Every page displays the capture status and observation time; partial capture and a genuinely empty object look different.

| View | Required behavior |
| --- | --- |
| Folders | Expand the captured graph, preserve empty folders and multiple placements, show breadcrumbs for the current path, and distinguish special roots such as starred/archive/trash from ordinary containment. Include an unfiled/discovery-only view. Exclusions and inaccessible children remain visible as dispositions without fetching excluded bodies. |
| Documents | Title/author/source link, sanitized captured HTML, local attachment references, available DOCX/XLSX/PDF downloads, and a feature-level coverage panel. Link a preview section to its inspector entry. Long documents load incrementally. |
| Spreadsheets | Read-only tables using captured HTML/display values, with available formula/format attributes exposed in the inspector. Preserve XLSX separately. Do not recalculate formulas or imply charts are preserved because a spreadsheet export succeeded. |
| Calendar | Read-only event list or table using captured dates, text and colors, linked to exposed event section IDs. A calendar grid is optional; native app execution is out of scope. |
| Conversations and edits | Separate ordinary messages from edits; show authors/times, exposed annotations and reactions, and safe diff rendering. Unresolved or deleted section targets remain selectable. Never invent historical versions from current section content. |
| Object inspector | Filter by entity kind, source ID, acquisition source and coverage state. Inspect threads, sections, messages, edit groups, relationships, app payloads, and raw JSON/HTML/RTML. Show source bytes as inert text, parsed fields, provenance, references, and raw downloads. Native-only fields are marked unavailable in API-only captures. |
| Coverage | Filter failures, unsupported features, exclusions and representation mismatches; jump directly to relevant objects. Compare parsed output with its raw observation and list parser warnings. |

Support paginated title/ID lookup, type and status filters, and bounded relationship traversal initially. Full-content search is useful but not a release dependency. Unrestricted SQL against the live operational database is out of scope. Advanced users can query the downloaded SQLite themselves.

## 3. Privacy and data lifecycle requirements

Hosted capture gives the service access to document content; do not imply end-to-end encryption. Hosted archives and previews must be private to their users. Credentials must not appear in downloads or logs, and previewing captured content must not execute source scripts or automatically load remote resources. Preserve original content separately from sanitized previews and record any credential redactions.

The confirmed seven-day retention window and proposed abandoned-run expiry are described in the user flow above. Explicit deletion must prevent further access and eventual recreation by ongoing work. Platform backup retention must be disclosed separately.

## 4. Release acceptance

Release acceptance requires a documented schema, an independently usable bundle, resumability under failure injection, explicit coverage of every discovered item, and no unexplained gaps in the controlled fixture set. Real-account gaps can be reported honestly; a universal full-fidelity claim is not required for a useful first release.

Explorer acceptance: navigate a multiply placed document through both paths; inspect a Calendar event and its matching edit target; inspect spreadsheet formula and displayed value; explain a missing chart or inaccessible attachment from the coverage panel; trace each view back to the bundle's exact source object. Run these checks with the Quip credential removed.

The [technical validation and delivery plan](phase-1-design.md#10-validation-and-delivery-plan) defines the fixtures, failure injection and pilot needed to establish these outcomes.

## 5. Proposed defaults and open product decisions

The confirmed requirements are listed in Product and scope. OAuth and Containers are not release prerequisites.

Proposed defaults to carry forward: exclusion wins across multiple placements; independent recovery credential for returning users; fourteen-day inactivity expiry for abandoned jobs. These can be adjusted during product review without blocking the preservation work.

Decide whether email/account recovery is worth adding before public launch. Public budgets and size limits remain unset pending the account pilot and packaging measurements in the technical design. Do not advertise unbounded account sizes before a supported large-index path exists.
