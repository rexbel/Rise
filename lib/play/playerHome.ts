/**
 * Player home (pre-game) progress model.
 *
 * Safe to show: avatar, first name, plain day/track labels, check-in count,
 * board rank + board hits, trend key, next-session cadence, today's missions.
 * Never expose: STEADI, raw stands, norms, "below average", ACL/graft jargon.
 */

import ui from "@/content/play-ui.json"
import { avatarSrc, cohortBoard, familyLabel, ordinalPlace } from "@/lib/play/cohort"
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
  /** Board track, e.g. "Knee track". */
  trackLabel: string
  /** Hero recovery line from locked JSON. */
  recoveryLabel: string
  checkInsDone: number
  rank: number
  /** Ordinal place matching the board, e.g. "9TH PLACE". */
  rankPlace: string
  /** Seeded board hits for the demo board (not live weekly play). */
  weekHits: number
  trend: Trend
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

  const board = cohortBoard(patient.rise_id)
  const family = procedureFamily(patient)
  const firstName = patient.display_name.split(" ")[0] ?? patient.display_name
  const nextDays = patient.cadence.next_checkin_in_days
  const model: PlayerHomeModel = {
    riseId: patient.rise_id,
    firstName,
    displayName: patient.display_name,
    avatarSrc: avatarSrc(patient.rise_id),
    dayLabel: `Day ${patient.episode.post_op_day_today}`,
    trackLabel: familyLabel(family),
    recoveryLabel: recoveryLabel(family),
    checkInsDone: patient.checkins.length,
    rank: board.yourRank,
    rankPlace: ordinalPlace(board.yourRank),
    weekHits: board.yourScore,
    trend: patient.patient_feedback.trend_vs_previous,
    nextSessionDays: nextDays,
    nextSessionLabel: nextSessionLabel(nextDays),
    missions: todaysProgram(patient),
    family,
  }
  cache.set(patient.rise_id, model)
  return model
}
