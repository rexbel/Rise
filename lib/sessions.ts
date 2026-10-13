/**
 * In-memory session store for the live board (plan §6b). One Node process, demo scale: no database, no auth.
 * Everything resets on server restart or Reset demo. The recommendation comes only from lib/rules.ts;
 * a person approves or downgrades it through approve(). Patient answers and notes stay on the card and
 * are never copied into the audit log.
 */
import protocol from "@/config/protocol.default.json"
import { triage } from "@/lib/rules"
import { getPatient, lastCheckIn } from "@/lib/seed"
import { belowAverageCutoff } from "@/lib/steadi"
import {
  SESSION_ID,
  type ApprovalRequest,
  type AuditEntry,
  type Recommendation,
  type RepEvent,
  type SessionResult,
  type SessionSnapshot,
  type SessionStreamMessage,
  type Surface,
  type TriageCard,
} from "@/lib/types"

const MAX_SESSIONS = 100

type Store = {
  sessions: Map<string, SessionSnapshot>
  listeners: Set<(m: SessionStreamMessage) => void>
}

// Survives dev hot reloads, which re-evaluate this module.
const g = globalThis as typeof globalThis & { __riseSessions?: Store }
const store: Store = (g.__riseSessions ??= { sessions: new Map(), listeners: new Set() })

export class SessionError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
  ) {
    super(message)
  }
}

/** riseId from a `<riseId>-<suffix>` session id, if it names a seed patient. */
export function riseIdOf(sessionId: string): string | null {
  if (!SESSION_ID.test(sessionId)) return null
  const riseId = sessionId.slice(0, 7)
  return getPatient(riseId) ? riseId : null
}

export function newSessionId(riseId: string, now = Date.now()): string {
  const rand = Math.random().toString(36).slice(2, 8)
  return `${riseId}-${now.toString(36)}${rand}`
}

export function listSessions(): SessionSnapshot[] {
  return [...store.sessions.values()].sort((a, b) => b.updatedAt - a.updatedAt)
}

export function getSession(sessionId: string): SessionSnapshot | undefined {
  return store.sessions.get(sessionId)
}

export function subscribe(listener: (m: SessionStreamMessage) => void): () => void {
  store.listeners.add(listener)
  return () => store.listeners.delete(listener)
}

function emit(m: SessionStreamMessage) {
  for (const l of store.listeners) {
    try {
      l(m)
    } catch {
      // A closed stream must not break the others.
    }
  }
}

function put(s: SessionSnapshot) {
  store.sessions.set(s.sessionId, s)
  if (store.sessions.size > MAX_SESSIONS) {
    const oldest = [...store.sessions.values()].sort((a, b) => a.updatedAt - b.updatedAt)[0]
    store.sessions.delete(oldest.sessionId)
  }
  emit({ type: "session", session: s })
  return s
}

function blank(sessionId: string, riseId: string, now: number, surface: Surface | null): SessionSnapshot {
  return {
    sessionId,
    riseId,
    surface,
    status: "invited",
    count: 0,
    armsUsed: false,
    tier: null,
    audit: [],
    invitedAt: null,
    updatedAt: now,
    demoData: false,
  }
}

/** Existing session, or a new one for a phone that opened a link without an invite. */
function ensure(sessionId: string, now: number): SessionSnapshot {
  const existing = store.sessions.get(sessionId)
  if (existing) return existing
  const riseId = riseIdOf(sessionId)
  if (!riseId) throw new SessionError("unknown session", 404)
  return blank(sessionId, riseId, now, null)
}

export function invite(riseId: string, surface: Surface, user = "Demo coordinator", now = Date.now()) {
  if (!getPatient(riseId)) throw new SessionError("unknown patient", 404)
  const sessionId = newSessionId(riseId, now)
  const entry: AuditEntry = { sessionId, riseId, action: "invited", user, at: now }
  put({ ...blank(sessionId, riseId, now, surface), invitedAt: now, audit: [entry] })
  const base = surface === "play" ? `/play/${riseId}` : `/p/${riseId}`
  return { sessionId, path: `${base}?s=${sessionId}`, sms: { sent: false, demoData: true } }
}

export function applyEvent(sessionId: string, e: RepEvent, now = Date.now()): SessionSnapshot {
  if (e.sessionId !== sessionId) throw new SessionError("session id mismatch", 400)
  const s = ensure(sessionId, now)
  // Once the card exists, late phone events must not move the tile backwards.
  if (s.card && e.type !== "keypoints") return s
  switch (e.type) {
    case "status":
      return put({ ...s, status: e.status, tier: e.tier ?? s.tier, updatedAt: now })
    case "rep":
      return put({ ...s, status: "testing", count: e.count, armsUsed: s.armsUsed || e.armsUsed, updatedAt: now })
    case "tier":
      return put({ ...s, tier: e.tier, updatedAt: now })
    case "stop":
      return put({ ...s, status: "paused", updatedAt: now })
    case "resume":
      return put({ ...s, status: "testing", updatedAt: now })
    case "finished_early":
      return put({ ...s, status: "questions", updatedAt: now })
    case "keypoints":
      // Not stored: the board only needs counts. Kept in the contract for VAST/Cosmos later.
      return s
  }
}

const NOTE_PHRASES = protocol.note_red_flag_phrases.map((p) => p.toLowerCase())

export function noteNeedsReview(note: string | undefined): boolean {
  if (!note) return false
  const n = note.toLowerCase()
  return NOTE_PHRASES.some((p) => new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(n))
}

export function buildCard(result: SessionResult): TriageCard {
  const patient = getPatient(result.riseId)
  if (!patient) throw new SessionError("unknown patient", 404)
  const prev = lastCheckIn(patient)
  const decision = triage(result, prev, patient.episode.post_op_day_today)
  const isPlay = result.protocol === "play_set"
  const warnings: string[] = []
  if (isPlay) warnings.push("Game set: a fixed rep target, not the CDC 30-second test. Not compared to CDC norms.")
  if (result.demoData) warnings.push("Demo data: part of this session came from a seeded replay.")
  if (result.stoppedEarly) warnings.push("Finished early: confirm whether this was a safety event.")
  const needsReview = noteNeedsReview(result.patientNote)
  if (needsReview) warnings.push("Patient note mentions a possible safety concern. Read it before deciding.")
  return {
    ...decision,
    sessionId: result.sessionId,
    riseId: result.riseId,
    protocol: result.protocol,
    exerciseId: result.exerciseId,
    metrics: {
      rawStands: result.rawStands,
      steadiScore: result.steadiScore,
      previousRawStands: prev?.raw_stands ?? null,
      previousSteadiScore: prev?.steadi_score ?? null,
      cdcCutoff: isPlay ? null : belowAverageCutoff(patient.demographics.age, patient.demographics.sex),
      armsUsed: result.armsUsed,
      armsFromRep: result.armsFromRep,
      asymmetryPct: result.asymmetryPct,
      pausesOver3s: result.pausesOver3s,
      tandemHoldS: result.tandemHoldS,
    },
    symptoms: result.symptoms,
    patientNote: result.patientNote,
    noteNeedsReview: needsReview,
    evidenceFrameUrls: [],
    tier: result.tier,
    approval: "pending",
    warnings,
    demoData: result.demoData,
  }
}

/**
 * Rules run here, on the server. Idempotent per session: the phone posts again when the patient adds a note,
 * and a decision a person already made is kept.
 */
export function applyResult(sessionId: string, result: SessionResult, now = Date.now()): TriageCard {
  if (result.sessionId !== sessionId) throw new SessionError("session id mismatch", 400)
  if (riseIdOf(sessionId) !== result.riseId) throw new SessionError("session does not match patient", 400)
  const s = ensure(sessionId, now)
  const fresh = buildCard(result)
  // A human decision covers the card it was made on. If the patient re-answered into a different rule or
  // recommendation, or a newly flagged note arrived, the card goes back to pending for a fresh look.
  const prev = s.card
  const sameDecision =
    prev !== undefined &&
    prev.recommendation === fresh.recommendation &&
    prev.ruleFired === fresh.ruleFired &&
    (prev.noteNeedsReview || !fresh.noteNeedsReview)
  const card: TriageCard = prev
    ? { ...fresh, approval: sameDecision ? prev.approval : "pending", careTeamNote: prev.careTeamNote }
    : fresh
  const status = card.recommendation === "human_confirm" || card.noteNeedsReview ? "needs_confirmation" : "ready"
  put({
    ...s,
    status,
    count: result.rawStands,
    armsUsed: result.armsUsed,
    tier: result.tier,
    card,
    demoData: result.demoData,
    updatedAt: now,
  })
  return card
}

const SEVERITY: Record<Recommendation, number> = { escalate_urgent: 3, human_confirm: 2, nurse_callback: 2, continue_plan: 1 }

export function approve(sessionId: string, req: ApprovalRequest, now = Date.now()): SessionSnapshot {
  const s = store.sessions.get(sessionId)
  if (!s) throw new SessionError("unknown session", 404)
  if (!s.card) throw new SessionError("no triage card yet", 409)
  if (s.card.approval !== "pending") throw new SessionError("already decided", 409)
  const from = s.card.recommendation

  if (req.action === "approve") {
    const edited = req.careTeamNote !== undefined && req.careTeamNote !== (s.card.careTeamNote ?? "")
    const entry: AuditEntry = { sessionId, riseId: s.riseId, action: "approved", from, to: from, user: req.user, at: now }
    return put({
      ...s,
      card: { ...s.card, approval: edited ? "edited" : "approved", careTeamNote: req.careTeamNote ?? s.card.careTeamNote },
      audit: [...s.audit, entry],
      updatedAt: now,
    })
  }

  const reason = protocol.downgrade_reasons.find((r) => r.code === req.reasonCode)
  if (!reason) throw new SessionError("unknown reason code", 400)
  if ("requires_free_text" in reason && reason.requires_free_text && !req.freeText?.trim()) {
    throw new SessionError("this reason needs a note", 400)
  }
  if (req.to === from || req.to === "human_confirm" || SEVERITY[req.to] > SEVERITY[from]) {
    throw new SessionError("a downgrade must lower the recommendation", 400)
  }
  const entry: AuditEntry = {
    sessionId,
    riseId: s.riseId,
    action: "downgraded",
    from,
    to: req.to,
    reasonCode: req.reasonCode,
    freeText: req.freeText?.trim() || undefined,
    user: req.user,
    at: now,
  }
  return put({ ...s, card: { ...s.card, approval: "downgraded" }, audit: [...s.audit, entry], updatedAt: now })
}

/** The recommendation that stands after any human decision (last downgrade wins). */
export function finalRecommendation(s: SessionSnapshot): Recommendation | null {
  if (!s.card) return null
  const down = [...s.audit].reverse().find((a) => a.action === "downgraded")
  return down?.to ?? s.card.recommendation
}

export function resetSessions() {
  store.sessions.clear()
  emit({ type: "reset" })
}
