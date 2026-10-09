# Day-of runbook

Full plan: [Rise — Hackathon Build Plan](https://claude.ai/code/artifact/dd20cc44-fbae-45d1-aa14-2fcd2f7f796a)

Two people, two branches. Ownership, contracts, and seams: [docs/TEAM.md](TEAM.md).

| Time | Rex (`rex/pose`) | Jeremiah (`jeremiah/vast`) | Together / gate |
| --- | --- | --- | --- |
| 9:00 | Ask about W&B inference and the pre-built-code rule | Ask about VAST and Cosmos endpoints and the shared videos | Keynote |
| 9:30–10:00 | Tunnel up; `/p/rise-01` opens on the phone | Organizers' videos downloaded; VAST credentials working | Contracts PR to main (`lib/types.ts`), then branch |
| 10:00–12:15 | YOLO, MediaPipe, tier switch, counter, fixtures; then P1–P3 | VAST ingest (organizers' videos + fixture clips); session store + SSE; console C1–C2 on seed | **Checkpoint 1 — Static Demo 12:15:** merge both (backup: Option C on the phone only) |
| 12:15–1:00 | Phone posts live events | Board shows live count | Lunch + integration |
| 1:00–2:45 | `lib/rules.ts`, `lib/cadence.ts`, `lib/feedback.ts`; P3a, P4, P5; Twilio | Clip upload to VAST; search C4; Cosmos; W&B agent; triage card C3 | **Checkpoint 2 — Live Capability 2:45:** merge both |
| 2:45–3:45 | Phone states, stage-light test, fixture replay check | Console states, Weave eval, monitoring summary, projector test | **Checkpoint 3 — Demo Lock 3:45:** final merge |
| 3:45–4:30 | Rehearse chair stand and phone flow | Backup recording first, README, screenshots | Two timed rehearsals |

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
