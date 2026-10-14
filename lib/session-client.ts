/**
 * Phone -> app relay (plan §6b seams). Posts RepEvents and the final SessionResult to Jeremiah's routes.
 * Until those routes exist (404) or when offline, it logs to the browser console and carries on:
 * the patient's test never waits on the network.
 */
import type { RepEvent, SessionResult } from "@/lib/types"

let warned = false

async function post(path: string, body: unknown) {
  try {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), keepalive: true })
    if (!res.ok) throw new Error(`${res.status}`)
  } catch (e) {
    if (!warned) {
      console.info(`[rise] relay not reachable (${(e as Error).message}); logging events locally`)
      warned = true
    }
    console.debug("[rise]", path, body)
  }
}

export function sendEvent(e: RepEvent) {
  void post(`/api/sessions/${encodeURIComponent(e.sessionId)}/events`, e)
}

const RESULT_ATTEMPTS = 3
const RESULT_TIMEOUT_MS = 5000

/**
 * The result carries the red flag and the patient's answers, so it gets a timeout and bounded retries, and the
 * caller learns whether the server acknowledged it (the phone only says "your care team is being told" after).
 * 4xx answers other than 408/429 are not retried: the same body would fail again.
 */
export async function sendResult(r: SessionResult): Promise<boolean> {
  const path = `/api/sessions/${encodeURIComponent(r.sessionId)}/result`
  for (let attempt = 0; attempt < RESULT_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(r),
        keepalive: true,
        signal: AbortSignal.timeout(RESULT_TIMEOUT_MS),
      })
      if (res.ok) return true
      if (res.status < 500 && res.status !== 408 && res.status !== 429) break
    } catch {
      // network error or timeout: retry below
    }
    if (attempt < RESULT_ATTEMPTS - 1) await new Promise((done) => setTimeout(done, 500 * 3 ** attempt))
  }
  console.info("[rise] result not acknowledged by the server; kept on this phone only")
  console.debug("[rise]", path, r)
  return false
}
