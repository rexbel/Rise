/**
 * Pure helpers for the clinic console: labels, link building, decision semantics, reconnect backoff.
 * No React and no server imports, so they run in the browser bundle and in vitest.
 */
import type {
  ApprovalState,
  AuditEntry,
  PoseTier,
  Recommendation,
  Route,
  SessionSnapshot,
  SessionStatus,
  Surface,
} from "@/lib/types"

/** What the console needs about a seed patient. Built on the server from seed/patients.json. */
export type PatientSummary = {
  riseId: string
  name: string
  age: number
  sex: "F" | "M"
  procedure: string
  postOpDay: number
  episodeType: "post_discharge" | "reactivated"
  episodeDay: number
  episodeLength: number
  lastCheckIn: { label: string; postOpDay: number }
  /** The seed's scheduled next check-in (seed/patients.json cadence), used until a session sets one. */
  cadence: { inDays: number; phase: string; reason: string }
}

export type Tone = "escalate" | "confirm" | "callback" | "ok" | "neutral"

export const RECOMMENDATION_LABEL: Record<Recommendation, string> = {
  escalate_urgent: "Escalate urgent",
  nurse_callback: "Nurse callback",
  human_confirm: "Confirm with a person",
  continue_plan: "Continue plan",
}

export const RECOMMENDATION_TONE: Record<Recommendation, Tone> = {
  escalate_urgent: "escalate",
  nurse_callback: "callback",
  human_confirm: "confirm",
  continue_plan: "ok",
}

export const ROUTE_LABEL: Record<Route, string> = {
  surgeon_on_call: "surgeon on call",
  primary_care: "primary care",
  care_coordinator: "care coordinator",
  physical_therapy: "physical therapy",
}

export const STATUS_LABEL: Record<SessionStatus, string> = {
  invited: "Invited",
  setting_up: "Setting up",
  testing: "Testing",
  paused: "Paused",
  questions: "Questions",
  scoring: "Scoring",
  ready: "Ready",
  needs_confirmation: "Needs confirmation",
  could_not_complete: "Couldn't complete",
}

export const SURFACE_LABEL: Record<Surface, string> = {
  play: "RehabNinja game",
  classic: "Classic CDC check-in",
}

export const TIER_LABEL: Record<PoseTier, string> = {
  "yolo-onnx": "YOLO on device",
  mediapipe: "MediaPipe on device",
  "remote-yolo": "Remote YOLO",
  seeded: "Seeded replay",
}

export const APPROVAL_LABEL: Record<ApprovalState, string> = {
  pending: "Awaiting a decision",
  approved: "Approved",
  edited: "Approved, note edited",
  downgraded: "Downgraded",
}

export const RULE_LABEL: Record<string, string> = {
  red_flag: "Red flag symptom",
  stopped_early: "Stopped early",
  clot_signal: "Clot signal",
  non_surgical: "Non-surgical decline",
  decline: "Decline vs last check-in",
  orthostatic: "Orthostatic signs",
  balance: "Balance",
  on_track: "On track",
}

export function ruleLabel(rule: string): string {
  return RULE_LABEL[rule] ?? rule.replace(/_/g, " ")
}

/** "Escalate urgent → surgeon on call", or just the recommendation when there is no route. */
export function recommendationWithRoute(rec: Recommendation, route: Route | null): string {
  return route ? `${RECOMMENDATION_LABEL[rec]} → ${ROUTE_LABEL[route]}` : RECOMMENDATION_LABEL[rec]
}

/** Status line for a tile; testing carries the live count in words. */
export function statusText(s: Pick<SessionSnapshot, "status" | "count" | "surface">): string {
  if (s.status === "testing") {
    const unit = s.surface === "play" ? (s.count === 1 ? "rep" : "reps") : s.count === 1 ? "stand" : "stands"
    return `Testing · ${s.count} ${unit}`
  }
  return STATUS_LABEL[s.status]
}

/** Full patient link: public origin + API path, with &demo=1 when the coordinator asks for the demo recording. */
/** The full link to share: origin + the server's path (which carries the invite token; demo is in the invite). */
export function buildPatientLink(origin: string, path: string): string {
  return origin.replace(/\/+$/, "") + (path.startsWith("/") ? path : `/${path}`)
}

/**
 * Mirrors lib/sessions.ts finalRecommendation: a pending card stands on the rules; a downgraded card stands on
 * its latest downgrade. An older downgrade never carries over to a card that new patient input reopened.
 */
export function finalRecommendation(s: Pick<SessionSnapshot, "card" | "audit">): Recommendation | null {
  if (!s.card) return null
  if (s.card.approval === "downgraded") {
    const down = [...s.audit].reverse().find((a) => a.action === "downgraded")
    if (down?.to) return down.to
  }
  return s.card.recommendation
}

/** Severity used by the server to validate a downgrade (lib/sessions.ts). */
const SEVERITY: Record<Recommendation, number> = { escalate_urgent: 3, human_confirm: 2, nurse_callback: 2, continue_plan: 1 }

/** Recommendations a coordinator may downgrade to: strictly lower severity, never "confirm with a person". */
export function downgradeOptions(from: Recommendation): Recommendation[] {
  return (Object.keys(SEVERITY) as Recommendation[]).filter(
    (r) => r !== from && r !== "human_confirm" && SEVERITY[r] < SEVERITY[from],
  )
}

/** Tone for a tile: the decided recommendation when a card exists, otherwise the live status. */
export function sessionTone(s: Pick<SessionSnapshot, "card" | "audit" | "status">): Tone {
  const rec = finalRecommendation(s)
  if (rec) return RECOMMENDATION_TONE[rec]
  if (s.status === "needs_confirmation" || s.status === "paused") return "confirm"
  return "neutral"
}

/** Latest session per patient (by invitedAt, then updatedAt). */
export function latestByPatient(sessions: SessionSnapshot[]): Map<string, SessionSnapshot> {
  const out = new Map<string, SessionSnapshot>()
  for (const s of sessions) {
    const prev = out.get(s.riseId)
    if (!prev || sortKey(s) > sortKey(prev)) out.set(s.riseId, s)
  }
  return out
}

function sortKey(s: SessionSnapshot): number {
  return s.invitedAt ?? s.updatedAt
}

/** Board order: newest invite first, stable while counts tick (updatedAt changes on every rep). */
export function boardOrder(sessions: SessionSnapshot[]): SessionSnapshot[] {
  return [...sessions].sort((a, b) => sortKey(b) - sortKey(a) || a.sessionId.localeCompare(b.sessionId))
}

/** Reconnect delay for the live stream: 1 s, 2 s, 4 s ... capped at 30 s. */
export function backoffMs(attempt: number): number {
  return Math.min(30_000, 1000 * 2 ** Math.max(0, attempt))
}

export function auditActionLabel(a: AuditEntry): string {
  switch (a.action) {
    case "invited":
      return "Check-in sent"
    case "approved":
      return "Approved"
    case "downgraded":
      return "Downgraded"
    case "reopened":
      return "Reopened by new patient input"
    case "restarted":
      return "Demo set replayed"
    case "red_flag_retracted":
      return "Red flag tapped, then retracted by the patient"
    case "crew_resumed":
      return "Returned to their crew"
    case "answers_changed":
      return "Patient answers changed"
    case "reset":
      return "Reset"
    case "followup_opened":
      return "Follow-up opened"
    case "followup_attempt":
      return "Follow-up updated"
    case "followup_cancelled":
      return "Follow-up cancelled"
    case "could_not_complete":
      return "Patient couldn't complete the check-in"
    case "followup_closed":
      return "Follow-up closed"
  }
}

/** API error body -> a sentence that says what to do next. */
export function apiErrorMessage(status: number, body: unknown): string {
  const error = typeof body === "object" && body && "error" in body ? String((body as { error: unknown }).error) : ""
  if (status === 404) return "This session is no longer on the server, probably after Reset demo. Go back to the board and send a new check-in."
  if (status === 409 && error === "already decided") return "Someone already decided this card. The latest decision is shown below."
  if (status === 409 && error === "card changed") return "The patient's answers changed while you were reading. The card has been refreshed; review it and decide again."
  if (status === 409) return "The patient has not finished yet, so there is no card to decide. Wait for the tile to show Ready."
  if (status === 400 && error) return `The server rejected this request: ${error}. Check the form and try again.`
  if (status >= 500) return "The Rise server hit an error. Try again; if it keeps failing, restart the dev server."
  return error ? `Request failed: ${error}. Try again.` : "Request failed. Try again."
}

export const NETWORK_ERROR = "Could not reach the Rise server. Check that it is running and your connection is up, then try again."

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

/** Time if it was today, else weekday and date with the time ("Tue, Oct 13, 9:00 AM"): saved tasks can be days old. */
export function formatWhen(ms: number, now = Date.now()): string {
  const d = new Date(ms)
  if (d.toDateString() === new Date(now).toDateString()) return formatTime(ms)
  return d.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

export function formatAgo(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000))
  if (s < 10) return "just now"
  if (s < 60) return `${s} s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  return formatTime(ms)
}
