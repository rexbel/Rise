# RehabNinja — 90-second pitch

Branch feature work lives on `jeremiah/keep-the-line` (merge to `main` only when asked). Offline. Synthetic data.

**Surfaces:** Lobby (`/` — Play / Try a demo) → profile picker (`/play`) → today’s move → frame check → fullscreen RehabNinja → questions → session report. Clinic strip is demo-only. Presenter bar is pitch-only (bottom-left, **H** to hide) — keep it outside the projector crop.

Assume the projector is muted: captions are the source of truth.

Voice Stop is off in `?demo=1`. Do not turn on recognition for the pitch.

## Setup

1. `npm run dev`
2. Pitch shortcut: `/play/rise-01?demo=1` (Ellen) or lobby **Try a demo**. Full journey: `/` → **Play** → pick patient.
3. Live play is fullscreen. Clinic strip on the right (lg+). Presenter stays bottom-left, off-crop.

## Script

1. **0–10s** Tap **Begin** (unlocks AudioContext + speechSynthesis). Demo skips ready → frame (auto-ok) → countdown → live. Coach: “Stand up — fruit slices when knees stay over your feet.”
2. **10–40s** Ellen RehabNinja: clean stand **apex** scores **hits** (slash + juice). From rise 3, arms → **bombs** on wrists. Rep counter to **6** — no STEADI, no stand count.
3. **40–55s** After the set, answer No on symptoms (or use **End set** then No on breath). Coach close is the locked nurse-callback / keep-phone-nearby line. Spoken + captions. Report shows workout name + hits.
4. **55–75s** Clinic strip is the same `PlaySession` (workout, hits, Demo data). Not a hardcoded card.
5. **75–90s** **Jump to questions** (set already finished — no replay). Advance to the breath/chest question. Tap **Yes** live → confirm → 911 (`tel:911`), care team told, follow-up.

## Operator keys (off projector)

| Key / control | Action |
| --- | --- |
| Begin | Audio unlock + skip to countdown/live in demo |
| H | Hide presenter bar |
| S / Stop | Pause set |
| Escape | Pause |
| End set | Finish script with Ellen arms finding |
| Jump to questions | Re-answer without a new live set |
| Step back | Tracking-loss prompt; resume keeps path and clock |
| Restart | Remount session |
| V / A | Inject hard valgus / arms while live |

No force-emergency control. 911 only via the real breath question + Yes.

If time: screen-record this path as backup.
