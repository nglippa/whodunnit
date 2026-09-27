<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Whodunnit project notes

- Architecture and principles are in README.md. Keep the layers separate: `src/domain` (types + Zod), `src/lib/*` (analysis, verification, voiceprints, reconstruction, ai, prompts, persistence: no React), `src/features/*` (UI).
- Route handlers stay thin: validate with a domain schema, call `runReconstruction` or a provider, respond. No business logic in `src/app/api`.
- Model output is untrusted. Parse it with the schemas in `src/lib/ai/schemas.ts`. Never widen a schema to make a response pass.
- Changing prompt text means adding a new version to `PROMPTS` in `src/lib/prompts/index.ts` (fingerprints are pinned in `strategy.test.ts`).
- Rewrite behaviour lives in a versioned `RewriteStrategy` (`src/lib/reconstruction/strategies.ts`); never edit a published one, add a version. Measure changes with `pnpm eval:*` (docs/EVALUATION.md) before promoting a strategy.
- Meaning checks are claim-level (`src/lib/semantics`); keep them deterministic and browser-safe. A new check needs a positive fixture and a negative control in `data/evaluation/semantic-fixtures.json` (`pnpm eval:semantic`). Never special-case a model or a single observed string.
- The semantic judge is evaluation-only and supplements deterministic checks; it must never turn a deterministic FAIL into a pass.
- Evaluation output goes to `.evaluations/` (gitignored). The evaluation CLI must never fall back to the demo engine silently, and must only run corpus cases, never user documents.
- Never log user text. Server code logs through `logEvent` in `src/lib/privacy/log.ts` only.
- Do not add metrics the text cannot support. Everything shown in the notes is computed in `src/lib/analysis` or `src/lib/rules/metrics.ts`.
- Writing rules are data in `data/rules/packs/*.json`, validated by `writingRuleSchema`. Only deterministic rules may carry a transform. Run `pnpm rules:validate` after editing a pack. See docs/ARCHITECTURE.md.
- Source text (scraped or added) is untrusted data. Candidates stay disabled until a developer runs `pnpm rules:activate`; never activate from code paths or model output. Do not commit `data/sources/cache`, `data/sources/normalized` or `data/rules/candidates`.
- No AI-probability scores, no detector optimisation, and no deliberate errors to make text read as human.
- Checks: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
