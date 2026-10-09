# Cursor prompts for build day

Paste one prompt per phase into Cursor (Agent mode), on your own branch: Rex on `rex/pose`, Jeremiah on `jeremiah/vast` (ownership in [BUILD-PLAN.md §6b](BUILD-PLAN.md)). Each heading names its owner. Each one names what to read first, the job, and the exit check. Cursor also loads `.cursor/rules/rise.mdc` and `AGENTS.md` automatically. If a prompt grows past its phase, stop and park the extra idea in the plan's Post-hackathon list.

After every prompt: `npm run check`, try it on the phone through the tunnel, commit, push to your branch. CI runs the same checks plus lint and build on every push and PR. Merge to main at each checkpoint (12:15, 2:45, 3:45), green PRs only.

---

## 0. Kickoff (9:30) — both

```
Read AGENTS.md, docs/DAY-OF.md, config/protocol.default.json, lib/types.ts and lib/seed.ts.
Don't write code yet. Summarize back to me: the two surfaces, the 8 triage rules in lib/rules.ts,
what the patient phone must never show, and the pose tier ladder with its fps thresholds.
Then list the files you expect to create today, in the order of docs/DAY-OF.md, marking which are mine (Rex: pose, phone, rules, cadence, Twilio;
Jeremiah: VAST, Cosmos, W&B agent, relay, console).
```

## 0b. Contracts PR to main (9:40) — both, one PR

```
Read lib/types.ts, docs/DAY-OF.md (Branches and merges) and BUILD-PLAN.md §6b.
Only edit lib/types.ts. Pin the shared contracts as Zod schemas + types, no implementations:
- RepEvent (phone -> POST /api/sessions/[id]/events): status, rep, stop, resume, finished_early, arm_use, tier.
- SessionResult (Rex): raw stands, STEADI score, arms_used + arms_from_rep, asymmetry, pauses, stop info,
  symptoms, optional note, pose tier.
- TriageCard (console): recommendation, route, rule fired, metrics vs history and CDC cutoff, evidence frame,
  Cosmos observation, agent note, patient answers.
- ClipRef (Jeremiah): session id, VAST object id or local path, duration, uploadedAt.
- SearchHit (Jeremiah): riseId, sessionId, clip ClipRef, start/end ms, label, score, thumbnail.
Keep existing seed schemas unchanged. npm run check must pass.
Exit: PR merged to main; both branch from it (rex/pose, jeremiah/vast).
```

## 1R. Risk first: pose on the phone (10:00–12:15) — Rex

```
Read lib/pose/index.ts, lib/pose/counter.ts, config/protocol.default.json (pose, thresholds) and lib/types.ts.
Build the pose layer for the patient phone:
1. lib/pose/yolo-onnx.ts: onnxruntime-web, WebGPU with WASM fallback, loads /models/pose.onnx (320px),
   decodes the YOLO pose output to 17 COCO keypoints for the largest person.
2. lib/pose/mediapipe.ts: @mediapipe/tasks-vision PoseLandmarker (lite, LIVE_STREAM/VIDEO mode),
   maps its 33 landmarks to the same 17 COCO points.
3. lib/pose/select.ts: 3 s benchmark; keep YOLO only at >= 15 fps, else MediaPipe. Preload MediaPipe.
   Mid-test: if YOLO stays under 12 fps for 2 s, swap to MediaPipe without resetting count or timer.
4. lib/pose/counter.ts: stand counter state machine per the spec comment (hip sit/stand bands with
   hysteresis and a calibration step, arm-use detection, half-way-at-30s rule, stop after 8 s with no stand,
   knee-angle asymmetry). Pure functions over keypoints, with vitest tests on synthetic keypoint sequences.
5. A bare test page at app/dev/pose/page.tsx: camera, skeleton overlay on canvas, fps, tier, rep count, arms flag.
6. Fixture recorder on the same page (format in fixtures/README.md):
   - Source: live camera OR an uploaded video file (the clips recorded the night before).
   - "Record fixture" captures every pose frame for 30 s: { t_ms, keypoints (17 x [x,y,conf]) } plus
     metadata { riseId, variant, tier, fps, recordedAt }, and downloads it as fixtures/<riseId>-<variant>.json.
   - lib/pose/seeded.ts replays a fixture through the SAME counter at its recorded timestamps, so the
     fallback produces the same reps, arm flags and pauses as the live run. Show the "Demo data" badge.
   - Add a vitest test per committed fixture: counter output matches the fixture's expected block.
Exit: on my phone via the tunnel, the counter counts 5 real stands correctly and flags arms when I push off;
the three fixtures replay through the seeded tier with the same counts as live.
```

## 1J. Risk first: VAST ingest + relay (10:00–12:15) — Jeremiah

```
Read lib/types.ts (ClipRef, SearchHit, RepEvent), lib/adapters/vast.ts, .env.example (VAST_*) and the
VAST/Cosmos details from the 9:00 keynote.
1. lib/adapters/vast.ts: upload a clip and return a ClipRef; 6 s timeout; fallback saves to a local file
   and returns a local ClipRef with the "Demo data" badge.
2. POST /api/sessions/[id]/clip: accepts the phone's MediaRecorder upload and calls the adapter.
3. Smoke-test ingest with the organizers' videos and the three fixture clips (rise-01-arms, rise-02-asym,
   rise-06-arms).
4. lib/sessions.ts in-memory store + POST /api/sessions/[id]/events + GET /api/sessions/stream (SSE).
Exit: a curl'd clip lands in VAST (or the local fallback with no keys); posting RepEvents updates an SSE stream.
```

## 2. Static slice: both surfaces on seed data (by 12:15) — Rex builds the phone, Jeremiah the console

```
Read docs/DAY-OF.md, the UX plan in the build plan (§5), content/patient-lines.json, content/voice-lines.json,
lib/feedback.ts and lib/seed.ts. Use only components in components/ui.
Build, all on seeded data (no live AI yet):
- Console: C1 /clinic patient list (name, procedure, POD, episode day, last status) with a Send check-in Dialog;
  C2 live board tiles (Invited, Setting up, Testing with count, Scoring, Ready, Needs confirmation in amber);
  C3 /clinic/[riseId] triage card using the patient's scripted_today and expected_triage
  (recommendation + route on top, metrics vs history and CDC cutoff, evidence frame placeholder,
  side Sheet with observation, answers, rule fired, note; Approve / Edit / Downgrade).
- Phone /p/[token]: P1 welcome, P2 safety checks + framing guide (uses the pose layer), P3 chair stand
  (voice from /voice/*.mp3 with captions, 30 s ring, big counter, Stop always visible), P3a paused
  ("keep going or finish here"), P4 four symptom questions, P5 closing lines from lib/feedback.ts
  plus the optional note box; emergency screen alone on a red-flag answer.
Phone rules: 20px+ text, 56px+ buttons, portrait, no scores anywhere under app/p.
Exit: I can click through both surfaces end to end at 390px and 1280px with no live services.
```

## 3. Live relay (12:15–1:00) — Jeremiah serves, Rex posts from the phone

```
Read lib/types.ts (RepEvent, SessionStatus, SessionResult).
lib/sessions.ts, POST /api/sessions/[id]/events and GET /api/sessions/stream exist from 1J (Jeremiah).
Rex: wire the phone to post status, rep, stop, resume and finished_early RepEvents.
Jeremiah: make the C2 tiles update live from the SSE stream, including the pose tier.
Exit: during a test on my phone, the console tile shows the live count within 1 second.
```

## 4R. Core intelligence (1:00–2:45) — Rex

```
Read lib/rules.ts, tests/seed.test.ts (the oracle), lib/cadence.ts, seed/build_seed.py (next_checkin),
config/protocol.default.json, lib/feedback.ts and lib/adapters/twilio.ts.
1. Implement lib/rules.ts exactly per its comment table; add tests that it matches the oracle for all 7
   patients plus a stopped-early case (human_confirm).
2. Implement lib/cadence.ts to match next_checkin in seed/build_seed.py, reading defaults from config.
3. Phone P3a, P4, P5 wired to lib/feedback.ts; emergency screen on a red-flag answer.
4. lib/adapters/twilio.ts (invite + callback SMS, QR fallback). Read keys from env; with no keys, fall back cleanly.
5. On finish the phone uploads the clip to POST /api/sessions/[id]/clip and posts its SessionResult.
Exit: Ellen's live session produces Escalate urgent -> surgeon on call from lib/rules.ts, with every key removed.
```

## 4J. Core intelligence (1:00–2:45) — Jeremiah

```
Read lib/types.ts (SessionResult, TriageCard, ClipRef, SearchHit), lib/ai/*.ts, lib/adapters/vast.ts,
and seed/patients.json (scripted_today, expected_triage).
1. VAST semantic search across all session clips; 6 s timeout; fallback = pre-indexed seed moments.
   C4 /clinic/search: "every time a patient pushed off the chair" -> SearchHit cards that open the clip
   at the matched moment.
2. lib/ai/cosmos.ts and lib/ai/agent.ts: Zod-validated outputs, 8 s timeout, one retry, then template
   fallback with a "Demo data" badge. The agent writes only the care-team note and route explanation;
   it never changes the recommendation. Wrap the agent call with W&B Weave tracing.
3. On session finish: rules (from lib/rules.ts once merged; scripted expected_triage until then) ->
   Cosmos -> agent -> TriageCard pushed to the console. C3 shows evidence frame, Cosmos sheet, rule fired.
Exit: search returns Ellen's and Ruth's push-off moments; Ellen's card renders with Cosmos and the agent
note, and again with every key removed.
```

## 5. Polish (2:45–3:45) — both, each on their own surface

```
Read AGENTS.md and the acceptance criteria in the build plan (§8).
Go screen by screen on both surfaces: loading, empty, success and error states; status never by color alone;
labels and focus rings; Reset demo (clears sessions, reloads seed). Add a Weave eval that runs the agent over
all 7 seeded sessions against expected_triage and shows the table. Do not add features.
Exit: no broken state anywhere on the primary path. Demo Lock at 3:45: after this, fixes and copy only.
```

## 6. Submission (3:45–4:30) — Jeremiah (Rex rehearses the phone flow)

```
Update README.md: demo link, screenshots, final architecture, the env vars actually used, known limitations.
Keep the Synthetic Hospital, CDC STEADI and SAMHSA credits. No code changes.
```
