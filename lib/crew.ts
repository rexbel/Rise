/**
 * RehabNinja crew board: social motivation without clinical comparison. Members are the patient's procedure track
 * (seed patients + synthetic peers). The only numbers are days active this week and cheers received; nothing here
 * reads reps, hits, stands, scores, symptoms, or triage. In-memory and synthetic, like lib/sessions.ts.
 */
import protocol from "@/config/protocol.default.json"
import peersFile from "@/content/play-board-peers.json"
import ui from "@/content/play-ui.json"
import { procedureFamily } from "@/lib/play/programs"
import { triage } from "@/lib/rules"
import { getPatient, patients } from "@/lib/seed"
import type { CheerId, CheerRequest, CheerResponse, CrewBoard, CrewMember, SeedPatient, SessionResult } from "@/lib/types"

type Family = "tka" | "tha" | "hip_fracture"
type Peer = (typeof peersFile.peers)[number]
/** client = the caller's network address, so a stranger cannot use up a patient's daily cheer quota. */
type LiveCheer = { from: string; to: string; cheerId: CheerId; at: number; client: string }

const C = protocol.crew
const PHOTO_IDS = new Set(["rise-01", "rise-02", "rise-03", "rise-04", "rise-05", "rise-06", "rise-07", ...peersFile.peers.filter((p) => p.photo).map((p) => p.id)])

type Store = { active: Map<string, Set<string>>; cheers: LiveCheer[] }
const g = globalThis as typeof globalThis & { __riseCrew?: Store }
const store: Store = (g.__riseCrew ??= { active: new Map(), cheers: [] })

export class CrewError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 429,
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
    avatarSrc: PHOTO_IDS.has(id) ? `/play/avatars/${id}.jpg` : null,
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

export function crewBoard(riseId: string, now = Date.now()): CrewBoard {
  const you = getPatient(riseId)
  if (!you) throw new CrewError("unknown patient", 404)
  const family = procedureFamily(you)
  const { seed, peers } = crewIds(family)
  const members = [...seed.map((p) => seedMember(p, riseId, now)), ...peers.map((p) => peerMember(p, riseId, now))].sort(
    (a, b) => b.activeDays - a.activeDays || a.name.localeCompare(b.name),
  )
  const seeded = seededCheersTo(riseId).map((c) => ({ fromName: nameOf(c.from), cheerId: c.cheer_id as CheerId, at: now - c.minutes_ago * 60_000 }))
  const live = liveCheersTo(riseId, now).map((c) => ({ fromName: nameOf(c.from), cheerId: c.cheerId, at: c.at }))
  return {
    riseId,
    weekStart: weekStart(now),
    members,
    goal: { done: members.reduce((n, m) => n + m.activeDays, 0), target: members.length * C.weekly_goal_days_per_member },
    cheersForYou: [...live, ...seeded].sort((a, b) => b.at - a.at).slice(0, 10),
    demoData: true,
  }
}

/**
 * One cheer per sender, recipient and day (a repeat is a no-op, not an error). Only a playable patient can send,
 * only to someone else on the same track, and at most max_cheers_per_sender_per_day a day.
 */
export function cheer(req: CheerRequest, now = Date.now(), client = "local"): CheerResponse {
  const from = getPatient(req.from)
  if (!from) throw new CrewError("unknown sender", 404)
  if (req.from === req.to) throw new CrewError("you can't cheer yourself", 400)
  const family = procedureFamily(from)
  const { seed, peers } = crewIds(family)
  const toSeed = seed.find((p) => p.rise_id === req.to)
  const toPeer = peers.find((p) => p.id === req.to)
  if (!toSeed && !toPeer) throw new CrewError("not on your crew", 404)

  const today = dayKey(now)
  const start = weekStart(now)
  store.cheers = store.cheers.filter((c) => c.at >= start)
  const already = store.cheers.some((c) => c.from === req.from && c.to === req.to && dayKey(c.at) === today)
  if (!already) {
    // The sender is not authenticated in this demo, so the daily cap is per sender and caller address.
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
}

/**
 * With the console key set, the board only takes invited sessions, but a patient who taps Continue on their own
 * still showed up. A finished non-emergency game set from a known patient counts for the crew without reaching
 * the console. Returns false (nothing recorded) for emergencies, so the phone never claims the care team was told.
 */
export function recordSelfStartedSet(result: SessionResult, now = Date.now()): boolean {
  const patient = getPatient(result.riseId)
  if (!patient || result.protocol !== "play_set") return false
  if (triage(result, patient.checkins.at(-1), patient.episode.post_op_day_today).emergency) return false
  markActive(result.riseId, now)
  return true
}
