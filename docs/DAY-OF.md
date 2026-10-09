# Day-of runbook

Full plan: [Rise — Hackathon Build Plan](https://claude.ai/code/artifact/dd20cc44-fbae-45d1-aa14-2fcd2f7f796a)

| Time | Phase | Exit gate |
| --- | --- | --- |
| 9:00 | Keynote | Ask about pre-built code, Cosmos / VAST / W&B endpoints, demo time limit |
| 9:30–10:00 | Phase 0 | `npm run dev` + tunnel; seed loads on `/clinic`; `/p/rise-01` opens on the phone |
| 10:00–11:00 | Risk first | On-phone pose → counter → arm-use and stop detection (`lib/pose/*`) |
| 11:00–12:15 | Phase 1 | Console C1–C3 and phone P1–P5 + P3a on seeded data. **Checkpoint 1 — Static Demo** (backup: Option C on the phone only) |
| 12:15–1:00 | Lunch + relay | Rep events phone → app → SSE to the console board |
| 1:00–2:45 | Phase 2 | `lib/rules.ts`, `lib/feedback.ts` wiring, Cosmos, W&B agent, VAST, Twilio. **Checkpoint 2 — Live Capability** |
| 2:45–3:45 | Phase 3 | All UI states, Weave eval over 7 patients, stage-lighting test, projector test. **Checkpoint 3 — Demo Lock 3:45** |
| 3:45–4:30 | Phase 4 | Backup recording first, README, screenshots, two timed rehearsals |

After Demo Lock: defects and copy only. New ideas go to the plan's Post-hackathon list.

## Where things live
| What | File |
| --- | --- |
| Defaults (cadence, thresholds, pose fps, override reasons, billing profiles) | `config/protocol.default.json` |
| Patient-facing lines (no scores) | `content/patient-lines.json` |
| Voice script → mp3 | `content/voice-lines.json`, `npm run voice` |
| CDC norms + scoring | `lib/steadi.ts` |
| Seed types + loader | `lib/types.ts`, `lib/seed.ts` |
| Rules (spec in file; oracle in tests) | `lib/rules.ts`, `tests/seed.test.ts` |
| Cadence engine (reference in `seed/build_seed.py`) | `lib/cadence.ts` |
| Pose tiers + counter spec | `lib/pose/` |
| AI adapters | `lib/ai/` |
| Twilio / VAST / FHIR | `lib/adapters/` |
| Laptop pose fallback | `services/rise-pose/` |

Cursor prompts for each phase: [docs/CURSOR-PROMPTS.md](CURSOR-PROMPTS.md). CI (typecheck, tests, lint, build) runs on every push: `.github/workflows/ci.yml`.
