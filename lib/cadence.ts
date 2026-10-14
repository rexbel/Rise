/**
 * Next-check-in engine (plan §6a). Rise defaults live in config/protocol.default.json -> cadence; a clinician-set
 * cadence on the episode replaces the phase default. Same logic as the seed's reference (seed/build_seed.py
 * next_checkin), so the seed's `cadence` doubles as the test oracle.
 */
import protocol from "@/config/protocol.default.json"
import type { Recommendation, SeedPatient, Trend } from "@/lib/types"

const C = protocol.cadence

export interface CadenceInput {
  /** Days since the episode started (post-op day minus the episode's start day). */
  dayInEpisode: number
  /** Clinician-set cadence for this episode, or null for the Rise default. */
  clinicianCadenceDays: number | null
  recommendation: Recommendation
  trend: Trend
  /** Check-ins in a row, including today, that were the same or easier than the one before. */
  stableStreak: number
}

export interface Cadence {
  inDays: number
  phase: string
  reason: string
}

/** The episode's base interval: clinician cadence, else every 2 days to day 14, then every 3. */
function phaseInterval(dayInEpisode: number, clinicianCadenceDays: number | null): { base: number; phase: string } {
  if (clinicianCadenceDays) return { base: clinicianCadenceDays, phase: `Clinician cadence, episode day ${dayInEpisode}` }
  if (dayInEpisode <= 14) return { base: C.days_0_14_every, phase: `Episode days 0-14, day ${dayInEpisode}` }
  return { base: C.days_15_30_every, phase: `Episode days 15-30, day ${dayInEpisode}` }
}

export function nextCheckIn(input: CadenceInput): Cadence {
  const { base, phase } = phaseInterval(input.dayInEpisode, input.clinicianCadenceDays)
  // human_confirm is held to the stricter path until a person decides it, like an escalation.
  if (input.recommendation === "escalate_urgent" || input.recommendation === "human_confirm") {
    return { inDays: 1, phase, reason: "Recheck the day after the clinician clears the patient" }
  }
  if (input.recommendation === "nurse_callback") {
    return { inDays: Math.min(base, C.after_callback_within_days), phase, reason: "Recheck within 2 days of the nurse callback" }
  }
  if (input.trend === "harder") {
    return { inDays: Math.max(C.min_interval_days, Math.floor(base / C.harder_divides_interval_by)), phase, reason: "Harder than last time: interval halved" }
  }
  if (input.stableStreak >= C.extend_after_stable_count && input.dayInEpisode > 14 && !input.clinicianCadenceDays) {
    return { inDays: base + C.extend_step_days, phase, reason: "Stable or improving twice: interval extended one step" }
  }
  return { inDays: base, phase, reason: input.clinicianCadenceDays ? "Clinician-set cadence" : "Episode default" }
}

/** Same-or-easier steps in the patient's history, plus today when today wasn't harder (seed's history_trends). */
export function stableStreak(rawStands: number[], trend: Trend): number {
  let n = 0
  for (let i = 1; i < rawStands.length; i++) if (rawStands[i] >= rawStands[i - 1]) n++
  return n + (trend !== "harder" ? 1 : 0)
}

/** Cadence input for a seed patient on their scripted day, with today's recommendation and trend. */
export function cadenceInputFor(patient: SeedPatient, recommendation: Recommendation, trend: Trend): CadenceInput {
  const ep = patient.monitoring_episode
  return {
    dayInEpisode: patient.episode.post_op_day_today - ep.start_pod,
    clinicianCadenceDays: ep.cadence_days,
    recommendation,
    trend,
    stableStreak: stableStreak(patient.checkins.map((c) => c.raw_stands), trend),
  }
}

/** Local midnight `inDays` after `now`. */
export function dueOn(now: number, inDays: number): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + inDays)
  return d.getTime()
}
