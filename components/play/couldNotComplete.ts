/**
 * Honest check-in helpers shared by the classic check-in (/p) and RehabNinja (/play).
 * A real invite (from the console, not for the demo recording) never falls back to the demo replay: when the camera or
 * body tracker fails, the patient gets help and can tell the care team they couldn't do it today.
 * No React here, so these run in vitest.
 */
import { inviteHeaders } from "@/lib/session-client"
import type { PatientInvite } from "@/lib/types"

export type CouldNotCompleteReason = "camera" | "tracker"

/** A console invite for the patient's own camera. Unlinked visits (no invite) and demo invites are not "real". */
export function isRealInvite(invite: Pick<PatientInvite, "demo"> | null | undefined): boolean {
  return !!invite && !invite.demo
}

/** RehabNinja: PlayProvider exposes `invited` and the server-decided `demo`. */
export function isRealPlay(invited: boolean, demo: boolean): boolean {
  return invited && !demo
}

type TrackLike = { readyState: string }
type StreamLike = { getVideoTracks: () => TrackLike[] }

/**
 * Why the start failed, from the video element's stream: a live camera track means the camera opened and the body
 * tracker is what failed; no live track means the camera itself did not open (permission, busy, missing).
 */
export function failureReason(stream: StreamLike | MediaProvider | null | undefined): CouldNotCompleteReason {
  const s = stream as Partial<StreamLike> | null | undefined
  const live = typeof s?.getVideoTracks === "function" && s.getVideoTracks().some((t) => t.readyState === "live")
  return live ? "tracker" : "camera"
}

const ATTEMPTS = 3
const TIMEOUT_MS = 5000

/**
 * Tell the care team this real check-in couldn't be done. Unlike the fire-and-forget rep events, the patient only
 * sees "your care team will see it" once the server acknowledged it, so this waits, with a timeout and bounded
 * retries. The server ignores it once a card exists, and repeating it only refreshes the status, so a retry is safe.
 */
export async function reportCouldNotComplete(
  sessionId: string,
  reason: CouldNotCompleteReason,
  opts: { fetchImpl?: typeof fetch; now?: () => number; backoffMs?: (attempt: number) => number } = {},
): Promise<boolean> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const now = opts.now ?? Date.now
  const backoff = opts.backoffMs ?? ((a: number) => 500 * 3 ** a)
  const path = `/api/sessions/${encodeURIComponent(sessionId)}/events`
  const body = JSON.stringify({ type: "could_not_complete", sessionId, reason, at: now() })
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    try {
      const res = await fetchImpl(path, {
        method: "POST",
        headers: { "content-type": "application/json", ...inviteHeaders() },
        body,
        keepalive: true,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (res.ok) return true
      // A 4xx (other than timeout or rate limit) would fail again with the same body.
      if (res.status < 500 && res.status !== 408 && res.status !== 429) return false
    } catch {
      // network error or timeout: retry below
    }
    if (attempt < ATTEMPTS - 1) await new Promise((done) => setTimeout(done, backoff(attempt)))
  }
  return false
}
