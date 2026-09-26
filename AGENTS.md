<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Whodunnit project notes

- Architecture and principles are in README.md. Keep the layers separate: `src/domain` (types + Zod), `src/lib/*` (analysis, verification, voiceprints, reconstruction, ai, prompts, persistence: no React), `src/features/*` (UI).
- Route handlers stay thin: validate with a domain schema, call `runReconstruction` or a provider, respond. No business logic in `src/app/api`.
- Model output is untrusted. Parse it with the schemas in `src/lib/ai/schemas.ts`. Never widen a schema to make a response pass.
- Changing prompt text means bumping its version in `src/lib/prompts/index.ts`.
- Never log user text. Server code logs through `logEvent` in `src/lib/privacy/log.ts` only.
- Do not add metrics the text cannot support. Everything shown in the notes is computed in `src/lib/analysis`.
- Checks: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
