# Project guidance

## Product context

This app preserves Quip data in a downloadable archive and lets users inspect captured data in a hosted explorer. Product requirements live in [`docs/phase-1-prd.md`](docs/phase-1-prd.md); architecture and research decisions live in [`docs/phase-1-design.md`](docs/phase-1-design.md).

## Architecture documentation

- [`docs/architecture.md`](docs/architecture.md) is the high-level overview and trail map of the currently implemented system. Read it when orienting yourself in the codebase, and update it as part of major changes to runtime structure, component boundaries, shared patterns, or trust/data flows. Keep it grounded in the current code; omit future plans and abandoned or irrelevant historical state. Product proposals and design rationale belong in the PRD and design doc.
- Keep the architecture doc stable: it should change infrequently. Describe patterns that apply across the codebase, and link to sources for details. Avoid inventories of individual hooks/components, exhaustive HTTP contracts, schema duplication, implementation walkthroughs, and commands already documented in the README. If routine code changes require doc updates, the doc is too detailed.

## Technology and design preferences

- Prefer simple, boring, familiar technology that is easy to understand, debug, and change. React and Vite are familiar to the maintainer.
- The chosen stack is a client-rendered React/Vite SPA with a Hono API on Cloudflare Workers. SSR is not a requirement. Do not introduce Next.js or switch to a full-stack framework without discussing the change.
- Roughly follow the official [Cloudflare Hono guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/hono/), using Cloudflare's Vite plugin and standard tooling where applicable.
- Prefer Workers-only hosting. Start with a simple deployment structure and split Workers when concrete execution or configuration needs justify it.
- Use strict TypeScript and preserve type safety across client/server boundaries. Prefer Hono's typed client and inferred request/response types over duplicated interfaces, unchecked casts, or hand-maintained clients.
- Assume the frontend and Worker API stay in sync, with any version compatibility handled transparently at the deployment or API boundary. Trust inferred response types for our own API rather than adding defensive response-shape checks; continue validating untrusted external inputs.
- Validate untrusted inputs at runtime; compile-time types do not validate network data. Define schemas once and derive types where practical.
- Minimize boilerplate, but keep control flow and network boundaries clear. Small libraries that remove recurring work are welcome; hand-rolled code is not a goal in itself. Avoid abstractions that obscure straightforward code.
- Keep HTTP handlers thin and capture/normalization logic in ordinary TypeScript modules that background handlers can also call.
- Add dependencies and infrastructure when they solve a concrete problem. Avoid speculative generalization, unnecessary layers, and premature package or service splits.
- Implement incrementally, with small working slices that can be run and inspected before expanding scope.

## Working conventions

- Until the user clearly indicates that the site has launched and has users, treat existing app data and setup as disposable. Prefer resetting data and rebuilding a clean setup over preserving development state, adding incremental migrations, or maintaining compatibility with earlier implementations. Regenerate initial migrations and their metadata when schema changes warrant it; do not add migration bridges or preservation logic solely for pre-launch data. This guidance authorizes routine pre-launch resets without asking again.
- Keep Markdown soft-wrapped: write each paragraph or list item on one source line and let the editor wrap it visually.
- Do not use worktrees without asking the user first.
- Use Context7 for current library, framework, SDK, API, CLI, and cloud-service documentation, including familiar tools. Resolve the library ID first unless the user supplied an exact ID, then query the relevant documentation. Prefer official sources and Context7 over general web search for library docs. Documentation lookup is not required for ordinary refactoring, business-logic debugging, code review, or general programming concepts.
- Treat security warnings pragmatically: assess whether the affected code and exploit conditions are reachable in the app or development workflows we actually use. It is OK to ignore unreachable or inapplicable findings. Prioritize actionable risks; avoid dependency churn, overrides, or unrelated remediation solely to clear an audit report. Keep routine audit results out of the README and surface warnings only when they materially affect the work or require a decision.

## Code organization

- `src/worker/index.ts` assembles the API and shared response/error handling. Group growing route families in feature directories (currently `src/worker/auth/`), export chained Hono route definitions, and mount them with `.route()` so the client retains inferred inputs and responses. Keep handlers thin; ordinary modules own persistence, cryptography, and external acquisition.
- `src/worker/quip/` owns the Quip API boundary. Validate external responses there and send credentials only to the approved API origin, with redirects handled manually and rejected. Workers does not support `redirect: "error"`.
- `src/app/api.ts` owns the inferred Hono client and HTTP error handling. Keep feature UI and its Query hooks together (currently `src/app/auth/`); derive frontend profile types from the client rather than duplicating server interfaces. Do not persist PATs or profile caches in browser storage.
- `src/worker/db/schema.ts` defines the D1 tables with Drizzle's SQLite schema API. Use Drizzle's SQL-style query builder in focused persistence functions and infer query results rather than declaring row interfaces or supplying unchecked result generics. Wrap the D1 binding directly with `drizzle(binding)` for primary authentication/revocation reads; do not introduce D1 sessions or query caching there. Use `.batch()` or foreign-key cascades for atomic operations, keeping session checks inside writes that follow external requests. Do not add KV or Durable Objects until a concrete later slice needs them.
- `migrations/` contains ordered D1 SQL migrations and Drizzle Kit's committed `meta/` journal/snapshots. After editing the schema, follow the pre-launch reset guidance above; once the site has launched and has users, generate incremental migrations with `npm run db:generate -- --name descriptive_name` and keep applied migrations immutable. Review generated SQL, then apply it with Wrangler (`npm run db:migrate` locally). The initial `0000_accounts.sql` is generated from the Drizzle schema, including its constraints and indexes. Generation needs no Cloudflare credentials; Wrangler owns migration application. Use stable Drizzle releases and keep query logging disabled for credential/session queries.
- `worker-configuration.d.ts` is generated and ignored. `npm run typecheck` regenerates binding/runtime types; declare required Worker secrets in `src/worker/env.ts` so a clean checkout also typechecks without local secrets.
- `tests/` uses Node's test runner with TSX and an isolated Miniflare D1 database, with fixtures at the Quip boundary. Run `npm test` and `npm run build` for authentication/persistence changes, then exercise changed browser flows in the Workers runtime. Keep real-account test data and secrets out of Git and logs; use a separate local D1 persistence path for live verification.

## Commit messages

- Keep subjects and bodies relatively brief and conversational. Explain the motivation, guest-visible behavior, and any non-obvious implementation detail needed to understand the change; avoid an exhaustive inventory of edited files or changed functionality.
- Wrap commit-message body lines at roughly 72 characters and do not exceed 80 characters, matching the surrounding history.
- Split work into coherent, reviewable commits and keep unrelated policy, cleanup, and feature changes separate.
- Include citation URLs and references to other primary sources in commit messages so the context can be reconstructed later.
