<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Rise project rules

- Read `docs/DAY-OF.md` and the build plan before adding features. Never silently expand scope; park new ideas in the plan's Post-hackathon list.
- The recommendation always comes from `lib/rules.ts` (deterministic). Models (Cosmos, W&B agent) only describe and explain, and never write patient-facing text.
- The patient surface (`app/p/**`) never shows a STEADI score, stand count, norm, or "below average". Closing lines come only from `content/patient-lines.json`.
- A red-flag symptom answer shows the emergency line immediately. Every other escalation needs a human click on the console.
- Every external call has a timeout, a seeded fallback, and a visible "Demo data" badge when the fallback is used.
- Defaults live in `config/protocol.default.json` and are labeled as Rise defaults, not clinical standards. Overrides need a reason code.
- Status is never shown by color alone. Phone UI: 20px+ text, 56px+ buttons, Stop always visible, every instruction spoken and captioned.
- All data is synthetic. Keep the Synthetic Hospital and CDC STEADI credits.
- Run `npm run check` before committing.
