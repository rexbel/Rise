/**
 * Pure helpers for follow-ups and the next check-in on the console: the Today worklist order, outcome choices
 * from config (Rise defaults, not clinical standards), form checks, and next-check-in wording.
 * No React and no server imports, so they run in the browser bundle and in vitest.
 */
import protocol from "@/config/protocol.default.json"
import type { NextCheckIn, Recommendation, SessionSnapshot } from "@/lib/types"
import { apiErrorMessage } from "./format"

export type FollowUpOutcome = {
  code: string
  label: string
  closes: boolean
  requiresFreeText: boolean
  pausesSchedule: boolean
}

/** protocol.followup.outcomes, normalized (optional flags default to false). */
export const FOLLOWUP_OUTCOMES: FollowUpOutcome[] = protocol.followup.outcomes.map((o) => ({
  code: o.code,
  label: o.label,
  closes: o.closes,
  requiresFreeText: "requires_free_text" in o && o.requires_free_text === true,
  pausesSchedule: "pauses_schedule" in o && o.pauses_schedule === true,
}))

export function outcomeByCode(code: string | null | undefined): FollowUpOutcome | undefined {
  return code ? FOLLOWUP_OUTCOMES.find((o) => o.code === code) : undefined
}

/** Config label for an outcome code; an unknown code shows as itself rather than disappearing. */
export function outcomeLabel(code: string): string {
  return outcomeByCode(code)?.label ?? code.replace(/_/g, " ")
}

/** Worklist urgency: lower comes first. */
const URGENCY: Record<Recommendation, number> = { escalate_urgent: 0, human_confirm: 1, nurse_callback: 2, continue_plan: 3 }

/** Sessions with an open follow-up: escalate_urgent, then human_confirm, then nurse_callback; oldest first within each. */
export function todayWorklist(sessions: SessionSnapshot[]): (SessionSnapshot & { followUp: NonNullable<SessionSnapshot["followUp"]> })[] {
  return sessions
    .filter((s): s is SessionSnapshot & { followUp: NonNullable<SessionSnapshot["followUp"]> } => s.followUp?.status === "open")
    .sort(
      (a, b) =>
        URGENCY[a.followUp.recommendation] - URGENCY[b.followUp.recommendation] ||
        a.followUp.openedAt - b.followUp.openedAt ||
        a.sessionId.localeCompare(b.sessionId),
    )
}

const TIMES = ["", "once", "twice"]

/** "Not reached once", "Not reached twice", "Not reached 3 times"; null when there were no attempts. */
export function attemptsLabel(attempts: number): string | null {
  if (attempts <= 0) return null
  return `Not reached ${TIMES[attempts] ?? `${attempts} times`}`
}

export type FollowUpErrors = { outcome?: string; note?: string }

/** Inline form checks before POST. The server checks again (400). */
export function followUpErrors(outcome: string, note: string): FollowUpErrors {
  const errors: FollowUpErrors = {}
  const def = outcomeByCode(outcome)
  if (!def) errors.outcome = "Choose how the call ended."
  else if (def.requiresFreeText && !note.trim()) errors.note = `Add a short note for “${def.label}”.`
  return errors
}

/** Error text for POST /followup. A 409 here means the task is no longer open, not that the card is unfinished. */
export function followUpErrorMessage(status: number, body: unknown): string {
  if (status === 409) return "This follow-up is no longer open. Someone may have recorded it already; the latest state is shown."
  return apiErrorMessage(status, body)
}

const DAY_MS = 86_400_000

function startOfDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Whole days from today to the due day. Uses dueOn when present (stays right as days pass), else inDays. */
export function daysUntilDue(nc: Pick<NextCheckIn, "inDays" | "dueOn">, now: number): number | null {
  if (nc.dueOn !== null && now > 0) return Math.round((startOfDay(nc.dueOn) - startOfDay(now)) / DAY_MS)
  return nc.inDays
}

/** "Fri, Oct 16". */
export function weekdayDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
}

export const PAUSED_LABEL = "Paused until a clinician clears the patient"

export type NextCheckInView = {
  /** "Today", "Tomorrow", "In 3 days", "Mon, Oct 26", "Overdue since Tue, Oct 13", or the paused line. */
  when: string
  /** Weekday date beside "In N days" / "Tomorrow", when the due day is known. */
  on: string | null
  paused: boolean
  overdue: boolean
}

export function nextCheckInView(nc: NextCheckIn, now: number): NextCheckInView {
  if (nc.paused) return { when: PAUSED_LABEL, on: null, paused: true, overdue: false }
  const days = daysUntilDue(nc, now)
  const date = nc.dueOn !== null ? weekdayDate(nc.dueOn) : null
  if (days === null) return { when: "Not scheduled", on: null, paused: false, overdue: false }
  if (days < 0) return { when: date ? `Overdue since ${date}` : "Overdue", on: null, paused: false, overdue: true }
  if (days === 0) return { when: "Today", on: null, paused: false, overdue: false }
  if (days === 1) return { when: "Tomorrow", on: date, paused: false, overdue: false }
  if (days < 7 || !date) return { when: `In ${days} days`, on: date, paused: false, overdue: false }
  return { when: date, on: null, paused: false, overdue: false }
}

/** Seed cadence (the patient's scripted schedule) as a NextCheckIn, for patients with no session yet. */
export function seedNextCheckIn(c: { inDays: number; phase: string; reason: string }): NextCheckIn {
  return { inDays: c.inDays, dueOn: null, phase: c.phase, reason: c.reason, paused: false, source: "seed" }
}
