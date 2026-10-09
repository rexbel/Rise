# Rise

Rise lets a care team send a post-surgical patient a 2-minute, CDC-standard chair-stand check-in to their phone, then watch a video agent score it live and route anything worrying to the right clinician the same day.

Built for the Real-Time Video Agents Hack – NYC (VAST Builders Challenge). All patient data is synthetic.

> Status: pre-event scaffold. Product features are built on the day; see [docs/DAY-OF.md](docs/DAY-OF.md). Build plan: [docs/BUILD-PLAN.md](docs/BUILD-PLAN.md) (snapshot of the [live doc](https://claude.ai/code/artifact/dd20cc44-fbae-45d1-aa14-2fcd2f7f796a)). Two builders on two branches: `rex/pose` and `jeremiah/vast` (plan §6b).

## Problem
After a knee or hip replacement or hip fracture repair, the day-7 phone call hears "I'm fine," and functional decline goes unseen until the next visit or the ED.

## User
- **Patient** (60–80, one phone, often alone): runs a voice-led test from a texted link. Never sees a score.
- **Care coordinator / post-acute nurse**: launches check-ins, watches them live, reviews and acts on triage cards.

## Solution
CDC STEADI 30-Second Chair Stand on the patient's phone → on-device pose tracking (YOLO, MediaPipe fallback) counts stands and checks arm use → deterministic rules + NVIDIA Cosmos observation + W&B agent note → triage card on the clinic console → a human approves every escalation. Every session clip lands in VAST, so the console can search all check-ins in plain language ("every time a patient pushed off the chair"). Monitoring runs in 30-day episodes alongside in-person care, never instead of it.

## Demo
- Demo link: _TBD (Cloudflare tunnel URL on the day)_
- Screenshots / GIF: _TBD_

## Architecture
```
Clinic console ──Send check-in──> Twilio SMS ──> Patient phone (pose on-device)
Patient phone ──rep events + keypoints (Cloudflare Tunnel)──> Next.js app
Patient phone ──clip at end──> Next.js app ──> VAST (ingest + search)
Next.js app ──> Cosmos (observation) ──> W&B LLM agent (note, route; Weave traced)
Next.js app ──SSE live status──> Clinic console
```

## Stack
Next.js 16 (App Router) · TypeScript · Tailwind v4 · shadcn/ui · Zod · onnxruntime-web / MediaPipe Pose Landmarker · NVIDIA Cosmos · W&B Inference + Weave · VAST AI OS · CoreWeave · ElevenLabs (pre-rendered voice) · Twilio · Cloudflare Tunnel

## Local setup
```bash
npm install
cp .env.example .env.local   # optional; the seeded demo runs without keys
npm run dev                   # http://localhost:3000
npm run tunnel                # HTTPS URL for the phone (needs cloudflared)
npm run check                 # typecheck + tests (rules oracle on all 7 seed patients)
```
Add shadcn components with `npx shadcn@latest add <name>` (components.json is configured).

## Environment variables
See [.env.example](.env.example): ElevenLabs, Twilio, Cosmos, W&B, VAST, FHIR, public tunnel URL.

## Demo scenarios
Seven synthetic patients in [seed/patients.json](seed/patients.json) (see [seed/README.md](seed/README.md)): Ellen Marsh (hero, escalate), Judith Kerr (escalate), Walter Brandt (callback), Gary Lindqvist (on track), Diane Coulter (callback, reactivated episode), Ruth Abernathy (on track, arms every rep), Harold Pruitt (escalate to primary care, reactivated).

## Limitations
- Remote, phone-scored STEADI administration is not validated; Rise compares patients mainly to themselves and triggers a human call, not a diagnosis.
- Synthetic data only. No production auth, EHR connection, or compliance infrastructure.
- Billing views count data days, minutes, and calls; billing decisions belong to the practice.

## Roadmap
Timed Up and Go and full 4-Stage Balance · spoken answers via CareBridge Voice · validation study vs. clinician scoring · FHIR write-back to Epic / Oracle Health · caregiver view.

## Team and credits
- Rex Belgarde — YOLO pose, patient phone, triage rules and cadence, Twilio.
- Jeremiah — VAST ingest and search, Cosmos, W&B agent and Weave eval, live relay, clinic console.
- Patients: [Synthetic Hospital v1.3](https://github.com/sparkcpark/synthetic_hospital) (MIT), Park, Chen, Dettmers, 2026.
- Protocol: CDC STEADI [30-Second Chair Stand](https://www.cdc.gov/steadi/media/pdfs/STEADI-Assessment-30Sec-508.pdf) and [4-Stage Balance](https://www.cdc.gov/steadi/media/pdfs/STEADI-Assessment-4Stage-508.pdf).
- Patient language: SAMHSA's six trauma-informed principles.
- UI: [shadcn/ui](https://ui.shadcn.com).
