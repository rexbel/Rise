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

export function sendResult(r: SessionResult) {
  void post(`/api/sessions/${encodeURIComponent(r.sessionId)}/result`, r)
}
