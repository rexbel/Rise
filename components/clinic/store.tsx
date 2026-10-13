"use client"

/**
 * Live session state for the console. One EventSource on /api/sessions/stream shared by the board,
 * the patient list and the triage card. Reconnects with backoff; a snapshot on reconnect resyncs.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import type { ApprovalRequest, InviteResponse, SessionSnapshot, SessionStreamMessage, Surface } from "@/lib/types"
import { apiErrorMessage, backoffMs, NETWORK_ERROR, type PatientSummary } from "./format"

export const DEMO_USER = "Demo coordinator"

export type Connection =
  | { state: "connecting" }
  | { state: "open" }
  | { state: "retrying"; retryAt: number; attempt: number }

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; message: string }

type Store = {
  patients: PatientSummary[]
  patient: (riseId: string) => PatientSummary | undefined
  sessions: Map<string, SessionSnapshot>
  /** False until the first snapshot arrives (show skeletons). */
  loaded: boolean
  connection: Connection
  retryNow: () => void
  invite: (riseId: string, surface: Surface) => Promise<ApiResult<InviteResponse>>
  decide: (sessionId: string, req: ApprovalRequest) => Promise<ApiResult<SessionSnapshot>>
  /** Return a paused patient to their crew (audited on the server). */
  resumeCrew: (sessionId: string) => Promise<ApiResult<SessionSnapshot>>
  reset: () => Promise<ApiResult<null>>
  refresh: () => Promise<void>
}

const Ctx = createContext<Store | null>(null)

export function useClinic(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error("useClinic must be used inside <ClinicProvider>")
  return s
}

async function call<T>(url: string, init: RequestInit, parse: (r: Response) => Promise<T>): Promise<ApiResult<T>> {
  let res: Response
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) })
  } catch {
    return { ok: false, status: 0, message: NETWORK_ERROR }
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    return { ok: false, status: res.status, message: apiErrorMessage(res.status, body) }
  }
  return { ok: true, data: await parse(res) }
}

export function ClinicProvider({ patients, children }: { patients: PatientSummary[]; children: ReactNode }) {
  const [sessions, setSessions] = useState<Map<string, SessionSnapshot>>(() => new Map())
  const [loaded, setLoaded] = useState(false)
  const [connection, setConnection] = useState<Connection>({ state: "connecting" })
  const [epoch, setEpoch] = useState(0)
  const attempt = useRef(0)

  const upsert = useCallback((s: SessionSnapshot) => {
    setSessions((prev) => {
      const old = prev.get(s.sessionId)
      if (old && old.updatedAt > s.updatedAt) return prev
      const next = new Map(prev)
      next.set(s.sessionId, s)
      return next
    })
  }, [])

  useEffect(() => {
    let es: EventSource | null = new EventSource("/api/sessions/stream")
    let timer: ReturnType<typeof setTimeout> | undefined
    es.onopen = () => {
      attempt.current = 0
      setConnection({ state: "open" })
    }
    es.onmessage = (ev) => {
      let m: SessionStreamMessage
      try {
        m = JSON.parse(ev.data)
      } catch {
        return
      }
      if (m.type === "snapshot") {
        setSessions(new Map(m.sessions.map((s) => [s.sessionId, s])))
        setLoaded(true)
      } else if (m.type === "session") {
        upsert(m.session)
      } else if (m.type === "reset") {
        setSessions(new Map())
      }
    }
    es.onerror = () => {
      es?.close()
      es = null
      const n = attempt.current++
      const wait = backoffMs(n)
      setConnection({ state: "retrying", retryAt: Date.now() + wait, attempt: n + 1 })
      timer = setTimeout(() => setEpoch((e) => e + 1), wait)
    }
    return () => {
      clearTimeout(timer)
      es?.close()
    }
  }, [epoch, upsert])

  const retryNow = useCallback(() => {
    attempt.current = 0
    setConnection({ state: "connecting" })
    setEpoch((e) => e + 1)
  }, [])

  const refresh = useCallback(async () => {
    const r = await call("/api/sessions", { cache: "no-store" }, (res) => res.json() as Promise<SessionSnapshot[]>)
    if (r.ok) {
      setSessions(new Map(r.data.map((s) => [s.sessionId, s])))
      setLoaded(true)
    }
  }, [])

  const invite = useCallback(
    async (riseId: string, surface: Surface) => {
      const r = await call(
        "/api/sessions",
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ riseId, surface }) },
        (res) => res.json() as Promise<InviteResponse>,
      )
      // The stream normally delivers the new tile; refresh covers a paused stream.
      if (r.ok && connection.state !== "open") void refresh()
      return r
    },
    [connection.state, refresh],
  )

  const decide = useCallback(
    async (sessionId: string, req: ApprovalRequest) => {
      const r = await call(
        `/api/sessions/${encodeURIComponent(sessionId)}/approval`,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(req) },
        (res) => res.json() as Promise<SessionSnapshot>,
      )
      if (r.ok) upsert(r.data)
      else if (r.status === 409 || r.status === 404) void refresh()
      return r
    },
    [upsert, refresh],
  )

  const resumeCrew = useCallback(
    async (sessionId: string) => {
      const r = await call(
        `/api/sessions/${encodeURIComponent(sessionId)}/crew`,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "resume", user: DEMO_USER }) },
        (res) => res.json() as Promise<SessionSnapshot>,
      )
      if (r.ok) upsert(r.data)
      else if (r.status === 409 || r.status === 404) void refresh()
      return r
    },
    [upsert, refresh],
  )

  const reset = useCallback(async () => {
    const r = await call("/api/sessions/reset", { method: "POST" }, async () => null)
    if (r.ok) setSessions(new Map())
    return r
  }, [])

  const byId = useMemo(() => new Map(patients.map((p) => [p.riseId, p])), [patients])
  const patient = useCallback((riseId: string) => byId.get(riseId), [byId])

  const value = useMemo<Store>(
    () => ({ patients, patient, sessions, loaded, connection, retryNow, invite, decide, resumeCrew, reset, refresh }),
    [patients, patient, sessions, loaded, connection, retryNow, invite, decide, resumeCrew, reset, refresh],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** Re-render every `ms` so "2 min ago" and retry countdowns stay current. */
export function useNow(ms = 1000): number {
  // 0 during prerender (Cache Components forbids reading the clock there); the first tick fills it in.
  const [now, setNow] = useState(0)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const first = setTimeout(tick, 0)
    const t = setInterval(tick, ms)
    return () => {
      clearTimeout(first)
      clearInterval(t)
    }
  }, [ms])
  return now
}
