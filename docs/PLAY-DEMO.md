# RehabNinja + clinic: pitch run

Offline. Synthetic data. Two screens: the clinic console on the projector, the phone (or a second window) for the patient.

**Journey:** clinic `/clinic` → **Send check-in** for Ellen (RehabNinja game, tick **Use demo recording** for a camera-free run) → open the link → player home → **Begin** → frame check → fullscreen RehabNinja → four questions → closing lines + optional note. The console tile follows live (Invited → Setting up → Testing with reps → Questions → Scoring → Ready / Needs confirmation); open it for the triage card and click **Approve** or **Downgrade** (reason required). Nothing escalates until that click.

The patient never sees a score, stand count, rank, or norm. The closing screen is one correction, then trend + next step + closure from `content/patient-lines.json`, chosen by `lib/rules.ts` on the actual session.

Assume the projector is muted: captions are the source of truth. Voice Stop is off in `?demo=1`.

## Setup

1. `npm run dev`, then **Reset demo** on the console.
2. Console on the projector at 1280×720: `/clinic`.
3. Patient: the link from the Send check-in dialog (or the shortcut `/play/rise-01?demo=1`, which creates its own session id). The lobby `/` and "Your week" `/play` also work but are not tied to an invite.
4. The presenter bar is hidden below the `lg` breakpoint; press **H** to show it. At `lg`+ it sits bottom-right over the clinic strip, never over Stop or the primary button.

## Script

1. **0–20s** Console: seven synthetic post-op patients. **Send check-in** → Ellen → RehabNinja → Create link. Tile appears: Invited.
2. **20–50s** Phone: open the link, **Begin**. Clean stands score hits; from rep 3, arms push off → bombs on the wrists. Console tile shows Testing with the live rep count.
3. **50–70s** Questions. Answer **Yes** to short of breath or chest pain: the 911 instructions show immediately with **Call now**. ("I tapped this by mistake" returns to the question.)
4. **70–90s** Console: the tile turns to **Escalate urgent → surgeon on call** with a Red flag marker. Open the card: rule fired and reasons, "Game set, not a CDC score", answers, audit trail. **Approve**.
5. Optional: re-run with No on every question to show the closing lines and the note box; a note mentioning a fall marks the card "Note needs review".

## Operator keys (off projector)

| Key / control | Action |
| --- | --- |
| Begin | Audio unlock + skip to countdown/live in demo |
| H | Show / hide presenter bar |
| S / Stop | Pause set |
| Escape | Pause |
| End set | Finish script with Ellen arms finding |
| Jump to questions | Re-answer without a new live set |
| Step back | Tracking-loss prompt; resume keeps path and clock |
| Restart | Remount session (same session id) |
| V / A | Inject hard valgus / arms while live |

Keys are ignored while typing in the note box. No force-emergency control: 911 only via the real breath question + Yes.

If time: screen-record this path as backup.
