# Team of two: ownership, branches, merges

Rex owns everything that turns a body on camera into numbers and a decision. Jeremiah owns everything that turns a stored clip into understanding and puts it in front of the clinic. Full rationale: build plan §6b.

## Ownership

| Area | Owner | Files |
| --- | --- | --- |
| YOLO pose on the phone (ONNX, WebGPU/WASM) | Rex | `lib/pose/yolo-onnx.ts` |
| MediaPipe fallback, tier selection, laptop pose service | Rex | `lib/pose/mediapipe.ts`, `lib/pose/select.ts`, `services/rise-pose/` |
| Stand counter, arm use, stop detection, asymmetry | Rex | `lib/pose/counter.ts` |
| Fixtures recorder and seeded replay | Rex | `app/dev/pose/`, `lib/pose/seeded.ts`, `fixtures/` |
| Patient phone P1–P5, P3a, voice, closing lines, note box | Rex | `app/p/**`, `lib/feedback.ts`, `public/voice/` |
| Triage rules and cadence | Rex | `lib/rules.ts`, `lib/cadence.ts` |
| Twilio invite and callback | Rex | `lib/adapters/twilio.ts` |
| VAST ingest and semantic search | Jeremiah | `lib/adapters/vast.ts`, `app/api/sessions/[id]/clip/` |
| Cosmos observation | Jeremiah | `lib/ai/cosmos.ts`, `lib/ai/prompts.ts` |
| W&B agent, Weave tracing and eval | Jeremiah | `lib/ai/agent.ts` |
| Session store and SSE relay | Jeremiah | `lib/sessions.ts`, `app/api/sessions/**` |
| Clinic console C1–C4 and monitoring summary | Jeremiah | `app/clinic/**` |
| FHIR hand-off (should-have) | Jeremiah | `lib/adapters/fhir.ts`, `app/api/fhir-sink/` |
| Shared contracts | Both, by PR to main only | `lib/types.ts`, `config/protocol.default.json` |

## Branches

```bash
# 9:30, after the contracts PR is merged
git switch main && git pull
git switch -c rex/pose        # Rex
git switch -c jeremiah/vast   # Jeremiah

# before every PR
git fetch && git rebase origin/main && npm run check
```

- Main is protected by CI (typecheck, tests, lint, build). Merge only green PRs.
- Merge both branches at 12:15, 2:45, and 3:45, then run the full flow on the phone and projector for 10 minutes.
- Touch only your own files between checkpoints. A change to `lib/types.ts` or `config/` goes in its own small PR; the other person rebases right away.

## Contracts to pin at 9:30 (`lib/types.ts`)

- `RepEvent`, `SessionResult` (Rex produces; Jeremiah consumes)
- `TriageCard` (Rex's rules fill `recommendation`, `route`, `ruleFired`; Jeremiah adds `observation`, `careTeamNote`, `evidenceFrameUrls`)
- New: `ClipRef { sessionId, vastId?, localPath?, durationS, uploadedAt }` and `SearchHit { sessionId, riseId, startS, endS, label, score, thumbUrl? }` (Jeremiah)

## Seams and stand-ins

| Seam | Real path | Stand-in until it merges |
| --- | --- | --- |
| Phone → relay | Rex posts `RepEvent`s to `POST /api/sessions/[id]/events` | Rex logs events in the browser console |
| Phone → VAST | Phone uploads the clip to `POST /api/sessions/[id]/clip` | Rex saves locally; Jeremiah ingests organizers' videos and the fixture clips |
| Rules → console | `lib/rules.ts` produces the `TriageCard` core | Jeremiah renders from each patient's `scripted_today` + `expected_triage` |
| Cosmos → card | Observation is advisory only | Either order works; Cosmos never changes the recommendation |

## Stage roles

Rex plays Ellen on the phone and owns the chair and phone stand. Jeremiah drives the console on the projector, narrates the VAST search and stack beats, and owns the backup screen recording.
