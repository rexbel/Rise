/**
 * Player home and "Your week" model: the patient compared only with their own history.
 *
 * Safe to show: avatar, first name, plain day/track labels, check-ins done, how last time felt (trend words),
 * next-session cadence, today's missions.
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
import type { SeedPatient, Trend } from "@/lib/types"

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

/** Prescribed dose in plain words, e.g. "1 × 6" or "Hold 20s". */
export function missionDose(w: ProgramExercise): string {
  return w.endRule === "hold"
    ? ui.program.hold.replace("{sec}", String(w.holdSec ?? 20))
    : ui.program.sets_reps.replace("{sets}", String(w.sets)).replace("{reps}", String(w.reps))
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
