/**
 * CDC STEADI 30-Second Chair Stand: below-average scores (fall-risk indicator).
 * Source: https://www.cdc.gov/steadi/media/pdfs/STEADI-Assessment-30Sec-508.pdf
 * A score BELOW the listed value is below average.
 */
export const BELOW_AVERAGE_IF_UNDER: Record<"M" | "F", Record<string, number>> = {
  M: { "60-64": 14, "65-69": 12, "70-74": 12, "75-79": 11, "80-84": 10, "85-89": 8, "90-94": 7 },
  F: { "60-64": 12, "65-69": 11, "70-74": 10, "75-79": 10, "80-84": 9, "85-89": 8, "90-94": 4 },
}

export function ageBand(age: number): string {
  const lo = Math.floor(age / 5) * 5
  return `${lo}-${lo + 4}`
}

/** Returns the cutoff, or null if the age is outside the CDC table (under 60 or over 94). */
export function belowAverageCutoff(age: number, sex: "M" | "F"): number | null {
  return BELOW_AVERAGE_IF_UNDER[sex][ageBand(age)] ?? null
}

/** CDC rule: if the patient must use their arms to stand, stop the test and record 0. */
export function steadiScore(rawStands: number, armsUsed: boolean): number {
  return armsUsed ? 0 : rawStands
}

/** Care-team only. Never render on the patient surface. */
export function isBelowAverage(score: number, age: number, sex: "M" | "F"): boolean | null {
  const cutoff = belowAverageCutoff(age, sex)
  return cutoff === null ? null : score < cutoff
}
