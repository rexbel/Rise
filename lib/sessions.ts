/**
 * In-memory session store for the live board (plan §6b). One Node process, demo scale: no auth. Every write
 * marks the store dirty; on Cloudflare lib/persist.ts saves it durably and reloads it on start. Reset demo clears it. The recommendation comes only from lib/rules.ts;
 * a person approves or downgrades it through approve(). Patient answers and notes stay on the card and
 * are never copied into the audit log.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import protocol from "@/config/protocol.default.json"
import { markActive, resetCrew, syncPause } from "@/lib/crew"
import { cadenceInputFor, dueOn, nextCheckIn } from "@/lib/cadence"
import { markDirty } from "@/lib/dirty"
import { triage } from "@/lib/rules"
import { standingNextCheckIn } from "@/lib/schedule"
import { getPatient, lastCheckIn } from "@/lib/seed"
import { belowAverageCutoff } from "@/lib/steadi"
import {
  SESSION_ID,
  type ApprovalRequest,
  type CrewResumeRequest,
  type AuditEntry,
  type FollowUp,
  type FollowUpRequest,
  type PatientInvite,
  type NextCheckIn,
  type Recommendation,
  type RepEvent,
  type SessionResult,
  type SessionSnapshot,
  type SessionStreamMessage,
  type Surface,
  type TriageCard,
  type Trend,
} from "@/lib/types"

export const MAX_SESSIONS = 100
const MAX_AUDIT = 50
/** Prefix of the card warning that records an earlier result the patient's later answers replaced. */
export const REVISION_PREFIX = "Answers changed after the first report."
/** Kept on every later card for the session: the care team must learn a red flag was shown, even if retracted. */
export const RETRACTED_PREFIX = "Red flag retracted:"

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
    readonly status: 400 | 403 | 404 | 409,
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

/**
 * Pause the patient on their crew while the care team is checking on them: a red flag (even retracted), an
 * escalation, or a human-confirm card, until a person returns them to the crew (crew_resumed, only on a decided card)
 * or downgrades the card. Any change in the patient's answers after that (answers_changed, reopened, a retracted red
 * flag, a new set) ends the resume, so a later red flag always pauses again.
 */
function crewPause(s: SessionSnapshot): boolean {
  if (!s.card) return false
  const turns = ["crew_resumed", "answers_changed", "reopened", "red_flag_retracted", "restarted"]
  const lastTurn = [...s.audit].reverse().find((a) => turns.includes(a.action))
  if (lastTurn?.action === "crew_resumed") return false
  const final = finalRecommendation(s)
  return (
    s.card.emergency ||
    s.card.warnings.some((w) => w.startsWith(RETRACTED_PREFIX)) ||
    (final !== null && (protocol.crew.pause_on as string[]).includes(final))
  )
}

function put(next: SessionSnapshot) {
  const s = { ...next, crewPaused: crewPause(next) }
  store.sessions.set(s.sessionId, s)
  syncPause(s.riseId, s.sessionId, s.crewPaused)
  if (store.sessions.size > MAX_SESSIONS) {
    // Unlinked visits go first; invited sessions after; anything a person still owes (a pending card, an open
    // follow-up) last. Unlinked posts can't push a patient's invite out of the store.
    const waiting = (x: SessionSnapshot) =>
      x.card?.approval === "pending" || x.followUp?.status === "open" ? 2 : x.inviteTokenHash ? 1 : 0
    const oldest = [...store.sessions.values()].sort((a, b) => waiting(a) - waiting(b) || a.updatedAt - b.updatedAt)[0]
    store.sessions.delete(oldest.sessionId)
    // An evicted invite's id must never come back as an unlinked session that takes writes without the token.
    if (oldest.inviteTokenHash) retireId(oldest.sessionId)
    // An evicted session can no longer be resumed from the console, so it stops holding a pause.
    syncPause(oldest.riseId, oldest.sessionId, false)
  }
  emit({ type: "session", session: s })
  markDirty()
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
    crewPaused: false,
    invitedAt: null,
    updatedAt: now,
    demoData: false,
    inviteDemo: null,
    inviteTokenHash: null,
    setup: { confirmed: [], skipped: false, at: null },
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex")
  const y = Buffer.from(b, "hex")
  return x.length === y.length && timingSafeEqual(x, y)
}

/**
 * Writes to a session sent from the console need its invite token (x-rise-invite). Knowing the session id, which
 * the board shows, is not enough. Unlinked visits (no invite) stay open, as before: they are labeled, not trusted.
 */
export function checkInviteToken(sessionId: string, token: string | null | undefined) {
  const s = store.sessions.get(sessionId)
  if (!s?.inviteTokenHash) return
  if (!token || !sameHash(hashToken(token), s.inviteTokenHash)) throw new SessionError("this check-in link is not valid here", 403)
}

/** True when `token` is this session's invite token (crew join uses it to verify the patient). */
export function inviteTokenMatches(sessionId: string, token: string | null | undefined): boolean {
  const s = store.sessions.get(sessionId)
  return !!s?.inviteTokenHash && !!token && sameHash(hashToken(token), s.inviteTokenHash)
}

/** "Your week" page: the invite behind a token for any patient (it learns the patient from the invite). */
export function resolveInviteToken(token: string | undefined): (PatientInvite & { riseId: string }) | null {
  if (!token || token.length > 100) return null
  const h = hashToken(token)
  for (const s of store.sessions.values()) {
    if (s.inviteTokenHash && s.surface && sameHash(h, s.inviteTokenHash)) {
      return { sessionId: s.sessionId, token, demo: !!s.inviteDemo, surface: s.surface, riseId: s.riseId }
    }
  }
  return null
}

/**
 * Patient page: the invite behind a link token, or null if it isn't valid for this patient. The server decides demo
 * or real from the invite; the link's own parameters never can.
 */
export function resolveInvite(riseId: string, token: string | undefined): PatientInvite | null {
  if (!token || token.length > 100) return null
  const h = hashToken(token)
  for (const s of store.sessions.values()) {
    if (s.riseId === riseId && s.inviteTokenHash && s.surface && sameHash(h, s.inviteTokenHash)) {
      return { sessionId: s.sessionId, token, demo: !!s.inviteDemo, surface: s.surface }
    }
  }
  return null
}

/** Existing session, or a new one for a phone that opened a link without an invite. */
/** Ids of evicted invited sessions: never recreated as unlinked sessions. Bounded; oldest forgotten first. */
const RETIRED_MAX = 2000
const gr = globalThis as typeof globalThis & { __riseRetired?: Set<string> }
const retired = (gr.__riseRetired ??= new Set<string>())
function retireId(id: string) {
  retired.add(id)
  if (retired.size > RETIRED_MAX) retired.delete(retired.values().next().value as string)
}

function ensure(sessionId: string, now: number): SessionSnapshot {
  const existing = store.sessions.get(sessionId)
  if (existing) return existing
  if (retired.has(sessionId)) throw new SessionError("this check-in link is not valid here", 403)
  const riseId = riseIdOf(sessionId)
  if (!riseId) throw new SessionError("unknown session", 404)
  // On the public tunnel (console key set) only invited sessions reach the board.
  if (process.env.CONSOLE_KEY) throw new SessionError("unknown session", 404)
  return blank(sessionId, riseId, now, null)
}

export function invite(riseId: string, surface: Surface, user = "Demo coordinator", now = Date.now(), demo = false) {
  if (!getPatient(riseId)) throw new SessionError("unknown patient", 404)
  const sessionId = newSessionId(riseId, now)
  // 192 random bits, URL-safe. Only its hash is stored (and saved); the token itself lives in the link.
  const token = randomBytes(24).toString("base64url")
  const entry: AuditEntry = { sessionId, riseId, action: "invited", user, at: now }
  put({ ...blank(sessionId, riseId, now, surface), invitedAt: now, inviteDemo: demo, inviteTokenHash: hashToken(token), demoData: demo, audit: [entry] })
  const base = surface === "play" ? `/play/${riseId}` : `/p/${riseId}`
  return { sessionId, path: `${base}?i=${token}`, sms: { sent: false, demoData: true } }
}

export function applyEvent(sessionId: string, e: RepEvent, now = Date.now(), token?: string | null): SessionSnapshot {
  if (e.sessionId !== sessionId) throw new SessionError("session id mismatch", 400)
  checkInviteToken(sessionId, token)
  const s = ensure(sessionId, now)
  const setup = s.setup ?? { confirmed: [], skipped: false, at: null }
  if (e.type === "setup_confirmed") {
    const confirmed = setup.confirmed.includes(e.check) ? setup.confirmed : [...setup.confirmed, e.check]
    return put({ ...s, setup: { ...setup, confirmed, at: now }, updatedAt: now })
  }
  if (e.type === "setup_skipped") {
    if (s.inviteDemo === false) throw new SessionError("safety checks can't be skipped on a real check-in", 409)
    return put({ ...s, setup: { ...setup, skipped: true, at: now }, updatedAt: now })
  }
  if (e.type === "could_not_complete") {
    // Only a real invite reports this; a demo or unlinked visit would look like a real patient on the board.
    if (s.inviteDemo !== false) throw new SessionError("only a real check-in can report this", 409)
    // The phone must never tell the patient "your care team will see it" when nothing new was recorded.
    if (s.card) throw new SessionError("this check-in already has a result", 409)
    // The phone retries until acknowledged: a repeat while the report stands changes nothing and isn't audited twice.
    if (s.status === "could_not_complete" && s.couldNotComplete?.reason === e.reason) return s
    const entry: AuditEntry = { sessionId, riseId: s.riseId, action: "could_not_complete", reasonCode: e.reason, user: "Patient phone", at: now }
    const audit = [...s.audit, entry]
    // Someone owns it: a follow-up on Today (a call to help), unless one is already open for this session.
    let followUp = s.followUp
    if (followUp?.status !== "open") {
      followUp = {
        status: "open",
        kind: "could_not_complete",
        recommendation: "nurse_callback",
        route: "care_coordinator",
        openedAt: now,
        attempts: 0,
        awaitingClearance: false,
        lastAttemptAt: null,
        outcome: null,
        note: null,
        closedAt: null,
        closedBy: null,
      }
      audit.push({ sessionId, riseId: s.riseId, action: "followup_opened", to: "nurse_callback", reasonCode: "could_not_complete", user: "Rise", at: now })
    }
    return put({
      ...s,
      status: "could_not_complete",
      couldNotComplete: { reason: e.reason, at: now },
      followUp,
      nextCheckIn: waitingFor(WAITING_CALL),
      // A real attempt: nothing from a replay is involved.
      demoData: false,
      audit: audit.slice(-MAX_AUDIT),
      updatedAt: now,
    })
  }
  // After a reported couldn't-complete, stray phone events (a voice "stop", a late status) can't hide it. Only an
  // explicit new attempt (status setting_up) starts over; the report stays in the audit trail and on Today.
  if (s.status === "could_not_complete" && !(e.type === "status" && e.status === "setting_up")) return s
  if (s.status === "could_not_complete") return put({ ...s, status: "setting_up", couldNotComplete: undefined, updatedAt: now })
  // A demo replay may restart a set, but never one that is keeping the patient off their crew: only a person
  // lifts that (crew_resumed or a downgrade).
  if (s.card && e.type === "status" && e.status === "setting_up" && s.card.demoData && !crewPause(s)) {
    // A replayed demo set (presenter Restart keeps the id) starts a fresh attempt. Cards from a real,
    // non-demo session are never cleared by the phone.
    const entry: AuditEntry = { sessionId, riseId: s.riseId, action: "restarted", from: s.card.recommendation, user: "Patient phone (demo replay)", at: now }
    return put({ ...s, card: undefined, status: "setting_up", count: 0, armsUsed: false, audit: [...s.audit, entry].slice(-MAX_AUDIT), updatedAt: now })
  }
  // Once the card exists, late phone events must not move the tile backwards.
  if (s.card && e.type !== "keypoints") return s
  switch (e.type) {
    case "status":
      return put({ ...s, status: e.status, tier: e.tier ?? s.tier, updatedAt: now })
    case "rep":
      // Fire-and-forget posts can arrive out of order; the count only goes up within an attempt.
      return put({ ...s, status: "testing", count: Math.max(s.count, e.count), armsUsed: s.armsUsed || e.armsUsed, updatedAt: now })
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

/** Phone keyboards type curly apostrophes and line breaks; match on plain text. */
function normalizeNote(text: string): string {
  return text.toLowerCase().replace(/[\u2018\u2019\u02bc`]/g, "'").replace(/\s+/g, " ")
}

const NOTE_PHRASES = protocol.note_red_flag_phrases.map(normalizeNote)

export function noteNeedsReview(note: string | undefined): boolean {
  if (!note) return false
  const n = normalizeNote(note)
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
  const scripted = result.scripted ?? []
  if (!scripted.includes("new_incontinence") && !scripted.includes("gait")) {
    warnings.push("Non-surgical check not evaluated: incontinence is not asked on the phone and gait is not observed.")
  }
  if (scripted.length) warnings.push(`Scripted, not measured: ${scripted.join(", ")}.`)
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
    scripted,
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
export function applyResult(sessionId: string, result: SessionResult, now = Date.now(), token?: string | null): TriageCard {
  if (result.sessionId !== sessionId) throw new SessionError("session id mismatch", 400)
  if (riseIdOf(sessionId) !== result.riseId) throw new SessionError("session does not match patient", 400)
  checkInviteToken(sessionId, token)
  const s = ensure(sessionId, now)
  // A real invite never takes a replayed result: the card would show demo numbers for a real patient.
  if (s.inviteDemo === false && result.demoData) throw new SessionError("this check-in takes the patient's own camera only, not a demo", 409)
  const prev = s.card
  // Re-answering resends the result without the note the patient already sent; keep it.
  const fresh = buildCard(prev?.patientNote && !result.patientNote ? { ...result, patientNote: prev.patientNote } : result)
  let card: TriageCard = fresh
  let audit = s.audit
  if (prev) {
    // A human decision covers exactly the data it was made on. Adding a note is the only change that keeps it
    // (unless the note itself needs review). Any other change reopens the card and records what it replaced,
    // so a later, milder answer can never quietly overwrite an escalation.
    const onlyNote = sameFindings(prev, fresh) && (prev.noteNeedsReview || !fresh.noteNeedsReview)
    const revisions = prev.warnings.filter((w) => w.startsWith(REVISION_PREFIX) || w.startsWith(RETRACTED_PREFIX))
    if (!sameFindings(prev, fresh)) {
      revisions.push(`${REVISION_PREFIX} Earlier: ${prev.recommendation} (rule ${prev.ruleFired}).`)
    }
    const retracted = prev.ruleFired === "red_flag" && fresh.ruleFired !== "red_flag"
    if (retracted) {
      revisions.push(
        `${RETRACTED_PREFIX} the patient answered Yes to shortness of breath or chest pain and was shown the 911 instructions, then said it was a mistake. A person should decide whether to call.`,
      )
      audit = [...audit, { sessionId, riseId: s.riseId, action: "red_flag_retracted" as const, from: prev.recommendation, to: fresh.recommendation, user: "Patient phone", at: now }].slice(-MAX_AUDIT)
    }
    card = {
      ...fresh,
      approval: onlyNote ? prev.approval : "pending",
      careTeamNote: prev.careTeamNote,
      // Retractions are never trimmed; revision notes keep the latest five.
      warnings: [
        ...revisions.filter((w) => w.startsWith(RETRACTED_PREFIX)),
        ...revisions.filter((w) => w.startsWith(REVISION_PREFIX)).slice(-5),
        ...fresh.warnings,
      ],
    }
    if (prev.approval !== "pending" && card.approval === "pending") {
      const entry: AuditEntry = { sessionId, riseId: s.riseId, action: "reopened", from: prev.recommendation, to: fresh.recommendation, user: "Rise rules (new patient input)", at: now }
      audit = [...audit, entry].slice(-MAX_AUDIT)
    } else if (!sameFindings(prev, fresh)) {
      // Pending card, new answers: recorded so a crew resume never outlives them.
      const entry: AuditEntry = { sessionId, riseId: s.riseId, action: "answers_changed", from: prev.recommendation, to: fresh.recommendation, user: "Rise rules (new patient input)", at: now }
      audit = [...audit, entry].slice(-MAX_AUDIT)
    }
  }
  // A finished set makes today an active day on the crew board, but never a red-flag session: peers must not
  // see "Today" (or cheer) while the patient is being told to call 911. A later re-answer of the same session
  // does not count either; a retracted red flag waits for a person, not the crew.
  if (!prev && !card.emergency) markActive(result.riseId, now)
  const status = card.recommendation === "human_confirm" || card.noteNeedsReview ? "needs_confirmation" : "ready"
  put({
    ...s,
    status,
    count: result.rawStands,
    armsUsed: result.armsUsed,
    tier: result.tier,
    card,
    audit,
    demoData: result.demoData,
    updatedAt: now,
  })
  return card
}

/** Everything a decision rests on, except the patient's free-text note. */
function sameFindings(a: TriageCard, b: TriageCard): boolean {
  const core = (c: TriageCard) =>
    JSON.stringify([c.recommendation, c.route, c.ruleFired, c.reasons, c.emergency, c.metrics, c.symptoms, c.protocol, c.tier])
  return core(a) === core(b)
}

const SEVERITY: Record<Recommendation, number> = { escalate_urgent: 3, human_confirm: 2, nurse_callback: 2, continue_plan: 1 }

export function approve(sessionId: string, req: ApprovalRequest, now = Date.now()): SessionSnapshot {
  return put(afterDecision(decide(sessionId, req, now), now, req.user))
}

function decide(sessionId: string, req: ApprovalRequest, now: number): SessionSnapshot {
  const s = store.sessions.get(sessionId)
  if (!s) throw new SessionError("unknown session", 404)
  if (!s.card) throw new SessionError("no triage card yet", 409)
  if (s.card.approval !== "pending") throw new SessionError("already decided", 409)
  if (
    (req.expectRecommendation && req.expectRecommendation !== s.card.recommendation) ||
    (req.expectRule && req.expectRule !== s.card.ruleFired)
  ) {
    throw new SessionError("card changed", 409)
  }
  const from = s.card.recommendation

  if (req.action === "approve") {
    const edited = req.careTeamNote !== undefined && req.careTeamNote !== (s.card.careTeamNote ?? "")
    const entry: AuditEntry = { sessionId, riseId: s.riseId, action: "approved", from, to: from, user: req.user, at: now }
    return {
      ...s,
      card: { ...s.card, approval: edited ? "edited" : "approved", careTeamNote: req.careTeamNote ?? s.card.careTeamNote },
      audit: [...s.audit, entry].slice(-MAX_AUDIT),
      updatedAt: now,
    }
  }

  const reason = protocol.downgrade_reasons.find((r) => r.code === req.reasonCode)
  if (!reason) throw new SessionError("unknown reason code", 400)
  if ("requires_free_text" in reason && reason.requires_free_text && !req.freeText?.trim()) {
    throw new SessionError("this reason needs a note", 400)
  }
  if (req.to === "human_confirm" || SEVERITY[req.to] >= SEVERITY[from]) {
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
  return { ...s, card: { ...s.card, approval: "downgraded" }, audit: [...s.audit, entry].slice(-MAX_AUDIT), updatedAt: now }
}

const FOLLOW = protocol.followup

/** Easier / same / harder than the patient's last check-in. A game set is not a CDC count, so it never moves the schedule. */
function trendOf(card: TriageCard): Trend {
  const prev = card.metrics.previousRawStands
  if (card.protocol === "play_set" || prev === null) return "same"
  const patient = getPatient(card.riseId)
  const prevArms = patient ? (lastCheckIn(patient)?.arms_used ?? false) : false
  if (card.metrics.rawStands < prev || (card.metrics.armsUsed && !prevArms)) return "harder"
  return card.metrics.rawStands > prev ? "better" : "same"
}

function schedule(card: TriageCard | undefined, rec: Recommendation, now: number, riseId = card?.riseId): NextCheckIn | undefined {
  const patient = riseId ? getPatient(riseId) : undefined
  if (!patient) return undefined
  // No card (couldn't complete): no measurement, so the trend can't move the schedule.
  const c = nextCheckIn(cadenceInputFor(patient, rec, card ? trendOf(card) : "same"))
  return { inDays: c.inDays, dueOn: dueOn(now, c.inDays), phase: c.phase, reason: c.reason, paused: false, source: "session" }
}

/** While a person owes the patient a call, no date is shown: the patient's home says the care team will be in touch. */
function waitingFor(reason: string, phase = ""): NextCheckIn {
  return { inDays: null, dueOn: null, phase, reason, paused: true, source: "session" }
}

const WAITING_CALL = "Waiting for the follow-up call"
const WAITING_CLEARANCE = "Paused until a clinician clears the patient"

function audit(s: SessionSnapshot, e: Omit<AuditEntry, "sessionId" | "riseId">): AuditEntry[] {
  return [...s.audit, { sessionId: s.sessionId, riseId: s.riseId, ...e }].slice(-MAX_AUDIT)
}

/**
 * After a person decides the card. A decision that needs a call (protocol.followup.opens_on) opens a follow-up and
 * holds the next check-in until the call is recorded. A changed decision supersedes the open task (audited, attempts
 * carried over); a decision that no longer needs a call cancels it (audited) and schedules from the cadence engine.
 */
function afterDecision(s: SessionSnapshot, now: number, user: string): SessionSnapshot {
  const final = finalRecommendation(s)
  if (!s.card || !final) return s
  const open = s.followUp?.status === "open" ? s.followUp : undefined
  if ((FOLLOW.opens_on as string[]).includes(final)) {
    if (open?.recommendation === final) return s
    let trail = s.audit
    if (open) trail = audit({ ...s, audit: trail }, { action: "followup_cancelled", from: open.recommendation, to: final, reasonCode: "superseded", user, at: now })
    const followUp: FollowUp = {
      status: "open",
      recommendation: final,
      route: s.card.route ?? null,
      openedAt: open?.openedAt ?? now,
      attempts: open?.attempts ?? 0,
      awaitingClearance: open?.awaitingClearance ?? false,
      lastAttemptAt: open?.lastAttemptAt ?? null,
      outcome: null,
      note: null,
      closedAt: null,
      closedBy: null,
    }
    trail = audit({ ...s, audit: trail }, { action: "followup_opened", to: final, user: "Rise", at: now })
    const held = followUp.awaitingClearance ? WAITING_CLEARANCE : WAITING_CALL
    return { ...s, followUp, nextCheckIn: waitingFor(held), audit: trail }
  }
  if (open) {
    return {
      ...s,
      followUp: { ...open, status: "done", outcome: "cancelled", closedAt: now, closedBy: user },
      nextCheckIn: schedule(s.card, final, now),
      audit: audit(s, { action: "followup_cancelled", from: open.recommendation, to: final, reasonCode: "no_longer_needed", user, at: now }),
    }
  }
  return { ...s, nextCheckIn: schedule(s.card, final, now) }
}

/**
 * Console: record how a follow-up went. Not reached counts an attempt. Sent for urgent care (or Other) keeps the task
 * open, awaiting a clinician's clearance, with check-ins paused. Clinician cleared, plan continues, or visit booked
 * close it and set the next check-in. A card reopened by new patient input must be decided again first.
 */
export function recordFollowUp(sessionId: string, req: FollowUpRequest, now = Date.now()): SessionSnapshot {
  const s = store.sessions.get(sessionId)
  if (!s) throw new SessionError("unknown session", 404)
  if (s.followUp?.status !== "open") throw new SessionError("no open follow-up", 409)
  // A couldn't-complete follow-up has no card; any other needs its card decided.
  if (s.followUp.kind !== "could_not_complete" && (!s.card || s.card.approval === "pending")) {
    throw new SessionError("the card was reopened; decide it first", 409)
  }
  const f = s.followUp
  const outcome = FOLLOW.outcomes.find((o) => o.code === req.outcome)
  if (!outcome) throw new SessionError("unknown outcome", 400)
  const flag = (k: string) => k in outcome && (outcome as Record<string, unknown>)[k] === true
  const note = req.note?.trim() || null
  if (flag("requires_free_text") && !note) throw new SessionError("this outcome needs a note", 400)
  if (flag("only_when_awaiting_clearance") && !f.awaitingClearance) throw new SessionError("only after the patient was sent for care or paused", 400)
  if (f.awaitingClearance && outcome.closes && !flag("only_when_awaiting_clearance")) {
    throw new SessionError("waiting for a clinician to clear the patient", 400)
  }

  if (!outcome.closes) {
    const awaiting = f.awaitingClearance || flag("awaits_clearance")
    const isAttempt = outcome.code === "not_reached"
    return put({
      ...s,
      followUp: {
        ...f,
        attempts: isAttempt ? f.attempts + 1 : f.attempts,
        lastAttemptAt: isAttempt ? now : f.lastAttemptAt,
        awaitingClearance: awaiting,
        note: note ?? f.note,
      },
      nextCheckIn: waitingFor(awaiting ? WAITING_CLEARANCE : WAITING_CALL, s.nextCheckIn?.phase),
      audit: audit(s, { action: "followup_attempt", reasonCode: outcome.code, freeText: note ?? undefined, user: req.user, at: now }),
      updatedAt: now,
    })
  }

  const next = schedule(s.card, f.recommendation, now, s.riseId)
  // Only a recorded clearance may say the clinician cleared the patient.
  const cleared = outcome.code === "clinician_cleared"
  const nextCheckIn = next && !cleared && (f.recommendation === "escalate_urgent" || f.recommendation === "human_confirm")
    ? { ...next, reason: `Recheck after the follow-up: ${outcome.label}` }
    : next
  return put({
    ...s,
    followUp: { ...f, status: "done", awaitingClearance: false, outcome: outcome.code, note: note ?? f.note, closedAt: now, closedBy: req.user },
    nextCheckIn,
    audit: audit(s, { action: "followup_closed", reasonCode: outcome.code, freeText: note ?? undefined, user: req.user, at: now }),
    updatedAt: now,
  })
}

/** The patient's next check-in: the standing schedule (lib/schedule.ts), else the seed's. */
export function patientNextCheckIn(riseId: string, now = Date.now()): NextCheckIn | null {
  const patient = getPatient(riseId)
  if (!patient) return null
  const standing = standingNextCheckIn(listSessions(), riseId)
  if (standing) return standing
  const c = patient.cadence
  return { inDays: c.next_checkin_in_days, dueOn: dueOn(now, c.next_checkin_in_days), phase: c.phase, reason: c.reason, paused: false, source: "seed" }
}

/**
 * The recommendation that stands now. A pending card (new, or reopened by new patient input) stands on the rules;
 * a decided card stands on the latest human decision since it was last opened.
 */
export function finalRecommendation(s: Pick<SessionSnapshot, "card" | "audit">): Recommendation | null {
  if (!s.card) return null
  if (s.card.approval === "downgraded") {
    const down = [...s.audit].reverse().find((a) => a.action === "downgraded")
    if (down?.to) return down.to
  }
  return s.card.recommendation
}

/** Console: return a paused patient to their crew. A person decides; audited. */
export function resumeCrew(sessionId: string, req: CrewResumeRequest, now = Date.now()): SessionSnapshot {
  const s = store.sessions.get(sessionId)
  if (!s) throw new SessionError("unknown session", 404)
  if (!crewPause(s)) throw new SessionError("not paused from the crew", 409)
  if (s.card?.approval === "pending") throw new SessionError("decide the card first", 409)
  const reason = protocol.crew.resume_reasons.find((r) => r.code === req.reasonCode)
  if (!reason) throw new SessionError("unknown reason code", 400)
  if ("requires_free_text" in reason && reason.requires_free_text && !req.freeText?.trim()) {
    throw new SessionError("this reason needs a note", 400)
  }
  const entry: AuditEntry = {
    sessionId,
    riseId: s.riseId,
    action: "crew_resumed",
    reasonCode: req.reasonCode,
    freeText: req.freeText?.trim() || undefined,
    user: req.user,
    at: now,
  }
  return put({ ...s, audit: [...s.audit, entry].slice(-MAX_AUDIT), updatedAt: now })
}

/** Console: whether this session currently keeps the patient off their crew. */
export function crewPaused(sessionId: string): boolean {
  const s = store.sessions.get(sessionId)
  return s ? crewPause(s) : false
}

export function resetSessions() {
  store.sessions.clear()
  resetCrew()
  emit({ type: "reset" })
  markDirty()
}

/** Durable storage (lib/persist.ts): every session, as stored. */
export function exportSessions(): SessionSnapshot[] {
  return [...store.sessions.values()]
}

/** Durable storage: load saved sessions on start. Replaces the store; listeners are told with a fresh snapshot. */
export function importSessions(sessions: SessionSnapshot[]) {
  if (!Array.isArray(sessions)) throw new Error("bad sessions snapshot")
  store.sessions.clear()
  for (const s of sessions) store.sessions.set(s.sessionId, s)
  emit({ type: "snapshot", sessions: listSessions() })
}
