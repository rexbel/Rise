# Cursor prompts for build day

Paste one prompt per phase into Cursor (Agent mode). Each one names what to read first, the job, and the exit check. Cursor also loads `.cursor/rules/rise.mdc` and `AGENTS.md` automatically. If a prompt grows past its phase, stop and park the extra idea in the plan's Post-hackathon list.

After every prompt: `npm run check`, try it on the phone through the tunnel, commit, push. CI runs the same checks plus lint and build on every push.

---

## 0. Kickoff (9:30)

```
Read AGENTS.md, docs/DAY-OF.md, config/protocol.default.json, lib/types.ts and lib/seed.ts.
Don't write code yet. Summarize back to me: the two surfaces, the 8 triage rules in lib/rules.ts,
what the patient phone must never show, and the pose tier ladder with its fps thresholds.
Then list the files you expect to create today, in the order of docs/DAY-OF.md.
```

## 1. Risk first: pose on the phone (10:00–11:00)

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
Exit: on my phone via the tunnel, the counter counts 5 real stands correctly and flags arms when I push off.
```

## 2. Static slice: both surfaces on seed data (11:00–12:15)

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

## 3. Live relay (12:15–1:00)

```
Read lib/types.ts (RepEvent, SessionStatus, SessionResult).
Add an in-memory session store (lib/sessions.ts), POST /api/sessions/[id]/events for phone events,
and GET /api/sessions/stream as Server-Sent Events for the console board. Wire the phone to post
status, rep, stop, resume and finished_early events, and the C2 tiles to update live.
Exit: during a test on my phone, the console tile shows the live count within 1 second.
```

## 4. Core intelligence (1:00–2:45)

```
Read lib/rules.ts, tests/seed.test.ts (the oracle), lib/cadence.ts, seed/build_seed.py (next_checkin),
config/protocol.default.json, lib/ai/*.ts and lib/adapters/*.ts.
1. Implement lib/rules.ts exactly per its comment table; add tests that it matches the oracle for all 7
   patients plus a stopped-early case (human_confirm).
2. Implement lib/cadence.ts to match next_checkin in seed/build_seed.py, reading defaults from config.
3. lib/ai/cosmos.ts and lib/ai/agent.ts: Zod-validated outputs, 8 s timeout, one retry, then template
   fallback with a "Demo data" badge. The agent writes only the care-team note and route explanation.
   Wrap the agent call with W&B Weave tracing.
4. lib/adapters/twilio.ts (invite + callback SMS, QR fallback) and lib/adapters/vast.ts (clip upload,
   local-file fallback). Read keys from env; with no keys, everything falls back cleanly.
5. On session finish: rules -> Cosmos -> agent -> TriageCard pushed to the console.
Exit: Ellen's live session produces Escalate urgent -> surgeon on call, live and with every key removed.
```

## 5. Polish (2:45–3:45)

```
Read AGENTS.md and the acceptance criteria in the build plan (§8).
Go screen by screen on both surfaces: loading, empty, success and error states; status never by color alone;
labels and focus rings; Reset demo (clears sessions, reloads seed). Add a Weave eval that runs the agent over
all 7 seeded sessions against expected_triage and shows the table. Do not add features.
Exit: no broken state anywhere on the primary path. Demo Lock at 3:45: after this, fixes and copy only.
```

## 6. Submission (3:45–4:30)

```
Update README.md: demo link, screenshots, final architecture, the env vars actually used, known limitations.
Keep the Synthetic Hospital, CDC STEADI and SAMHSA credits. No code changes.
```
