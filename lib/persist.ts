/**
 * Durable storage for the session and crew stores. Off unless RISE_STORE_URL and RISE_STORE_KEY are set (local dev
 * stays in memory). On Cloudflare the rise-edge Worker serves that URL and keeps the snapshot in the container's
 * Durable Object storage (cloudflare/worker.ts), so check-ins, decisions and follow-ups survive the container sleeping.
 *
 * Load on server start (instrumentation.ts). Saving stays blocked until a load succeeds or the store says there is
 * nothing saved yet (404): a failed load retries with backoff and never lets an empty store overwrite the saved one.
 * After that: save after changes (debounced on every session write, plus a 10 s sweep that catches crew writes),
 * one save at a time, and only when the snapshot actually changed.
 */
import { z } from "zod"
import { exportCrew, importCrew, type CrewDump } from "@/lib/crew"
import { onDirty } from "@/lib/dirty"
import { exportSessions, importSessions, MAX_SESSIONS } from "@/lib/sessions"
import { SessionSnapshot } from "@/lib/types"

const DEBOUNCE_MS = 1000
const SWEEP_MS = 10_000
const TIMEOUT_MS = 8000
const RETRY_MS = [2000, 5000, 15_000, 30_000, 60_000]

/** Shape check before anything is replaced: a bad snapshot is rejected whole, never half-imported. */
const Pair = <T extends z.ZodTypeAny>(v: T) => z.tuple([z.string(), v])
const Snapshot = z.object({
  version: z.literal(1),
  savedAt: z.number(),
  sessions: z.array(SessionSnapshot).max(MAX_SESSIONS),
  crew: z.object({
    active: z.array(Pair(z.array(z.string()))),
    cheers: z.array(z.object({ from: z.string(), to: z.string(), cheerId: z.string(), at: z.number(), client: z.string() })),
    members: z.array(Pair(z.object({ joinedAt: z.number(), showPhoto: z.boolean(), source: z.string() }))),
    tokens: z.array(z.tuple([z.string(), z.string()])),
    paused: z.array(Pair(z.array(z.string()))),
    consent: z.array(z.record(z.string(), z.unknown())),
  }),
})

function config() {
  const url = process.env.RISE_STORE_URL
  const key = process.env.RISE_STORE_KEY
  return url && key ? { url, key } : null
}

type State = { started: boolean; loaded: boolean; last: string; saving: Promise<void> | null }
const g = globalThis as typeof globalThis & { __risePersist?: State }
const state = (g.__risePersist ??= { started: false, loaded: false, last: "", saving: null })

function body(): string {
  return JSON.stringify({ sessions: exportSessions(), crew: exportCrew() })
}

/**
 * One load attempt. "loaded" = imported, or nothing saved yet (404): saving may start. "failed" = try again; saving
 * stays blocked so the empty in-memory store can't overwrite the saved one.
 */
export async function loadSnapshot(): Promise<"loaded" | "failed" | "off"> {
  const c = config()
  if (!c) return "off"
  try {
    const res = await fetch(c.url, { headers: { "x-rise-store-key": c.key }, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (res.status === 404) {
      state.loaded = true
      state.last = body()
      return "loaded"
    }
    if (!res.ok) throw new Error(`store GET ${res.status}`)
    const parsed = Snapshot.safeParse(await res.json())
    if (!parsed.success) throw new Error(`snapshot failed validation: ${parsed.error.issues[0]?.path.join(".")}`)
    importCrew(parsed.data.crew as CrewDump)
    importSessions(parsed.data.sessions)
    state.loaded = true
    state.last = body()
    console.info(`[persist] loaded ${parsed.data.sessions.length} sessions saved at ${new Date(parsed.data.savedAt).toISOString()}`)
    return "loaded"
  } catch (e) {
    console.error("[persist] load failed; saving stays off until a load succeeds", String(e))
    return "failed"
  }
}

async function save() {
  const c = config()
  if (!c || !state.loaded) return
  if (state.saving) return state.saving
  state.saving = (async () => {
    const current = body()
    if (current === state.last) return
    const parsed = JSON.parse(current) as { sessions: unknown; crew: unknown }
    try {
      const res = await fetch(c.url, {
        method: "PUT",
        headers: { "x-rise-store-key": c.key, "content-type": "application/json" },
        body: JSON.stringify({ version: 1, savedAt: Date.now(), ...parsed }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (res.status === 413) throw new Error("snapshot too large for the store; saving is failing")
      if (!res.ok) throw new Error(`store PUT ${res.status}`)
      state.last = current
    } catch (e) {
      // Kept dirty: the next change or sweep retries.
      console.error("[persist] save failed", String(e))
    }
  })().finally(() => {
    state.saving = null
  })
  return state.saving
}

/** Retry the load until it succeeds; saving starts only after. Doesn't block the server from booting. */
async function loadUntilLoaded(attempt = 0) {
  if ((await loadSnapshot()) !== "failed") return
  const wait = RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)]
  setTimeout(() => void loadUntilLoaded(attempt + 1), wait).unref?.()
}

/** Called once from instrumentation.ts: load (retrying in the background if needed), then save after changes. */
export async function startPersisting() {
  if (!config() || state.started) return
  state.started = true
  if ((await loadSnapshot()) === "failed") void loadUntilLoaded(1)
  let timer: ReturnType<typeof setTimeout> | null = null
  onDirty(() => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void save(), DEBOUNCE_MS)
  })
  setInterval(() => void save(), SWEEP_MS).unref?.()
}

/** Tests only. */
export const __test = { state, save }
