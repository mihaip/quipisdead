# Project guidance

## Product context

This app preserves Quip data in a downloadable archive and lets users inspect captured data in a hosted explorer. Product requirements live in [`docs/phase-1-prd.md`](docs/phase-1-prd.md); architecture and research decisions live in [`docs/phase-1-design.md`](docs/phase-1-design.md).

## Technology and design preferences

- Prefer simple, boring, familiar technology that is easy to understand, debug, and change. React and Vite are familiar to the maintainer.
- The chosen stack is a client-rendered React/Vite SPA with a Hono API on Cloudflare Workers. SSR is not a requirement. Do not introduce Next.js or switch to a full-stack framework without discussing the change.
- Roughly follow the official [Cloudflare Hono guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/hono/), using Cloudflare's Vite plugin and standard tooling where applicable.
- Prefer Workers-only hosting. Start with a simple deployment structure and split Workers when concrete execution or configuration needs justify it.
- Use strict TypeScript and preserve type safety across client/server boundaries. Prefer Hono's typed client and inferred request/response types over duplicated interfaces, unchecked casts, or hand-maintained clients.
- Validate untrusted inputs at runtime; compile-time types do not validate network data. Define schemas once and derive types where practical.
- Minimize boilerplate, but keep control flow and network boundaries clear. Small libraries that remove recurring work are welcome; hand-rolled code is not a goal in itself. Avoid abstractions that obscure straightforward code.
- Keep HTTP handlers thin and capture/normalization logic in ordinary TypeScript modules that background handlers can also call.
- Add dependencies and infrastructure when they solve a concrete problem. Avoid speculative generalization, unnecessary layers, and premature package or service splits.
- Implement incrementally, with small working slices that can be run and inspected before expanding scope.

## Working conventions

- Keep Markdown soft-wrapped: write each paragraph or list item on one source line and let the editor wrap it visually.
- Do not use worktrees without asking the user first.
- Use Context7 for current library, framework, SDK, API, CLI, and cloud-service documentation, including familiar tools. Resolve the library ID first unless the user supplied an exact ID, then query the relevant documentation. Prefer official sources and Context7 over general web search for library docs. Documentation lookup is not required for ordinary refactoring, business-logic debugging, code review, or general programming concepts.

## Commit messages

- Keep subjects and bodies relatively brief and conversational. Explain the motivation, guest-visible behavior, and any non-obvious implementation detail needed to understand the change; avoid an exhaustive inventory of edited files or changed functionality.
- Wrap commit-message body lines at roughly 72 characters and do not exceed 80 characters, matching the surrounding history.
- Split work into coherent, reviewable commits and keep unrelated policy, cleanup, and feature changes separate.
- Include citation URLs and references to other primary sources in commit messages so the context can be reconstructed later.
