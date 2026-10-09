/**
 * DAY-OF: next-check-in engine (plan §6a). Defaults live in config/protocol.default.json;
 * clinic and patient overrides are merged on top and logged with a reason code.
 * Reference implementation of the same logic for the seed: seed/build_seed.py (next_checkin).
 */
import type { Recommendation, Trend } from "@/lib/types"

export interface CadenceInput {
  dayInEpisode: number
  clinicianCadenceDays: number | null
  recommendation: Recommendation
  trend: Trend
  stableStreak: number
}

export function nextCheckIn(_input: CadenceInput): { inDays: number; reason: string } {
  throw new Error("TODO(day-of): implement lib/cadence.ts")
}
