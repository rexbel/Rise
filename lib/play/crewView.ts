/**
 * Crew board view helpers for the patient surface: plain-word labels and the client calls to the crew API.
 *
 * Engagement only. Members keep the API order (days active, then name); nothing here derives a rank, place,
 * podium, streak, or a missed day. Every label comes from content/play-ui.json "crew".
 */

import ui from "@/content/play-ui.json"
import { CheerResponse, CREW_CONSENT_VERSION, CrewBoard, type CheerId, type CrewMember, type CrewStatus } from "@/lib/types"

const C = ui.crew

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ""))
}

/** "Active 3 days this week". Zero reads as a fresh start, never as a missed week. */
export function activeDaysLabel(days: number): string {
  if (days <= 0) return C.active_none
  if (days === 1) return C.active_day_one
  return fill(C.active_days, { n: days })
}

/** "5 cheers" / "One cheer"; empty when there are none (only positives are shown). */
export function cheersCountLabel(n: number): string {
  if (n <= 0) return ""
  if (n === 1) return C.cheers_count_one
  return fill(C.cheers_count, { n })
}

export type GoalView = {
  /** "20 of 30 crew check-ins this week". */
  label: string
  /** Clamped to max for the progress bar. */
  value: number
  max: number
  /** 0-100, for the bar width. */
  percent: number
  reached: boolean
}

export function goalView(goal: { done: number; target: number }): GoalView {
  const max = Math.max(1, goal.target)
  const value = Math.min(Math.max(0, goal.done), max)
  return {
    label: fill(C.goal_progress, { done: Math.max(0, goal.done), target: max }),
    value,
    max,
    percent: Math.round((value / max) * 100),
    reached: goal.done >= max,
  }
}

export function cheerPhrase(id: CheerId): string {
  return C.cheers[id]
}

/** Fixed phrases in a stable order. */
export const CHEER_IDS = Object.keys(C.cheers) as CheerId[]

/** "Margaret C. sent: Keep going!" */
export function cheerForYouLine(fromName: string, id: CheerId): string {
  return fill(C.for_you_line, { name: fromName, cheer: cheerPhrase(id) })
}

/** Relative time in words: "Just now", "40 minutes ago", "An hour ago", "Yesterday", "3 days ago". */
export function relativeTime(at: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - at) / 60_000)
  if (minutes < 1) return C.time.now
  if (minutes === 1) return C.time.minute
  if (minutes < 60) return fill(C.time.minutes, { n: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours === 1) return C.time.hour
  if (hours < 24) return fill(C.time.hours, { n: hours })
  const days = Math.floor(hours / 24)
  if (days === 1) return C.time.yesterday
  return fill(C.time.days, { n: days })
}

export function withName(template: string, name: string): string {
  // "Frank D." at the end of a sentence must not read "Frank D..".
  return fill(template, { name }).replace(/\.\.$/, ".")
}

/** The viewer's own row, for the home chips. */
export function yourRow(board: CrewBoard): CrewMember | undefined {
  return board.members.find((m) => m.isYou)
}

/** Which parts of the crew section render for each membership state. */
export type CrewPanels = {
  /** Opt-in card with what is and is never shared. */
  joinCard: boolean
  /** "readonly": a preview of who you would join (no Cheer buttons). "cheer": the live board. */
  members: "none" | "readonly" | "cheer"
  intro: boolean
  goal: boolean
  cheersForYou: boolean
  /** Show-my-photo and Leave. */
  settings: boolean
  /** The calm note shown instead of everything else while the care team checks in. */
  pauseNote: boolean
  /** Own crew chips on the player home. */
  homeChips: boolean
}

export function crewPanels(status: CrewStatus): CrewPanels {
  switch (status) {
    case "joined":
      return { joinCard: false, members: "cheer", intro: true, goal: true, cheersForYou: true, settings: true, pauseNote: false, homeChips: true }
    case "paused":
      return { joinCard: false, members: "none", intro: false, goal: false, cheersForYou: false, settings: false, pauseNote: true, homeChips: false }
    default:
      return { joinCard: true, members: "readonly", intro: false, goal: false, cheersForYou: false, settings: false, pauseNote: false, homeChips: false }
  }
}

/** Your own row for the home chips, only while you are on the crew (never when paused or not joined). */
export function homeChipsRow(board: CrewBoard | undefined): CrewMember | undefined {
  return board && crewPanels(board.status).homeChips ? yourRow(board) : undefined
}

/**
 * Local view right after leaving (or when this phone has no token): your row and your cheers drop out and the
 * join card returns. A quiet refetch then replaces it with the server's board.
 */
export function asNotJoined(board: CrewBoard): CrewBoard {
  return { ...board, status: "not_joined", showPhoto: false, members: board.members.filter((m) => !m.isYou), cheersForYou: [] }
}

/** Replace one member (after a cheer) without reordering the list. */
export function replaceMember(board: CrewBoard, next: CrewMember): CrewBoard {
  return { ...board, members: board.members.map((m) => (m.id === next.id ? next : m)) }
}

/* ---------- Client calls (fetch is injectable for tests) ---------- */

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export const CREW_TIMEOUT_MS = 8_000

class CrewLoadError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message)
  }
}

function timeoutSignal(ms: number, outer?: AbortSignal): AbortSignal {
  const timer = AbortSignal.timeout(ms)
  if (!outer) return timer
  if (typeof AbortSignal.any === "function") return AbortSignal.any([timer, outer])
  // Older Safari has no AbortSignal.any: forward whichever fires first so the timeout still applies.
  const both = new AbortController()
  const forward = (s: AbortSignal) => () => both.abort(s.reason)
  if (timer.aborted || outer.aborted) both.abort()
  timer.addEventListener("abort", forward(timer), { once: true })
  outer.addEventListener("abort", forward(outer), { once: true })
  return both.signal
}

/**
 * GET /api/crew/<riseId> with an 8 s timeout and one retry on network, timeout, 5xx, or a malformed body.
 * A 4xx is not retried. Throws when both attempts fail; callers show a recovery line and never block play.
 */
export async function fetchCrewBoard(
  riseId: string,
  opts: { signal?: AbortSignal; fetchImpl?: FetchLike; timeoutMs?: number } = {},
): Promise<CrewBoard> {
  const doFetch = opts.fetchImpl ?? ((input, init) => fetch(input, init))
  let last: unknown = null
  for (let attempt = 0; attempt < 2; attempt++) {
    if (opts.signal?.aborted) throw opts.signal.reason
    try {
      const res = await doFetch(`/api/crew/${encodeURIComponent(riseId)}`, {
        cache: "no-store",
        credentials: "same-origin",
        signal: timeoutSignal(opts.timeoutMs ?? CREW_TIMEOUT_MS, opts.signal),
      })
      if (!res.ok) throw new CrewLoadError(`crew ${res.status}`, res.status >= 500)
      const parsed = CrewBoard.safeParse(await res.json())
      if (!parsed.success) throw new CrewLoadError("crew shape", true)
      return parsed.data
    } catch (e) {
      if (opts.signal?.aborted) throw e
      last = e
      if (e instanceof CrewLoadError && !e.retryable) break
    }
  }
  throw last instanceof Error ? last : new Error("crew load failed")
}

export type CheerOutcome =
  | { kind: "ok"; recorded: boolean; member: CrewMember }
  | { kind: "limit" }
  /** 401: this phone has no crew token (show the join card). */
  | { kind: "signed_out" }
  /** 403: not on the crew or paused right now (refetch the board). */
  | { kind: "refresh" }
  | { kind: "failed" }

/** POST /api/crew/cheers. recorded:false (already cheered today) is a success, not an error. */
export async function postCheer(
  req: { from: string; to: string; cheerId: CheerId },
  opts: { fetchImpl?: FetchLike; timeoutMs?: number } = {},
): Promise<CheerOutcome> {
  const doFetch = opts.fetchImpl ?? ((input, init) => fetch(input, init))
  try {
    const res = await doFetch("/api/crew/cheers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
      credentials: "same-origin",
      signal: timeoutSignal(opts.timeoutMs ?? CREW_TIMEOUT_MS),
    })
    if (res.status === 429) return { kind: "limit" }
    if (res.status === 401) return { kind: "signed_out" }
    if (res.status === 403) return { kind: "refresh" }
    if (!res.ok) return { kind: "failed" }
    const parsed = CheerResponse.safeParse(await res.json())
    return parsed.success ? { kind: "ok", recorded: parsed.data.recorded, member: parsed.data.member } : { kind: "failed" }
  } catch {
    return { kind: "failed" }
  }
}

/* ---------- Membership calls (join, photo, leave) ---------- */

function postJson(doFetch: FetchLike, url: string, body: unknown, timeoutMs: number): Promise<Response> {
  return doFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    // The device token is an httpOnly same-origin cookie: join sets it and every other write needs it.
    credentials: "same-origin",
    signal: timeoutSignal(timeoutMs),
  })
}

async function boardFrom(res: Response): Promise<CrewBoard | null> {
  const parsed = CrewBoard.safeParse(await res.json())
  return parsed.success ? parsed.data : null
}

export type JoinOutcome =
  | { kind: "ok"; board: CrewBoard }
  /** 409: the join card text changed since this page loaded. */
  | { kind: "changed" }
  /** 403: paused while the care team checks in. */
  | { kind: "refresh" }
  | { kind: "failed" }

/** POST /api/crew/join with the consent version of the card the patient read. Not retried: it is a consent act. */
export async function joinCrewCall(
  req: { riseId: string; showPhoto: boolean },
  opts: { fetchImpl?: FetchLike; timeoutMs?: number; consentVersion?: string } = {},
): Promise<JoinOutcome> {
  const doFetch = opts.fetchImpl ?? ((input, init) => fetch(input, init))
  try {
    const res = await postJson(
      doFetch,
      "/api/crew/join",
      { riseId: req.riseId, showPhoto: req.showPhoto, consentVersion: opts.consentVersion ?? CREW_CONSENT_VERSION },
      opts.timeoutMs ?? CREW_TIMEOUT_MS,
    )
    if (res.status === 409) return { kind: "changed" }
    if (res.status === 403) return { kind: "refresh" }
    if (!res.ok) return { kind: "failed" }
    const board = await boardFrom(res)
    return board ? { kind: "ok", board } : { kind: "failed" }
  } catch {
    return { kind: "failed" }
  }
}

export type PhotoOutcome = { kind: "ok"; board: CrewBoard } | { kind: "signed_out" } | { kind: "refresh" } | { kind: "failed" }

/** POST /api/crew/photo. */
export async function setCrewPhotoCall(
  req: { riseId: string; showPhoto: boolean },
  opts: { fetchImpl?: FetchLike; timeoutMs?: number } = {},
): Promise<PhotoOutcome> {
  const doFetch = opts.fetchImpl ?? ((input, init) => fetch(input, init))
  try {
    const res = await postJson(doFetch, "/api/crew/photo", req, opts.timeoutMs ?? CREW_TIMEOUT_MS)
    if (res.status === 401) return { kind: "signed_out" }
    if (res.status === 403) return { kind: "refresh" }
    if (!res.ok) return { kind: "failed" }
    const board = await boardFrom(res)
    return board ? { kind: "ok", board } : { kind: "failed" }
  } catch {
    return { kind: "failed" }
  }
}

export type LeaveOutcome = { kind: "ok" } | { kind: "signed_out" } | { kind: "failed" }

/** POST /api/crew/leave -> 204. A 401 means this phone holds no token, so the patient is already out here. */
export async function leaveCrewCall(riseId: string, opts: { fetchImpl?: FetchLike; timeoutMs?: number } = {}): Promise<LeaveOutcome> {
  const doFetch = opts.fetchImpl ?? ((input, init) => fetch(input, init))
  try {
    const res = await postJson(doFetch, "/api/crew/leave", { riseId }, opts.timeoutMs ?? CREW_TIMEOUT_MS)
    if (res.status === 401) return { kind: "signed_out" }
    return res.ok ? { kind: "ok" } : { kind: "failed" }
  } catch {
    return { kind: "failed" }
  }
}
