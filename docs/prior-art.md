# Prior art and alternative approaches

Research date: September 23, 2026 local time. This review covers all four user-nominated projects plus additional public projects found through web and GitHub repository search. It distinguishes inspected implementation from advertised capability. No personal token, cookie or account content was submitted to another exporter or hosted service. No full third-party exporter was installed or run. One isolated function was exercised against synthetic responses, without networking.

## Findings that affect this project

The combination of PAT authentication, hosted export and a browsable offline ZIP already exists as a product proposition in Quip Rescue. SQLite plus external blobs and a PAT/cookie split also have concrete implementation precedents. We should reuse proven patterns and focus our additional effort on inspectable evidence: complete discovery, preserved raw responses, native identities when available, separate edit history, explicit feature coverage, resumability and documented portable data.

None of the inspected open-source capture paths establishes preservation of Quip's complete native section/version graph or every Live App operation. For hosted products whose code and archives were unavailable, those capabilities remain **unknown**, not demonstrated absent.

## Comparison

“Source” means targeted code inspection at the revision listed below, not a successful account export. “Claim” means public product documentation only.

| Project | Approach and evidence | What matters here |
| --- | --- | --- |
| [sonnenkern/quip-export](https://github.com/sonnenkern/quip-export) | Source: Node exporter/library; PAT, recursive folders, HTML or native Office files, images/files, rendered comments, relative links, ZIP | Best older rendering/link-rewriting reference; important discovery and message-pagination limitations |
| [bmakuh/quip-mass-exporter](https://github.com/bmakuh/quip-mass-exporter) | Source: small PAT-based script; private-folder recursion; HTML and Markdown | Minimal historical baseline, substantially narrower than an account archive |
| [socialcopsdev/quip-to-google](https://github.com/socialcopsdev/quip-to-google) | Source: fork of bmakuh; converts fetched HTML to DOCX | Does not use Quip's native DOCX endpoint or automate Google import |
| [Quip Rescue](https://quip-rescue.com/quip-export/) | Claim: hosted personal-account PAT export, ZIP, folders/chats/anchored comments/files and local browser | Closest product comparison; no inspected backend, archive schema or version-fidelity evidence |
| [GoldTechMx/quip-vault-exporter](https://github.com/GoldTechMx/quip-vault-exporter) | Source: local Python CLI/web UI, raw staging, SQLite job state, paginated comments, later Markdown rendering | Strongest inspected reference for separation of capture and rendering; narrower discovery/history than our goal |
| [wusuopu/QuipNoteExporter](https://github.com/wusuopu/QuipNoteExporter) | Source: SQLite metadata/HTML plus files, PAT capture and session-authenticated native downloads | Most relevant precedent for the proposed archive storage and later cookie adapter |
| [topmonks/quip-export](https://github.com/topmonks/quip-export) | Source: filesystem/Notion adapters, checkpoint JSON, V2 HTML, optional S3 image upload | Useful adapter separation; verified three-page HTML truncation bug to make a regression fixture |
| [yanxurui/quip-export](https://github.com/yanxurui/quip-export) | Source: recent-thread traversal, standalone HTML, persistent filename map | Good rename/collision examples; recent-thread enumeration alone does not establish broad access coverage |
| [mindactuate/quip-exporter](https://github.com/mindactuate/quip-exporter) | README: browser app, private/shared folders, HTML/Markdown/DOCX/images; Cloudflare Worker CORS proxy | Concrete browser-plus-Workers precedent; not proof of unattended hosted capture or Workers SQLite assembly |
| [Quip Export Tool extension](https://chromewebstore.google.com/detail/quip-export-tool/fjmpkbfjmkgmkcnkhmjdceijecldojjl) | Store claim: folder browser, filters and recursive Word/Excel downloads | Alternative UI/transport, with authentication mechanism and deeper fidelity unverified |
| [Export-Quip](https://www.export-quip.com/) | Marketing: enterprise export, anchored comments, links, permissions and revision history | Useful claims to test against real artifacts; no source or sample archive inspected |

## The four nominated projects

### sonnenkern/quip-export

The repository is MIT-licensed and was archived on August 30, 2026. Its current README says development has stopped; older search-index excerpts describing a forthcoming rewrite are stale. The tool supports readable exports with styling, embedded or external images, downloaded files and rewritten document/folder references. Native Office export and the HTML/comment path are alternatives rather than simultaneous archival representations. [Current README](https://github.com/sonnenkern/quip-export/blob/b4c7e61786af56319ef65641d6a17c4b56f4d47b/README.md).

The inspected code defaults to private, shared and group roots, with desktop/archive/starred/trash roots commented out. It accepts only document/spreadsheet thread types. `getThreadMessages` makes one request without pagination parameters; there is no separate edit-stream traversal in the processor. Its retry logic recognizes 503 and reads rate-reset headers. ZIP assembly calls `generateAsync` for a complete buffer, unsuitable as our large-artifact Workers strategy. [Processor](https://github.com/sonnenkern/quip-export/blob/b4c7e61786af56319ef65641d6a17c4b56f4d47b/lib/QuipProcessor.js), [API service](https://github.com/sonnenkern/quip-export/blob/b4c7e61786af56319ef65641d6a17c4b56f4d47b/lib/QuipService.js), [CLI packaging](https://github.com/sonnenkern/quip-export/blob/b4c7e61786af56319ef65641d6a17c4b56f4d47b/app.js).

Use it as a rendering and reference-resolution comparison, not a drop-in capture engine. Our archive retains all representations and raw messages before generating readable output.

### bmakuh/quip-mass-exporter

MIT-licensed, last repository push reported in April 2017. Its entry point starts at `private_folder_id`, recurses folders, fetches legacy thread HTML in batches, and writes HTML plus converted Markdown under title-based paths. The inspected entry point contains no attachment download, comment/edit collection, broad thread enumeration or durable checkpointing. [Source](https://github.com/bmakuh/quip-mass-exporter/blob/d3fe15e4ca680aed0859a16dfdc16b7f9e2bf1be/index.js).

It demonstrates a simple file-export flow, but the phrase “all documents” should be read in the context of its actual discovery roots. Our fixture suite should include archive-only, folderless and multiply placed threads, duplicate titles and filename collisions.

### socialcopsdev/quip-to-google

This is an MIT-licensed fork of bmakuh's exporter, with the last repository push reported in January 2019. It retains the private-folder traversal and substitutes `HtmlDocx.asBlob(html)` for the original HTML/Markdown writes. Its README instructs the user to import the resulting output folder into Google Drive; the inspected script does not call Google APIs. [Source](https://github.com/socialcopsdev/quip-to-google/blob/73eef7f71e0b893886dcba2ee8cbbcebdc3ad26a/index.js), [README](https://github.com/socialcopsdev/quip-to-google/blob/73eef7f71e0b893886dcba2ee8cbbcebdc3ad26a/README.md).

The distinction matters: wrapping HTML in DOCX is a conversion, not evidence of native DOCX or spreadsheet fidelity. Keep acquisition and destination conversion separate, and identify the producer of every representation.

### Quip Rescue

The public landing page offers Google sign-in for service access, followed by a Quip PAT. Its guide describes a ZIP containing documents/spreadsheets/slides where export is available, folder context, chats, anchored comments, message history, files and an offline Quip-like browser. It describes temporary hosted storage and manual deletion. Its stated scope is personal/free accounts and excludes organization-managed data. [Landing page](https://quip-rescue.com/), [guide](https://quip-rescue.com/quip-export/).

This is close to our phase 1 product, including capture before deciding on a destination. An offline browser is not required for our phase 1 scope; browsing is provided by the hosted explorer. An independent service session is also a useful pattern; Google sign-in is not equivalent to Quip OAuth.

No sign-in/export was performed. No public implementation or sample archive was found in this review. Exact retention, SQLite/schema availability, checkpoint semantics, native sections/diffs, Calendar coverage and cookie support remain unknown. Privacy/terms links were found, but retrieval failed; no precise policy is inferred. Do not present marketing “message history” as verified native revision history.

## Additional implementations worth studying

### GoldTechMx/quip-vault-exporter

Apache-2.0 repository, inspected at revision `762b10c`. Its implementation separates folder scan, API download to a disk raw store, link-map construction and local rendering. SQLite tracks document progress and errors. Comments retain raw message records and are paginated with inclusive timestamp overlap and ID deduplication. A local web UI exposes job controls. [Pipeline](https://github.com/GoldTechMx/quip-vault-exporter/blob/762b10c030f4e7d6ea8286a1e883126efa4a4458/src/quip_vault_exporter/pipeline.py), [raw store](https://github.com/GoldTechMx/quip-vault-exporter/blob/762b10c030f4e7d6ea8286a1e883126efa4a4458/src/quip_vault_exporter/cache.py), [state schema](https://github.com/GoldTechMx/quip-vault-exporter/blob/762b10c030f4e7d6ea8286a1e883126efa4a4458/src/quip_vault_exporter/state.py).

The inventory is folder-driven; its default roots omit trash/group roots and it does not supplement them with our broader visible-thread traversal. The message iterator does not request the edit stream and stops when a full repeated page yields no new IDs. That prevents a loop but does not prove exhaustive capture at a saturated timestamp. The inspected attachment stage takes document HTML as input, so message-only attachments need separate handling in our design. [Inventory](https://github.com/GoldTechMx/quip-vault-exporter/blob/762b10c030f4e7d6ea8286a1e883126efa4a4458/src/quip_vault_exporter/inventory.py), [message iterator](https://github.com/GoldTechMx/quip-vault-exporter/blob/762b10c030f4e7d6ea8286a1e883126efa4a4458/src/quip_vault_exporter/quip_client.py#L273), [downloader](https://github.com/GoldTechMx/quip-vault-exporter/blob/762b10c030f4e7d6ea8286a1e883126efa4a4458/src/quip_vault_exporter/downloader.py).

Adopt the capture-first/re-render-later pattern. Its operational SQLite is not the same contract as our normalized portable archive. README scale/performance claims were not independently tested.

### wusuopu/QuipNoteExporter

At revision `679ab31`, this Python project stores folders, threads, HTML/Markdown and blob metadata in `data/quip.db`, with blobs and native exports in separate directories. Commands stage folder traversal, thread capture, blob download and native export; a later script creates Obsidian output. [Schema](https://github.com/wusuopu/QuipNoteExporter/blob/679ab31dd205ba9b808ec8e0633ed18f4a8be784/app/model.py), [capture](https://github.com/wusuopu/QuipNoteExporter/blob/679ab31dd205ba9b808ec8e0633ed18f4a8be784/app/fetch.py).

The API client adds a session-backed download at `https://quip.com/-/{format}/{document_id}?download=1`; the export stage uses XLSX/PDF. This is a concrete web-download route to investigate later, not evidence of raw section/history capture or current success on our account. It uses the **document ID**, an important distinction from public secret paths and thread IDs. [Cookie export function](https://github.com/wusuopu/QuipNoteExporter/blob/679ab31dd205ba9b808ec8e0633ed18f4a8be784/app/quip.py#L800).

The schema lacks messages, edit groups and native section/version tables, and its traversal updates a single folder field on a thread. We need richer relationships and append-only observations. No top-level license was present in the inspected checkout; use it as research, with separate reuse review before copying code. No session endpoint was invoked in this review.

### topmonks/quip-export

MIT-licensed, revision `27dbec9`. It separates filesystem/Notion adapters, has optional S3 image handling, and saves queued folders/files plus adapter state to JSON on interruptions or exhausted rate headers. Its default root selection is private/group folders. [Capture and checkpoint source](https://github.com/topmonks/quip-export/blob/27dbec9f37cf7f54250aa4e3c7c13971e73c1c98/quip.js).

A targeted check found a real pagination defect: the V2 HTML function computes an accumulated string but passes only the latest response into recursion. An isolated test of that exact function with three synthetic pages `A`, `B`, `C` returned `BC`, making three calls and zero network requests. Two-page tests would miss this defect. [Function](https://github.com/topmonks/quip-export/blob/27dbec9f37cf7f54250aa4e3c7c13971e73c1c98/quip.js#L385).

Adopt independently testable adapters and fixtures of at least three pages. Keep every response page separately so a concatenation bug is repairable without calling Quip again. S3/Notion delivery remains phase 2 territory; external asset URLs are not our durable archive format.

### Other leads

- **yanxurui/quip-export:** inspected revision `b2b5107`. Uses the recent-thread endpoint with timestamp traversal, standalone HTML and a persistent title/ID filename map for renames and collisions. Useful filesystem lessons, but no broader discovery, message/history or blob acquisition was found in the export path. No top-level license found. [Source](https://github.com/yanxurui/quip-export/blob/b2b51077c0d6d6ae9890133cc5a2088a0a531739/quip_exporter.py).
- **mindactuate/quip-exporter:** README describes a browser app and Cloudflare Worker CORS proxy, with HTML/Markdown/DOCX/images from private/shared folders; explicitly excludes trash/starred traversal. Source behavior, proxy deployment and scale were not audited. This is evidence for a browser/Worker architecture precedent, not a solution to our packaging/resumability requirements. [README](https://github.com/mindactuate/quip-exporter).
- **raglin/quip-export:** README advertises PAT setup, URL-seeded exports, native/HTML/Markdown formats, preview and resume, using npm package `@anthragz/quip-export`. Its older clone links point at a different repository owner. Implementation was not audited; retain as a UX/reference lead. [Repository](https://github.com/raglin/quip-export).
- **Quip Export Tool:** store listing advertises folder navigation, filtering and recursive Word/Excel download. Version 0.2.6 was listed as updated March 1, 2026. No installation or credential mechanism inspection. An extension is a possible later session transport, not evidence that this one captures internal models. [Publisher listing](https://chromewebstore.google.com/detail/quip-export-tool/fjmpkbfjmkgmkcnkhmjdceijecldojjl).
- **Export-Quip:** claims anchored comments, revision history and spreadsheet formulas, but the inspected site still advertises beta registration. No delivery status or fidelity was verified. Its blanket assertion that native exports strip comments is too broad for our design: the official bulk-export contract includes `include_conversations`. Treat vendor claims as test cases. [Site](https://www.export-quip.com/), [official bulk-export reference](https://quip.com/dev/automation/documentation/current#operation/createBulkExportRequest).

## Official approaches and a useful Live App clarification

Quip's November 2020 release notes explicitly describe Live App HTML export/reinitialization, including Calendar, Kanban and Project Tracker. This predates most retirement tooling and is a reason to inspect official HTML before assuming an internal API is needed. [Release notes](https://quip.com/release-notes/2020-11-17).

The Live Apps SDK documents `quip.apps.setPayload`: the app supplies a string that is stored and exported through `data-live-app-payload`, and made available during initialization. This identifies a supported app-defined export mechanism. It does **not** guarantee a lossless dump of all native records, or establish Calendar's refresh timing. Our observed native-record versus payload distinction remains valid. [Payload contract](https://quip.com/dev/liveapps/1.x.x/reference/global-actions/setting-payload/).

The official retirement guidance also points to per-document export, API/bulk export and Slack conversion. These are baseline comparisons, not substitutes for preserving source history and relationships. Salesforce's Live App retirement article suggests PDF as a static visual fallback for selected retired apps. Preserve such an export as another representation with explicit limitations, not as structured Live App data. [Retirement guidance](https://help.salesforce.com/s/articleView?id=005299603&language=en_US&type=1), [Live App retirement](https://help.salesforce.com/s/articleView?id=005036576&language=en_US&type=1).

The user's original [baqup sample](https://github.com/quip/quip-api/tree/master/samples/baqup) remains a historical baseline already covered in the design. No exporter in this review changes the decision to capture once and leave destination migration for later.

## Design changes and reuse recommendation

1. **Make link resolution explicit.** Record source URL/alias, target thread/folder/section, resolution outcome and observation. Preserve original links; derive links to captured content only in hosted previews. Excluded, inaccessible and undiscovered targets stay visibly unresolved instead of silently pointing to a broken hosted URL.
2. **Retain separate capture and rendering.** A preview or converter bug must be fixable from saved observations; it must not require another source export. Adopt patterns from the raw-staging projects rather than their exact schemas.
3. **Strengthen regression fixtures.** Three-plus HTML pages; repeated full timestamp pages; more than one page of comments and edits; file attached only to a message; archived/trash/folderless threads; duplicate titles; multi-placement; unresolved section anchors; native export versus HTML conversion; pause/retry during blob and bundle writes.
4. **Handle Quip's 503 throttling explicitly.** Both older and newer exporters implement it, and the current OpenAPI defines a 503 rate-limit response. Distinguish throttling from general service failures using response information; honor reset headers and retain 429 handling too. This is a documented case, not one we triggered against the account.
5. **Keep cookie work targeted.** Compare session-backed native exports against official API files on fixtures with identified gaps. A cookie-enabled file download does not itself recover the native section/history graph.

Recommendation: build a small preservation core around the documented archive contract, using these projects as implementation references and comparison tools. No inspected project is a drop-in match for hosted Workers execution plus our evidence/coverage model. Selective reuse of MIT/Apache-licensed code is possible with attribution and compatibility review; no third-party implementation code has been added to this repository.

## Reproducibility

| Repository | Inspected revision | Evidence depth |
| --- | --- | --- |
| sonnenkern/quip-export | `b4c7e61786af56319ef65641d6a17c4b56f4d47b` | README, processor, API service, packaging |
| bmakuh/quip-mass-exporter | `d3fe15e4ca680aed0859a16dfdc16b7f9e2bf1be` | Entry point and README |
| socialcopsdev/quip-to-google | `73eef7f71e0b893886dcba2ee8cbbcebdc3ad26a` | Entry point and README |
| GoldTechMx/quip-vault-exporter | `762b10c030f4e7d6ea8286a1e883126efa4a4458` | Inventory, client, state, staging/download, comments, rate handling |
| wusuopu/QuipNoteExporter | `679ab31dd205ba9b808ec8e0633ed18f4a8be784` | Schema, capture, commands, session-download function |
| topmonks/quip-export | `27dbec9f37cf7f54250aa4e3c7c13971e73c1c98` | Capture/adapters/checkpoint flow; synthetic pagination check |
| yanxurui/quip-export | `b2b51077c0d6d6ae9890133cc5a2088a0a531739` | README and exporter |

Public checkouts and fetched pages are under `/tmp/quipisdead-prior-art`. They are research inputs, not dependencies. GitHub metadata reflects the inspection date; last push dates are not proof of maintenance quality or current runtime compatibility.
