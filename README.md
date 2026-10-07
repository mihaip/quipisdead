# Quip archive

Quip archive is a project for preserving Quip data in a downloadable archive and browsing captured data in a hosted explorer. Product requirements live in [the PRD](docs/phase-1-prd.md); architecture and research decisions live in [the technical design](docs/phase-1-design.md).

The app uses a client-rendered React + Vite + TypeScript SPA and a Hono API, served by one Cloudflare Worker. Hono's typed client infers request and response types from the server routes; TanStack Query manages frontend data loading and caching. Drizzle's SQLite schema and D1 query builder infer persistence types through to the API and client.

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

Open `http://localhost:5173`. The development server requires port 5173 and exits if it is already in use. The Cloudflare Vite plugin runs the API locally in the Workers runtime alongside React's hot module replacement.

Sign in with a [Quip personal access token](https://quip.com/dev/token). The app validates it with `/1/users/current`, saves an encrypted credential, and sets a Secure HttpOnly cookie. Use `localhost` for local browser testing, where browsers allow Secure cookies over the loopback HTTP origin; production requires HTTPS. Tokens stay out of URLs and browser persistent storage. Generating a new token in Quip invalidates earlier tokens; the signed-in UI lets you replace the saved token for the same account.

Local D1 data persists in the ignored `.wrangler/state/` directory and is shared by Wrangler migrations, Vite development, and preview. Apply `npm run db:migrate` when new migrations arrive. No Cloudflare database needs to be provisioned for local development. Local development uses isolated storage even though the configuration also identifies the production database.

To test with a separate local database, use the same path for migrations and the Vite plugin:

```sh
npx wrangler d1 migrations apply DB --local --persist-to .wrangler/auth-verification
QUIP_LOCAL_STATE_PATH=.wrangler/auth-verification npm run dev
```

The current slice supports account connection, profile display, PAT replacement, sign-out, and deletion of this app's account. Deletion never calls Quip or deletes source content. Archive capture and exploration are later slices. A browser session lasts 30 days; returning from another browser requires a current PAT. There is no independent recovery credential yet.

## Schema changes

Edit `src/worker/db/schema.ts`, then generate a SQL migration:

```sh
npm run db:generate -- --name describe_the_change
```

Review the SQL before applying it with `npm run db:migrate`. Commit the generated SQL and `migrations/meta/` snapshots/journal with the schema change; follow the pre-launch reset guidance in `AGENTS.md`, and keep applied migrations unchanged once the site has launched and has users. Drizzle Kit generation uses the schema and snapshots locally and needs no Cloudflare credentials. Wrangler remains the migration runner for local and remote D1 databases; do not use automatic schema push in the app or during deployment. [Drizzle migration generation](https://orm.drizzle.team/docs/drizzle-kit-generate), [D1 driver](https://orm.drizzle.team/docs/sqlite/connect-cloudflare-d1).

The initial `0000_accounts.sql` and its metadata are generated from the Drizzle schema. To reset a local development database, stop the server, remove `.wrangler/state/v3/d1/`, and run `npm run db:migrate` before restarting. For an isolated database, remove `v3/d1/` beneath its persistence path and apply migrations with that same `--persist-to` path.

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

Typechecking regenerates Worker types and checks the frontend, Worker, Vite/Drizzle configuration, and tests. The automated auth tests use an ephemeral local Miniflare D1 database and Quip fixtures, including invalid PATs, expired/revoked sessions, wrong-identity replacement, encryption integrity, transaction rollback, and revocation during replacement. Their setup applies the generated migrations to a fresh database. They use no real Quip token or production resources.

Run `npm run build`, then exercise the affected UI and API behavior with `npm run dev` or `npm run preview`. Verify sign-in, reload persistence, replacement, sign-out, and confirmed app-account deletion; check the browser console and development server output for errors. Quip identity requests must also work inside the Workers runtime, not just Node tests.

## Deployment

The Worker is configured as `quipisdead` in the Hobby Projects Cloudflare account and served at [quipisdead.mihai-parparita.workers.dev](https://quipisdead.mihai-parparita.workers.dev). It uses the shared `quipisdead-accounts` D1 database configured in `wrangler.jsonc` and a separately provisioned production encryption secret.

The production database and `CREDENTIAL_ENCRYPTION_KEY` Worker secret are provisioned. Apply pending migrations before deploying:

```sh
npx wrangler d1 migrations apply DB --remote --config wrangler.jsonc
npm run deploy
```

Keep the production encryption key stable; rotation requires re-encrypting credentials before removing the old key. For a separate deployment, provision its own D1 database and a separate random 32-byte base64 encryption key using `wrangler secret put CREDENTIAL_ENCRYPTION_KEY`. Do not reuse the local key or commit either key.

`deploy` typechecks, builds and publishes both the Worker and frontend assets. Wrangler prints the live URL when deployment completes.

Account deletion removes active database records immediately. Cloudflare D1 Time Travel backups may retain deleted records for up to seven days on Workers Free or thirty days on Workers Paid. See the [authentication design](docs/phase-1-design.md#implemented-account-session-slice) and [D1 backup documentation](https://developers.cloudflare.com/d1/reference/time-travel/). A database restore must reapply deletions and revoke restored sessions before serving traffic.

## Project layout

- `src/app/`: React frontend, with the inferred client in `api.ts` and account UI/hooks in `auth/`.
- `src/worker/`: Hono API assembly, `auth/` routes/persistence/session helpers, `db/schema.ts` for Drizzle table definitions, and the `quip/` external API adapter; `/api/*` requests run through the Worker, while other paths use SPA asset handling.
- `migrations/`: D1 schema migrations for app users, credentials, and sessions, plus Drizzle's committed journal/snapshots in `meta/`.
- `tests/`: Auth integration tests with local D1 and fixture Quip responses.
- `vite.config.ts`: React and Cloudflare Vite plugins.
- `drizzle.config.ts`: SQLite schema and migration-generation paths; no deployment credentials.
- `wrangler.jsonc`: Worker configuration.
- `docs/`: Product requirements, technical design and research.

For framework guidance, see the [Cloudflare Hono guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/hono/), [Cloudflare Vite plugin tutorial](https://developers.cloudflare.com/workers/vite-plugin/tutorial/) and [Hono RPC guide](https://hono.dev/docs/guides/rpc).
