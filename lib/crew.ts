/**
 * RehabNinja crew board: social motivation without clinical comparison. A crew is the patient's procedure track
 * under a neutral name (seed patients who opted in + synthetic peers). The only numbers are days active this week
 * and cheers received. Membership is opt-in with a consent log; writes need the patient's device token; a patient
 * the care team is checking on (red flag, escalation, human confirm) is paused: hidden, out of the goal, no cheers.
 * In-memory and synthetic, like lib/sessions.ts.
 */
import { randomBytes } from "node:crypto"
import protocol from "@/config/protocol.default.json"
import peersFile from "@/content/play-board-peers.json"
import ui from "@/content/play-ui.json"
import { procedureFamily } from "@/lib/play/programs"
import { triage } from "@/lib/rules"
import { getPatient, patients } from "@/lib/seed"
import {
  CREW_CONSENT_VERSION,
  type CheerId,
  type CheerRequest,
  type CheerResponse,
  type ConsentRecord,
  type CrewBoard,
  type CrewJoinRequest,
  type CrewMember,
  type SeedPatient,
  type SessionResult,
} from "@/lib/types"

type Family = "tka" | "tha" | "hip_fracture"
type Peer = (typeof peersFile.peers)[number]
/** client = the caller's network address, so a stranger cannot use up a patient's daily cheer quota. */
type LiveCheer = { from: string; to: string; cheerId: CheerId; at: number; client: string }

const C = protocol.crew
const PHOTO_IDS = new Set(["rise-01", "rise-02", "rise-03", "rise-04", "rise-05", "rise-06", "rise-07", ...peersFile.peers.filter((p) => p.photo).map((p) => p.id)])

type Membership = { joinedAt: number; showPhoto: boolean; source: ConsentRecord["source"] }
type Store = {
  active: Map<string, Set<string>>
  cheers: LiveCheer[]
  /** Seed patients who opted in. Synthetic peers are members by seed (consent source "synthetic_seed"). */
  members: Map<string, Membership>
  /** Device token -> riseId. Set as an httpOnly cookie on join; required for every write. */
  tokens: Map<string, string>
  /** riseId -> sessions whose cards keep them paused (any one is enough). */
  paused: Map<string, Set<string>>
  consent: ConsentRecord[]
}
const g = globalThis as typeof globalThis & { __riseCrew?: Store }
const store: Store = (g.__riseCrew ??= { active: new Map(), cheers: [], members: new Map(), tokens: new Map(), paused: new Map(), consent: [] })
// Hot reload keeps an older store shape alive; fill in fields added since.
store.members ??= new Map()
store.tokens ??= new Map()
store.paused ??= new Map()
store.consent ??= []

/** Cookie that carries a patient's device token. Path-scoped to the crew API. */
export const crewCookieName = (riseId: string) => `rise_crew_${riseId}`

export class CrewError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 401 | 403 | 404 | 409 | 429,
  ) {
    super(message)
  }
}

/** Local calendar day, e.g. 2026-10-13. */
export function dayKey(at: number): string {
  const d = new Date(at)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/** Monday 00:00 local time of the week containing `at`. */
export function weekStart(at: number): number {
  const d = new Date(at)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.getTime()
}

/** Days of this week so far, today included (Monday = 1). */
function daysElapsed(now: number): number {
  return Math.min(7, Math.floor((now - weekStart(now)) / 86_400_000) + 1)
}

/** Called by the session store when a session's first result arrives: that day counts as active. */
export function markActive(riseId: string, at = Date.now()) {
  if (!getPatient(riseId)) return
  const days = store.active.get(riseId) ?? new Set<string>()
  days.add(dayKey(at))
  store.active.set(riseId, days)
}

function liveDaysThisWeek(riseId: string, now: number): string[] {
  const start = weekStart(now)
  return [...(store.active.get(riseId) ?? [])].filter((k) => new Date(`${k}T12:00:00`).getTime() >= start)
}

/** Seed check-ins in the six post-op days before today stand in for earlier days this week. */
function seedDaysThisWeek(p: SeedPatient): number {
  const today = p.episode.post_op_day_today
  return p.checkins.filter((c) => c.post_op_day < today && today - c.post_op_day < 7).length
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

function shortName(full: string, isYou: boolean): string {
  const [first, ...rest] = full.split(/\s+/)
  const last = rest.at(-1)
  return isYou || !last ? first : `${first} ${last[0]}.`
}

function liveCheersTo(id: string, now: number) {
  const start = weekStart(now)
  return store.cheers.filter((c) => c.to === id && c.at >= start)
}

function seededCheersTo(id: string) {
  return peersFile.cheers_for.filter((c) => c.to === id)
}

function crewIds(family: Family): { seed: SeedPatient[]; peers: Peer[] } {
  return {
    seed: patients.filter((p) => procedureFamily(p) === family),
    peers: peersFile.peers.filter((p) => p.family === family),
  }
}

function member(
  id: string,
  fullName: string,
  base: { activeDays: number; activeToday: boolean; cheers: number },
  viewer: string,
  now: number,
): CrewMember {
  const isYou = id === viewer
  const today = dayKey(now)
  return {
    id,
    name: shortName(fullName, isYou),
    avatarSrc: PHOTO_IDS.has(id) && (store.members.get(id)?.showPhoto ?? true) ? `/play/avatars/${id}.jpg` : null,
    initials: initialsOf(fullName),
    isYou,
    // Never more days than have passed this week (seed check-ins stand in for earlier days and could overrun on a Monday).
    activeDays: Math.min(daysElapsed(now), base.activeDays),
    activeToday: base.activeToday,
    cheersReceived: base.cheers + liveCheersTo(id, now).length,
    cheeredByYouToday: store.cheers.some((c) => c.from === viewer && c.to === id && dayKey(c.at) === today),
  }
}

function seedMember(p: SeedPatient, viewer: string, now: number): CrewMember {
  const live = liveDaysThisWeek(p.rise_id, now)
  return member(
    p.rise_id,
    p.display_name,
    { activeDays: seedDaysThisWeek(p) + live.length, activeToday: live.includes(dayKey(now)), cheers: seededCheersTo(p.rise_id).length },
    viewer,
    now,
  )
}

function peerMember(p: Peer, viewer: string, now: number): CrewMember {
  return member(p.id, p.display_name, { activeDays: p.active_days, activeToday: p.active_today, cheers: p.cheers_received }, viewer, now)
}

function nameOf(id: string): string {
  const seed = getPatient(id)
  if (seed) return shortName(seed.display_name, false)
  const peer = peersFile.peers.find((p) => p.id === id)
  return peer ? shortName(peer.display_name, false) : ui.crew.someone
}

/** Who peers can see: opted-in seed patients who are not paused, plus synthetic peers. */
function visibleSeed(seed: SeedPatient[]): SeedPatient[] {
  return seed.filter((p) => store.members.has(p.rise_id) && !store.paused.has(p.rise_id))
}

/** Pause is shown only to the patient's own phone; to anyone else a paused patient looks like a non-member. */
function statusOf(riseId: string, authed: boolean): CrewBoard["status"] {
  const member = store.members.has(riseId)
  if (!member) return "not_joined"
  if (!authed) return "joined_elsewhere"
  return store.paused.has(riseId) ? "paused" : "joined"
}

/** Whether `id` (seed patient or synthetic peer) is visible to the crew right now. */
function visible(id: string): boolean {
  if (!getPatient(id)) return true // synthetic peers
  return store.members.has(id) && !store.paused.has(id)
}

/** The board as `riseId` sees it. `authed` = the request carried this patient's device token. */
export function crewBoard(riseId: string, now = Date.now(), authed = false): CrewBoard {
  const you = getPatient(riseId)
  if (!you) throw new CrewError("unknown patient", 404)
  const family = procedureFamily(you)
  const { seed, peers } = crewIds(family)
  const status = statusOf(riseId, authed)
  const members = [
    ...visibleSeed(seed)
      .filter((p) => p.rise_id !== riseId || status === "joined")
      .map((p) => seedMember(p, riseId, now)),
    ...peers.map((p) => peerMember(p, riseId, now)),
  ].sort((a, b) => b.activeDays - a.activeDays || a.name.localeCompare(b.name))
  const seeded = seededCheersTo(riseId).map((c) => ({ fromName: nameOf(c.from), cheerId: c.cheer_id as CheerId, at: now - c.minutes_ago * 60_000 }))
  // People who left or are paused drop out of everyone's feed too.
  const live = liveCheersTo(riseId, now)
    .filter((c) => visible(c.from))
    .map((c) => ({ fromName: nameOf(c.from), cheerId: c.cheerId, at: c.at }))
  return {
    riseId,
    crewName: C.neutral_names[family],
    status,
    showPhoto: store.members.get(riseId)?.showPhoto ?? false,
    weekStart: weekStart(now),
    // A paused patient sees no board: just the pause note (no goal pressure, nobody to cheer).
    members: status === "paused" ? [] : members,
    goal: { done: members.reduce((n, m) => n + m.activeDays, 0), target: members.length * C.weekly_goal_days_per_member },
    cheersForYou: status === "paused" ? [] : [...live, ...seeded].sort((a, b) => b.at - a.at).slice(0, 10),
    demoData: true,
  }
}

/**
 * One cheer per sender, recipient and day (a repeat is a no-op, not an error). Only a playable patient can send,
 * only to someone else on the same track, and at most max_cheers_per_sender_per_day a day.
 */
export function cheer(req: CheerRequest, now = Date.now(), client = "local", authed = false): CheerResponse {
  const from = getPatient(req.from)
  if (!from) throw new CrewError("unknown sender", 404)
  if (!authed) throw new CrewError("join your crew on this phone first", 401)
  if (!store.members.has(req.from)) throw new CrewError("join your crew first", 403)
  if (store.paused.has(req.from)) throw new CrewError("your crew is on hold", 403)
  if (req.from === req.to) throw new CrewError("you can't cheer yourself", 400)
  const family = procedureFamily(from)
  const { seed, peers } = crewIds(family)
  // Paused or not-joined patients can't receive cheers (nobody told to rest gets "Keep going!").
  const toSeed = visibleSeed(seed).find((p) => p.rise_id === req.to)
  const toPeer = peers.find((p) => p.id === req.to)
  if (!toSeed && !toPeer) throw new CrewError("not on your crew", 404)

  const today = dayKey(now)
  const start = weekStart(now)
  store.cheers = store.cheers.filter((c) => c.at >= start)
  const already = store.cheers.some((c) => c.from === req.from && c.to === req.to && dayKey(c.at) === today)
  if (!already) {
    // Defense in depth on top of the device token: the daily cap is per sender and caller address.
    const sentToday = store.cheers.filter((c) => c.from === req.from && c.client === client && dayKey(c.at) === today).length
    if (sentToday >= C.max_cheers_per_sender_per_day) throw new CrewError("that's a lot of cheering for one day; try again tomorrow", 429)
    store.cheers.push({ from: req.from, to: req.to, cheerId: req.cheerId, at: now, client })
  }
  const m = toSeed ? seedMember(toSeed, req.from, now) : peerMember(toPeer!, req.from, now)
  return { recorded: !already, member: m }
}

export function resetCrew() {
  store.active.clear()
  store.cheers = []
  store.members.clear()
  store.tokens.clear()
  store.paused.clear()
  store.consent = []
}

/* ---------- Membership, consent, device tokens ---------- */

function logConsent(riseId: string, action: ConsentRecord["action"], now: number, source: ConsentRecord["source"]) {
  store.consent.push({ riseId, action, consentVersion: CREW_CONSENT_VERSION, source, at: now })
}

/** True when `token` is this patient's device token. */
export function tokenMatches(riseId: string, token: string | undefined): boolean {
  return !!token && store.tokens.get(token) === riseId
}

/**
 * Opt in after the patient read the join card. `verified` = the request carried the patient's console invite
 * (required on the public tunnel); it is recorded as the consent source. Returns a fresh device token.
 */
export function joinCrew(req: CrewJoinRequest, now = Date.now(), verified = false): { token: string; board: CrewBoard } {
  if (!getPatient(req.riseId)) throw new CrewError("unknown patient", 404)
  if (req.consentVersion !== CREW_CONSENT_VERSION) throw new CrewError("the join text changed; please read it again", 409)
  if (store.paused.has(req.riseId)) throw new CrewError("your crew is on hold", 403)
  const source = verified ? "invited_link" : "unverified_phone"
  const token = randomBytes(24).toString("base64url")
  store.tokens.set(token, req.riseId)
  // Keep only the newest few tokens per patient (old phones fall back to "joined elsewhere").
  const mine = [...store.tokens].filter(([, id]) => id === req.riseId).map(([t]) => t)
  for (const t of mine.slice(0, Math.max(0, mine.length - C.max_tokens_per_patient))) store.tokens.delete(t)

  const prev = store.members.get(req.riseId)
  const showPhoto = req.showPhoto ?? prev?.showPhoto ?? false
  store.members.set(req.riseId, { joinedAt: prev?.joinedAt ?? now, showPhoto, source: prev?.source === "invited_link" ? "invited_link" : source })
  if (!prev) logConsent(req.riseId, "joined", now, source)
  // Record a photo choice only when it is new or changed (a re-join from another phone keeps it).
  if (!prev || prev.showPhoto !== showPhoto) logConsent(req.riseId, showPhoto ? "photo_shown" : "photo_hidden", now, source)
  return { token, board: crewBoard(req.riseId, now, true) }
}

/** Withdraw: leaves the crew everywhere, revokes every device token for this patient. */
export function leaveCrew(riseId: string, now = Date.now()) {
  const m = store.members.get(riseId)
  if (!m) return
  store.members.delete(riseId)
  for (const [t, id] of store.tokens) if (id === riseId) store.tokens.delete(t)
  logConsent(riseId, "left", now, m.source)
}

export function setPhoto(riseId: string, showPhoto: boolean, now = Date.now()): CrewBoard {
  const m = store.members.get(riseId)
  if (!m) throw new CrewError("join your crew first", 403)
  if (m.showPhoto !== showPhoto) {
    store.members.set(riseId, { ...m, showPhoto })
    logConsent(riseId, showPhoto ? "photo_shown" : "photo_hidden", now, m.source)
  }
  return crewBoard(riseId, now, true)
}

export function consentLog(riseId: string): ConsentRecord[] {
  return store.consent.filter((c) => c.riseId === riseId)
}

/* ---------- Pause (set by the session store; lifted by the care team) ---------- */

/** The session store calls this whenever a card changes. A pause belongs to the session that set it. */
export function syncPause(riseId: string, sessionId: string, shouldPause: boolean) {
  const holds = store.paused.get(riseId) ?? new Set<string>()
  if (shouldPause) holds.add(sessionId)
  else holds.delete(sessionId)
  if (holds.size) store.paused.set(riseId, holds)
  else store.paused.delete(riseId)
}

export function isPaused(riseId: string): boolean {
  return store.paused.has(riseId)
}

/**
 * With the console key set, the board only takes invited sessions, but a patient who taps Continue on their own
 * still showed up. A finished non-emergency game set from a known patient counts for the crew without reaching
 * the console. Returns false (nothing recorded) for emergencies, so the phone never claims the care team was told.
 */
export function recordSelfStartedSet(result: SessionResult, now = Date.now()): boolean {
  const patient = getPatient(result.riseId)
  if (!patient || result.protocol !== "play_set") return false
  // Only an on-track set counts: any escalation from an uninvited set must not show the patient as active.
  if (triage(result, patient.checkins.at(-1), patient.episode.post_op_day_today).recommendation !== "continue_plan") return false
  markActive(result.riseId, now)
  return true
}
