/**
 * Which next check-in stands for a patient, from their sessions. One rule for the server (patient home) and the
 * console patient list, so they never disagree. Pure: no store, no React.
 *
 * 1. Any open follow-up wins: the patient is waiting on the care team (paused), whatever an older or newer session says.
 * 2. Otherwise the session with the most recent decision (approve, downgrade, follow-up closed or cancelled) stands.
 *    Touching a session for other reasons (a crew return, a late note) does not move it to the front.
 * 3. No decided session: null, so the caller falls back to the seed's schedule.
 */
import type { NextCheckIn, SessionSnapshot } from "@/lib/types"

const DECISIONS = new Set(["approved", "downgraded", "followup_closed", "followup_cancelled", "followup_opened"])

/** When this session's schedule was last set by a person's decision, or null if never. */
export function decidedAt(s: SessionSnapshot): number | null {
  let at: number | null = null
  for (const a of s.audit) if (DECISIONS.has(a.action) && (at === null || a.at > at)) at = a.at
  return at
}

export function standingNextCheckIn(sessions: SessionSnapshot[], riseId: string): NextCheckIn | null {
  const mine = sessions.filter((s) => s.riseId === riseId)
  const waiting = mine
    .filter((s) => s.followUp?.status === "open" && s.nextCheckIn)
    .sort((a, b) => (b.followUp?.awaitingClearance ? 1 : 0) - (a.followUp?.awaitingClearance ? 1 : 0))[0]
  if (waiting?.nextCheckIn) return waiting.nextCheckIn
  let best: { at: number; nc: NextCheckIn } | null = null
  for (const s of mine) {
    const at = decidedAt(s)
    if (at !== null && s.nextCheckIn && (!best || at > best.at)) best = { at, nc: s.nextCheckIn }
  }
  return best?.nc ?? null
}
