# Quip archive

Quip archive is a project for preserving Quip data in a downloadable archive and browsing captured data in a hosted explorer. Product requirements live in [the PRD](docs/phase-1-prd.md); architecture and research decisions live in [the technical design](docs/phase-1-design.md).

The app uses a client-rendered React + Vite + TypeScript SPA and a Hono API, served by one Cloudflare Worker. Hono's typed client infers request and response types from the server routes; TanStack Query manages frontend data loading and caching.

## Setup

Use Node.js 20.19+ in the 20.x series, or 22.12+ in a newer series, and npm.

```sh
npm ci
```

## Local development

```sh
npm run dev
```

Open `http://localhost:5173`. The development server requires port 5173 and exits if it is already in use. The Cloudflare Vite plugin runs the API locally in the Workers runtime alongside React's hot module replacement.

## Build and preview

```sh
npm run build
npm run preview
```

`build` runs strict TypeScript checks and writes the frontend and Worker output to `dist/`. `preview` serves that production build locally in the Workers runtime at `http://localhost:4173`, requiring port 4173 and exiting if it is already in use.

## Testing

```sh
npm run typecheck
```

This checks the frontend, Worker and Vite configuration in their respective browser, Worker and Node environments. There is no automated test suite configured yet. To verify changes, run the typecheck and production build, then exercise the affected UI and API behavior with `npm run dev` or `npm run preview`. Check the browser console and development server output for errors.

## Deployment

The Worker is configured as `quipisdead` in the Hobby Projects Cloudflare account and served at [quipisdead.mihai-parparita.workers.dev](https://quipisdead.mihai-parparita.workers.dev). Authenticate Wrangler with an account that has access to it, then deploy:

```sh
npx wrangler login
npm run deploy
```

`deploy` typechecks, builds and publishes both the Worker and frontend assets. Wrangler prints the live URL when deployment completes.

## Project layout

- `src/app/`: React frontend.
- `src/worker/`: Hono API; `/api/*` requests run through the Worker, while other paths use SPA asset handling.
- `vite.config.ts`: React and Cloudflare Vite plugins.
- `wrangler.jsonc`: Worker configuration.
- `docs/`: Product requirements, technical design and research.

For framework guidance, see the [Cloudflare Hono guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/hono/), [Cloudflare Vite plugin tutorial](https://developers.cloudflare.com/workers/vite-plugin/tutorial/) and [Hono RPC guide](https://hono.dev/docs/guides/rpc).
