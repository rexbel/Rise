/**
 * Player home and "Your week" model: the patient compared only with their own history.
 *
 * Safe to show: avatar, first name, plain day/track labels, check-ins done, how last time felt (trend words),
 * next-session cadence, today's missions, and (from the crew board) your own days active and cheers received.
 * Never expose: STEADI, raw stands, ranks, peers, norms, "below average", ACL/graft jargon.
 */

import ui from "@/content/play-ui.json"
import { avatarSrc, familyLabel } from "@/lib/play/cohort"
import {
  procedureFamily,
  todaysProgram,
  type ProcedureFamily,
  type ProgramExercise,
} from "@/lib/play/programs"
import { PatientNextCheckIn, type CrewMember, type NextCheckIn, type SeedPatient, type Trend } from "@/lib/types"

export type PlayerHomeModel = {
  riseId: string
  firstName: string
  displayName: string
  avatarSrc: string
  /** Plain words, e.g. "Day 3". */
  dayLabel: string
  /** e.g. "Day 3 since surgery". */
  sinceSurgeryLabel: string
  /** e.g. "Knee track". */
  trackLabel: string
  /** Hero recovery line from locked JSON. */
  recoveryLabel: string
  checkInsDone: number
  trend: Trend
  /** How last time felt, in words only. */
  trendLabel: string
  nextSessionDays: number
  nextSessionLabel: string
  missions: ProgramExercise[]
  family: ProcedureFamily
}

const cache = new Map<string, PlayerHomeModel>()

export function nextSessionLabel(days: number): string {
  if (days <= 0) return ui.home.next_today
  if (days === 1) return ui.home.next_tomorrow
  return ui.home.next_in_days.replace("{days}", String(days))
}

/** Shown instead of a day while check-ins are paused (e.g. sent for urgent care). No date, no reason, no numbers. */
export const NEXT_PAUSED_LABEL = ui.home.next_paused

const DAY_MS = 86_400_000

function startOfDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * The patient's "Next check-in" words from the care team's schedule: "Today", "Tomorrow", "In N days", or the paused
 * line. Counts from dueOn (local midnight) so the label stays right as days pass; an overdue day reads as Today.
 */
export function patientNextCheckInLabel(nc: Pick<NextCheckIn, "paused" | "inDays" | "dueOn">, now: number): string {
  if (nc.paused) return NEXT_PAUSED_LABEL
  const days = nc.dueOn !== null ? Math.round((startOfDay(nc.dueOn) - startOfDay(now)) / DAY_MS) : (nc.inDays ?? 0)
  return nextSessionLabel(Math.max(0, days))
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/** GET /api/patients/[riseId]/next-checkin. Throws on timeout, a non-2xx, or an unexpected shape; callers keep the seed value. */
export async function fetchNextCheckIn(
  riseId: string,
  opts: { signal?: AbortSignal; fetchImpl?: FetchLike; timeoutMs?: number } = {},
): Promise<NextCheckIn> {
  const doFetch = opts.fetchImpl ?? ((input, init) => fetch(input, init))
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? 5000)
  const res = await doFetch(`/api/patients/${encodeURIComponent(riseId)}/next-checkin`, {
    cache: "no-store",
    credentials: "same-origin",
    signal: opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout,
  })
  if (!res.ok) throw new Error(`next-checkin ${res.status}`)
  const parsed = PatientNextCheckIn.safeParse(await res.json())
  if (!parsed.success || parsed.data.riseId !== riseId) throw new Error("next-checkin shape")
  return parsed.data.nextCheckIn
}

/** Prescribed dose in plain words, e.g. "1 × 6" or "Hold 20s". */
export function missionDose(w: ProgramExercise): string {
  return w.endRule === "hold"
    ? ui.program.hold.replace("{sec}", String(w.holdSec ?? 20))
    : ui.program.sets_reps.replace("{sets}", String(w.sets)).replace("{reps}", String(w.reps))
}

export type HomeChip = { key: "days" | "cheers"; label: string; value: string }

/**
 * "Days active" and "Cheers" chips from your own crew row. Only positives: a zero hides its chip, and no row
 * (crew still loading or unavailable) hides both, so Begin never waits on the crew.
 */
export function crewChips(you: Pick<CrewMember, "activeDays" | "cheersReceived"> | undefined): HomeChip[] {
  if (!you) return []
  const chips: HomeChip[] = []
  if (you.activeDays > 0) {
    chips.push({ key: "days", label: ui.crew.chip_days, value: ui.crew.chip_days_value.replace("{n}", String(you.activeDays)) })
  }
  if (you.cheersReceived > 0) chips.push({ key: "cheers", label: ui.crew.chip_cheers, value: String(you.cheersReceived) })
  return chips
}

export function recoveryLabel(family: ProcedureFamily): string {
  return ui.home.recovery[family]
}

/** Clear memo (tests). Seed is static in app, so production rarely needs this. */
export function clearPlayerHomeCache(): void {
  cache.clear()
}

export function playerHome(patient: SeedPatient): PlayerHomeModel {
  const cached = cache.get(patient.rise_id)
  if (cached) return cached

  const family = procedureFamily(patient)
  const firstName = patient.display_name.split(" ")[0] ?? patient.display_name
  const nextDays = patient.cadence.next_checkin_in_days
  const pod = patient.episode.post_op_day_today
  const trend = patient.patient_feedback.trend_vs_previous
  const model: PlayerHomeModel = {
    riseId: patient.rise_id,
    firstName,
    displayName: patient.display_name,
    avatarSrc: avatarSrc(patient.rise_id),
    dayLabel: `Day ${pod}`,
    sinceSurgeryLabel: ui.week.since_surgery.replace("{n}", String(pod)),
    trackLabel: familyLabel(family),
    recoveryLabel: recoveryLabel(family),
    checkInsDone: patient.checkins.length,
    trend,
    trendLabel: ui.home.trend[trend],
    nextSessionDays: nextDays,
    nextSessionLabel: nextSessionLabel(nextDays),
    missions: todaysProgram(patient),
    family,
  }
  cache.set(patient.rise_id, model)
  return model
}
