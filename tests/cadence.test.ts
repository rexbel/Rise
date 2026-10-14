import { describe, expect, it } from "vitest"
import raw from "../seed/patients.json"
import { SeedFile } from "../lib/types"
import { cadenceInputFor, dueOn, nextCheckIn, stableStreak } from "../lib/cadence"

const seed = SeedFile.parse(raw)

describe("next check-in (plan §6a)", () => {
  it.each(seed.patients.map((p) => [p.rise_id, p] as const))("%s matches the seed's schedule", (_id, p) => {
    const c = nextCheckIn(cadenceInputFor(p, p.expected_triage.recommendation, p.patient_feedback.trend_vs_previous))
    expect(c).toEqual({ inDays: p.cadence.next_checkin_in_days, phase: p.cadence.phase, reason: p.cadence.reason })
  })

  it("halves the interval after a harder check-in, never below one day", () => {
    const base = { dayInEpisode: 20, clinicianCadenceDays: null, recommendation: "continue_plan" as const, stableStreak: 0 }
    expect(nextCheckIn({ ...base, trend: "harder" }).inDays).toBe(1)
    expect(nextCheckIn({ ...base, trend: "harder", clinicianCadenceDays: 7 }).inDays).toBe(3)
  })

  it("a clinician cadence is never extended by a stable streak", () => {
    const c = nextCheckIn({ dayInEpisode: 20, clinicianCadenceDays: 7, recommendation: "continue_plan", trend: "same", stableStreak: 5 })
    expect(c).toMatchObject({ inDays: 7, reason: "Clinician-set cadence" })
  })

  it("counts same-or-easier steps", () => {
    expect(stableStreak([4, 5, 5, 3], "same")).toBe(3)
    expect(stableStreak([9, 5], "harder")).toBe(0)
  })

  it("due date is local midnight", () => {
    const now = new Date(2026, 9, 14, 17, 30).getTime()
    expect(dueOn(now, 1)).toBe(new Date(2026, 9, 15).getTime())
  })
})
