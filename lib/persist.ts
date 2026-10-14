/**
 * Durable storage for the session and crew stores. Off unless RISE_STORE_URL and RISE_STORE_KEY are set (local dev
 * stays in memory). On Cloudflare the rise-edge Worker serves that URL and keeps the snapshot in the container's
 * Durable Object storage (cloudflare/worker.ts), so check-ins, decisions and follow-ups survive the container sleeping.
 *
 * Load once on server start (instrumentation.ts). Save after changes: debounced on every session write, plus a
 * 10 s check that catches crew writes; a save only goes out when the snapshot actually changed.
 */
import { exportCrew, importCrew, type CrewDump } from "@/lib/crew"
import { onDirty } from "@/lib/dirty"
import { exportSessions, importSessions } from "@/lib/sessions"
import type { SessionSnapshot } from "@/lib/types"

type Snapshot = { version: 1; savedAt: number; sessions: SessionSnapshot[]; crew: CrewDump }

const DEBOUNCE_MS = 1000
const SWEEP_MS = 10_000
const TIMEOUT_MS = 5000

function config() {
  const url = process.env.RISE_STORE_URL
  const key = process.env.RISE_STORE_KEY
  return url && key ? { url, key } : null
}

const g = globalThis as typeof globalThis & { __risePersist?: { started: boolean; last: string } }
const state = (g.__risePersist ??= { started: false, last: "" })

function body(): string {
  return JSON.stringify({ sessions: exportSessions(), crew: exportCrew() })
}

/** Load the saved snapshot. Never throws: a store outage means starting empty, not failing to boot. */
export async function loadSnapshot(): Promise<boolean> {
  const c = config()
  if (!c) return false
  try {
    const res = await fetch(c.url, { headers: { "x-rise-store-key": c.key }, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (res.status === 404) return false
    if (!res.ok) throw new Error(`store GET ${res.status}`)
    const snap = (await res.json()) as Snapshot
    if (snap.version !== 1) return false
    importCrew(snap.crew)
    importSessions(snap.sessions)
    state.last = body()
    console.info(`[persist] loaded ${snap.sessions.length} sessions saved at ${new Date(snap.savedAt).toISOString()}`)
    return true
  } catch (e) {
    console.error("[persist] load failed; starting empty", String(e))
    return false
  }
}

async function save() {
  const c = config()
  if (!c) return
  const current = body()
  if (current === state.last) return
  const { sessions, crew } = JSON.parse(current) as Omit<Snapshot, "version" | "savedAt">
  const snap: Snapshot = { version: 1, savedAt: Date.now(), sessions, crew }
  try {
    const res = await fetch(c.url, {
      method: "PUT",
      headers: { "x-rise-store-key": c.key, "content-type": "application/json" },
      body: JSON.stringify(snap),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`store PUT ${res.status}`)
    state.last = current
  } catch (e) {
    // Kept dirty: the next change or sweep retries.
    console.error("[persist] save failed", String(e))
  }
}

/** Start saving after changes. Idempotent. */
export function startPersisting() {
  if (!config() || state.started) return
  state.started = true
  let timer: ReturnType<typeof setTimeout> | null = null
  onDirty(() => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void save(), DEBOUNCE_MS)
  })
  setInterval(() => void save(), SWEEP_MS).unref?.()
}
