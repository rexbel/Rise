import { describe, expect, it } from "vitest"
import raw from "../seed/patients.json"
import { SeedFile, type SeedPatient } from "../lib/types"
import { belowAverageCutoff, steadiScore } from "../lib/steadi"
import { closingLines } from "../lib/feedback"

const seed = SeedFile.parse(raw)

/** Oracle copy of the plan's rules, used to check the seed labels. lib/rules.ts must match this day-of. */
function oracle(p: SeedPatient) {
  const t = p.scripted_today, s = t.symptoms, last = p.checkins[p.checkins.length - 1]
  if (s.short_of_breath_or_chest_pain || s.calf_pain_or_swelling) return "escalate_urgent"
  if ((last.raw_stands - t.raw) / last.raw_stands >= 0.25 || (t.arms && !last.arms_used)) return "escalate_urgent"
  if (s.dizzy || (t.pauses_over_3s_after_standing ?? 0) >= 2 || (t.balance_tandem_hold_s ?? 99) < 10) return "nurse_callback"
  return "continue_plan"
}

describe("seed", () => {
  it("has seven synthetic patients", () => {
    expect(seed.patients).toHaveLength(7)
    expect(seed.patients.every((p) => p.synthetic)).toBe(true)
  })
  it("rules oracle reproduces every expected_triage label", () => {
    for (const p of seed.patients) expect(oracle(p), p.rise_id).toBe(p.expected_triage.recommendation)
  })
  it("STEADI score follows the CDC arm rule", () => {
    for (const p of seed.patients) expect(p.scripted_today.steadi_score).toBe(steadiScore(p.scripted_today.raw, p.scripted_today.arms))
  })
  it("CDC cutoffs match the table", () => {
    expect(belowAverageCutoff(65, "F")).toBe(11)
    expect(belowAverageCutoff(72, "M")).toBe(12)
    expect(belowAverageCutoff(55, "F")).toBeNull()
  })
  it("every episode stays within 30 days", () => {
    for (const p of seed.patients) expect(p.monitoring_episode.day_in_episode).toBeLessThanOrEqual(30)
  })
})

describe("patient closing lines", () => {
  it("never contains numbers", () => {
    for (const p of seed.patients) {
      const out = closingLines({ trend: p.patient_feedback.trend_vs_previous, recommendation: p.expected_triage.recommendation, redFlag: false, clinicName: "Riverside Ortho" })
      expect(out.join(" ")).not.toMatch(/\d/)
    }
  })
  it("red flag shows the emergency line alone", () => {
    expect(closingLines({ trend: "harder", recommendation: "escalate_urgent", redFlag: true, clinicName: "x" })).toHaveLength(1)
  })
})
