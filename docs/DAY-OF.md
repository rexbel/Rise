# Day-of runbook

Full plan: [docs/BUILD-PLAN.md](BUILD-PLAN.md) (snapshot of the [live doc](https://claude.ai/code/artifact/dd20cc44-fbae-45d1-aa14-2fcd2f7f796a)). Ownership, branches, and seams: plan §6b.

Two builders, two branches. **Rex** (`rex/pose`): YOLO pose, the patient phone, rules and cadence, Twilio. **Jeremiah** (`jeremiah/vast`): VAST ingest and search, Cosmos, W&B agent, session store + SSE relay, the clinic console. Each starts with their riskiest piece: on-phone YOLO; the VAST API.

| Time | Rex (`rex/pose`) | Jeremiah (`jeremiah/vast`) | Together / gate |
| --- | --- | --- | --- |
| Morning preflight ([PREFLIGHT.md](PREFLIGHT.md)) | Pose ONNX export + phone fps benchmark (done); three fixture clips; ElevenLabs mp3s; Twilio verified | Read VAST, Cosmos, W&B docs; clone, `npm run check` | Repo pushed; CI green |
| 9:00 | Ask about W&B inference and pre-built code | Ask about VAST and Cosmos endpoints and the shared videos | Keynote |
| 9:30–10:00 | Tunnel up; `/p/rise-01` opens on the phone | Organizers' videos downloaded; VAST credentials working | Contracts PR to main (`SessionResult`, `RepEvent`, `TriageCard`, `ClipRef`, `SearchHit` in `lib/types.ts`), then branch |
| 10:00–12:15 | YOLO, MediaPipe, tier switch, counter, fixtures; then P1–P3 | VAST ingest with organizers' videos and fixture clips; session store + SSE; console C1–C2 on seed | **Checkpoint 1 — Static Demo 12:15:** merge both; backup decision (Option C on the phone only) |
| 12:15–1:00 | Phone posts live events | Board shows live count | Lunch + integration: live count on the projector |
| 1:00–2:45 | Rules, cadence, feedback; P3a, P4, P5; Twilio | Clip upload to VAST; search (C4); Cosmos; W&B agent; triage card C3 | **Checkpoint 2 — Live Capability 2:45:** merge both |
| 2:45–3:45 | Phone states, stage-light test, fixtures replay check | Console states, Weave eval, monitoring summary, projector test | **Checkpoint 3 — Demo Lock 3:45:** final merge |
| 3:45–4:30 | Rehearse the chair stand and phone flow | Backup screen recording first, then README and screenshots | Two timed rehearsals together |

After Demo Lock: defects and copy only. New ideas go to the plan's Post-hackathon list.

## Branches and merges
- Main is protected by CI (typecheck, tests, lint, build). Merge only green PRs.
- Merge to main at each checkpoint (12:15, 2:45, 3:45), then a 10-minute integration run on the phone and projector. Small PRs in between are fine if they touch only your own files.
- `lib/types.ts` and `config/protocol.default.json` change only by PR; the other person rebases right away.
- `.github/CODEOWNERS` maps each file to its owner, so PRs auto-request the right reviewer. Reviews are not required; a green CI run is.
- Seams before the other side lands:
  - Phone → relay: Rex posts `RepEvent`s to `POST /api/sessions/[id]/events`; until that route merges, log in the browser console.
  - Phone → VAST: clip goes to `POST /api/sessions/[id]/clip`; until then Rex saves locally and Jeremiah tests ingest with the organizers' videos and the three fixture clips.
  - Rules → console: Jeremiah renders `TriageCard` from `scripted_today` + `expected_triage` until `lib/rules.ts` merges at 2:45.
  - Cosmos → rules: Cosmos never changes the recommendation, so they merge in either order.

## Where things live
| What | File | Owner |
| --- | --- | --- |
| Defaults (cadence, thresholds, pose fps, override reasons, billing profiles) | `config/protocol.default.json` | Both, by PR |
| Patient-facing lines (no scores) | `content/patient-lines.json` | Rex |
| Voice script → mp3 | `content/voice-lines.json`, `npm run voice` | Rex |
| CDC norms + scoring | `lib/steadi.ts` | Rex |
| Seed types + loader | `lib/types.ts`, `lib/seed.ts` | Both, by PR |
| Rules (spec in file; oracle in tests) | `lib/rules.ts`, `tests/seed.test.ts` | Rex |
| Cadence engine (reference in `seed/build_seed.py`) | `lib/cadence.ts` | Rex |
| Pose tiers + counter spec | `lib/pose/` | Rex |
| AI adapters | `lib/ai/` | Jeremiah |
| Twilio | `lib/adapters/twilio.ts` | Rex |
| VAST ingest + search, FHIR | `lib/adapters/vast.ts`, `lib/adapters/fhir.ts` | Jeremiah |
| Session store + SSE relay | `lib/sessions.ts`, `app/api/sessions/**` | Jeremiah |
| Patient phone / clinic console | `app/p/**` / `app/clinic/**` | Rex / Jeremiah |
| Laptop pose fallback | `services/rise-pose/` | Rex |

Cursor prompts for each phase: [docs/CURSOR-PROMPTS.md](CURSOR-PROMPTS.md). CI (typecheck, tests, lint, build) runs on every push: `.github/workflows/ci.yml`.
