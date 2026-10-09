# Keep the Line — 90-second pitch

Branch: `jeremiah/keep-the-line` (do **not** merge to `main` until review). Offline. Synthetic data.

**Surfaces:** Lobby → Choose profile (`/play`) → condition + howto → fullscreen Fruit Ninja → questions → session report. Clinic strip is demo-only. Presenter bar is pitch-only (bottom-left, **H** to hide) — keep it outside the projector crop.

Assume the projector is muted: captions are the source of truth.

Voice Stop is off in `?demo=1`. Do not turn on recognition for the pitch.

## Setup

1. `npm run dev`
2. Pitch shortcut: `/play/rise-01?demo=1` (Ellen). Full journey: `/` → Choose profile → pick patient.
3. Live play is fullscreen. Clinic strip on the right (lg+). Presenter stays bottom-left, off-crop.

## Script

1. **0–10s** Tap **Begin** (unlocks AudioContext + speechSynthesis). Demo skips howto/ready/frame → countdown → live. “Can you keep the line?”
2. **10–40s** Ellen Fruit Ninja loop: clean rises score **hits** (green burst at knees + tone). From rise 2, arms → **miss diamonds** on wrists + line bend. Hit counter only — no stand count, no “3 of 6”.
3. **40–55s** After the set, answer No on symptoms (or use **End set** then No on breath). Coach close is the locked nurse-callback / keep-phone-nearby line. Spoken + captions.
4. **55–75s** Clinic strip is the same `PlaySession` (finding, state, Demo data, seed recommendation). Not a hardcoded card.
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
