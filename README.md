# Quip archive

Quip archive is a project for preserving Quip data in a downloadable archive and browsing captured data in a hosted explorer. Product requirements live in [the PRD](docs/phase-1-prd.md); architecture and research decisions live in [the technical design](docs/phase-1-design.md).

The app uses a client-rendered React + Vite + TypeScript SPA and a Hono API, served by an API Cloudflare Worker, with a separate capture Worker consuming a Cloudflare Queue. D1 stores capture jobs, progress events and results; Queues handles delivery and retries. Hono's typed client infers request and response types from the server routes; TanStack Query manages frontend data loading and caching. Drizzle's SQLite schema and D1 query builder infer persistence types through to the API and client.

## Setup

Use Node.js 20.19+ in the 20.x series, or 22.12+ in a newer series, and npm.

```sh
npm ci
npm run cf:types
```

## Local development

Create a local encryption secret once. This writes a random 32-byte key to an ignored `.dev.vars` file without displaying it, and refuses to overwrite an existing file. Keep this key stable while using the same local database.

```sh
node -e 'const fs = require("node:fs"); const crypto = require("node:crypto"); fs.writeFileSync(".dev.vars", "CREDENTIAL_ENCRYPTION_KEY=" + crypto.randomBytes(32).toString("base64") + "\n", { flag: "wx", mode: 0o600 });'
npm run db:migrate
```

Then start the app:

```sh
npm run dev
```

Open `http://localhost:5173`. The development server requires port 5173 and exits if it is already in use. The Cloudflare Vite plugin runs both Workers and their Queues locally alongside React's hot module replacement. No separate Wrangler dev process is needed. Remote bindings are disabled for this local setup. Both Worker configurations load the same ignored `.dev.vars` file and share the local D1 database.

Sign in with a [Quip personal access token](https://quip.com/dev/token). The app validates it with `/1/users/current`, saves an encrypted credential, and sets a Secure HttpOnly cookie. Use `localhost` for local browser testing, where browsers allow Secure cookies over the loopback HTTP origin; production requires HTTPS. Tokens stay out of URLs and browser persistent storage. Generating a new token in Quip invalidates earlier tokens; the signed-in UI lets you replace the saved token for the same account.

Local D1 data persists in the ignored `.wrangler/state/` directory and is shared by Wrangler migrations, Vite development, and preview. Apply `npm run db:migrate` when new migrations arrive. No Cloudflare database or Queue needs to be provisioned for local development. Local development uses isolated storage even though the configuration also identifies the production database.

To test with a separate local database, use the same path for migrations and the Vite plugin:

```sh
npx wrangler d1 migrations apply DB --local --persist-to .wrangler/auth-verification
QUIP_LOCAL_STATE_PATH=.wrangler/auth-verification npm run dev
```

The current slice supports account connection, PAT replacement, sign-out, app-account deletion, and background capture of the current Quip profile. Use **Start profile capture** after sign-in to request a fresh `/1/users/current` read through the capture Worker. The UI shows queued/running/completed/failed status, the latest progress message and the latest successful profile, which survives reload in D1. Sign-out or closing the page does not cancel capture. Deletion removes the saved profile alongside the account and credential and prevents late deliveries from restoring it; it never calls Quip or deletes source content. Full archive capture and exploration are later slices. A browser session lasts 30 days; returning from another browser requires a current PAT. There is no independent recovery credential yet.

## Profile capture behavior

Each capture has a permanent job row in D1, retained until app-account deletion. A partial unique index permits only one queued or running job per account, so simultaneous starts reuse the active job; a terminal job allows a new capture without replacing earlier jobs. Queue messages contain only account and job identifiers. The capture Worker reads and decrypts the server-side credential and validates a fresh Quip response against the saved source identity. Only normalized ID, name, email and capture time are retained, with one latest successful result per account; this is not a raw response archive.

Cloudflare Queues retries transient failures, with three retries after the initial delivery and a five-second retry delay. Rejected credentials or changed source identity fail immediately. Exhausted deliveries go to the dead-letter queue, whose consumer records a failed job. Atomic D1 claims and expiring attempt leases prevent overlapping or stale deliveries from overwriting results. The result, completion event and completed status commit together in one D1 batch. A scheduled API handler checks once a minute for jobs whose Queue submission was interrupted; duplicate submissions are safe. This is a small profile-capture flow, not full archive resumability or Quip rate-limit scheduling.

Replace an expired token and start again after failure. The previous successful profile remains visible while a new capture runs or fails. Both Workers require the same encryption key. Append-only `capture_job_progress` events belong to a job and contain an increasing ID, timestamp and message. The authenticated API returns the newest job and its latest event; the UI polls every second while queued or running. Worker progress inserts check the attempt lease so stale workers cannot publish new messages. Job and profile rows belong to the account, and account deletion cascades through jobs to their progress history. No R2 binding is needed.

## Schema changes

Edit `src/worker/db/schema.ts`, then generate a SQL migration:

```sh
npm run db:generate -- --name describe_the_change
```

Review the SQL before applying it with `npm run db:migrate`. Commit the generated SQL and `migrations/meta/` snapshots/journal with the schema change; follow the pre-launch reset guidance in `AGENTS.md`, and keep applied migrations unchanged once the site has launched and has users. Drizzle Kit generation uses the schema and snapshots locally and needs no Cloudflare credentials. Wrangler remains the migration runner for local and remote D1 databases; do not use automatic schema push in the app or during deployment. [Drizzle migration generation](https://orm.drizzle.team/docs/drizzle-kit-generate), [D1 driver](https://orm.drizzle.team/docs/sqlite/connect-cloudflare-d1).

The initial `0000_accounts.sql` and its metadata are generated from the Drizzle schema. When regenerating that migration under the pre-launch guidance in `AGENTS.md`, reset existing development databases before applying it again. To reset a local development database, stop the server, remove `.wrangler/state/v3/d1/`, and run `npm run db:migrate` before restarting. For an isolated database, remove `v3/d1/` beneath its persistence path and apply migrations with that same `--persist-to` path.

## Build and preview

```sh
npm run build
npm run preview
```

`build` runs strict TypeScript checks and writes the frontend and Worker output to `dist/`. `preview` serves that production build locally in the Workers runtime at `http://localhost:4173`, requiring port 4173 and exiting if it is already in use.

## Testing

```sh
npm run typecheck
npm test
```

Typechecking regenerates types from both Worker configurations and checks the frontend, Workers, Vite/Drizzle configuration, and tests. The automated auth tests use an ephemeral local Miniflare D1 database and Quip fixtures, including invalid PATs, expired/revoked sessions, wrong-identity replacement, encryption integrity, transaction rollback, and revocation during replacement. Their setup applies the generated migrations to a fresh database. Capture tests bundle the real API and consumer into isolated Miniflare Workers with D1, Queue delivery and fixture Quip responses. They cover fresh reads, overlapping starts, duplicates, native retries, exhausted delivery through the dead-letter consumer, pending submission recovery, stale completions, transactional rollback, retained job/event history, latest-event ordering, authorization, isolation, sign-out and deletion races. Test-only controls do not ship in either production entry. All automated tests use no real Quip token or production resources.

Run `npm run build`, then exercise the affected UI and API behavior with `npm run dev` or `npm run preview`. Verify sign-in, capture completion and its result after reload, replacement, sign-out, and confirmed app-account deletion; check the browser console and development server output for errors. Quip identity requests must also work inside the Workers runtime, not just Node tests.

## Deployment

The Worker is configured as `quipisdead` in the Hobby Projects Cloudflare account and served at [quipisdead.mihai-parparita.workers.dev](https://quipisdead.mihai-parparita.workers.dev). It uses the shared `quipisdead-accounts` D1 database configured in `wrangler.jsonc` and a separately provisioned production encryption secret.

The API and capture Workers share the D1 database and must have the same production `CREDENTIAL_ENCRYPTION_KEY` secret.

Apply pending migrations before a normal deployment:

```sh
npx wrangler d1 migrations apply DB --remote --config wrangler.jsonc
npm run deploy
```

Keep a production secrets file outside the checkout with owner-only permissions. Existing Worker secrets survive code deployments. Keep the key stable; rotation with retained accounts requires re-encrypting saved credentials. Never reuse the local key or commit keys.

For a fresh deployment, provision D1 and both Queues, then upload the same production secrets file alongside both Workers. Deploy the capture consumer before the API.

```sh
npx wrangler queues create quipisdead-capture
npx wrangler queues create quipisdead-capture-failed
npm run build
npx wrangler deploy --config dist/quipisdead_capture/wrangler.json --secrets-file "/path/to/production-secrets.json"
npx wrangler deploy --config dist/quipisdead/wrangler.json --secrets-file "/path/to/production-secrets.json"
```

`deploy` typechecks, builds and publishes the capture consumer first and the API/frontend second. Vite outputs `dist/quipisdead/` and `dist/quipisdead_capture/`; deploying only the entry Worker does not deploy auxiliary Workers. The capture Worker disables `workers.dev` and has no HTTP handler. For a separate deployment, update account/database IDs and Queue references, provision its database and Queues, and supply a separate common encryption key. Never reuse the local key or commit keys.

See Cloudflare's [uploading secrets with code](https://developers.cloudflare.com/workers/configuration/secrets/#upload-secrets-alongside-code), [Vite auxiliary-Worker setup](https://developers.cloudflare.com/workers/vite-plugin/reference/api/#auxiliaryworkers), [Queue setup](https://developers.cloudflare.com/queues/get-started/), [Queue retries](https://developers.cloudflare.com/queues/configuration/batching-retries/) and [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/).

Account deletion removes active database records immediately. Cloudflare D1 Time Travel backups may retain deleted records for up to seven days on Workers Free or thirty days on Workers Paid. See the [authentication design](docs/phase-1-design.md#implemented-account-session-slice) and [D1 backup documentation](https://developers.cloudflare.com/d1/reference/time-travel/). A database restore must reapply deletions and revoke restored sessions before serving traffic.

## Project layout

- `src/app/`: React frontend, with the inferred client in `api.ts` and account UI/hooks in `auth/`.
- `src/worker/`: API runtime entry, Hono API assembly, `auth/` routes/persistence/session helpers, `db/schema.ts` for Drizzle table definitions, the `quip/` external API adapter, and `capture/` routes, Queue consumer and D1 job/progress/result store; `/api/*` requests run through the Worker, while other paths use SPA asset handling.
- `migrations/`: D1 schema migrations for app users, credentials, sessions, capture jobs, progress events and captured profiles, plus Drizzle's committed journal/snapshots in `meta/`.
- `tests/`: Auth and capture integration tests with local D1, Queue runtime and fixture Quip responses.
- `vite.config.ts`: React and Cloudflare Vite plugins, including the auxiliary capture Worker.
- `drizzle.config.ts`: SQLite schema and migration-generation paths; no deployment credentials.
- `wrangler.capture.jsonc`: Capture Worker bindings and Queue consumer.
- `wrangler.jsonc`: Worker configuration.
- `docs/`: Product requirements, technical design and research.

For framework guidance, see the [Cloudflare Hono guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/hono/), [Cloudflare Vite plugin tutorial](https://developers.cloudflare.com/workers/vite-plugin/tutorial/) and [Hono RPC guide](https://hono.dev/docs/guides/rpc).
