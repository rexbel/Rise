import { describe, expect, it } from "vitest"
import lines from "@/content/patient-lines.json"
import { closingLines } from "@/lib/feedback"

const clinicName = "Riverside Ortho"

describe("closingLines", () => {
  it("is trend + next step + closure", () => {
    expect(closingLines({ trend: "same", recommendation: "continue_plan", redFlag: false, clinicName })).toEqual([
      lines.trend.same,
      lines.next_step.continue_plan,
      lines.closure,
    ])
  })

  it("names the clinic on a nurse call", () => {
    const out = closingLines({ trend: "same", recommendation: "nurse_callback", redFlag: false, clinicName })
    expect(out[1]).toBe(lines.next_step.nurse_callback.replace("{clinic}", clinicName))
    expect(out[1]).not.toContain("{clinic}")
  })

  it("human_confirm and finished_early both say someone will reach out", () => {
    for (const recommendation of ["human_confirm", "finished_early"] as const) {
      const out = closingLines({ trend: "finished_early", recommendation, redFlag: false, clinicName })
      expect(out).toEqual([lines.trend.finished_early, lines.next_step.finished_early, lines.closure])
    }
  })

  it("a red flag returns the emergency line alone", () => {
    expect(closingLines({ trend: "harder", recommendation: "escalate_urgent", redFlag: true, clinicName })).toEqual([lines.emergency.line])
  })

  it("closing lines stay short and count-free", () => {
    for (const trend of ["better", "same", "harder", "first", "finished_early"] as const) {
      for (const recommendation of ["continue_plan", "nurse_callback", "escalate_urgent", "finished_early"] as const) {
        for (const line of closingLines({ trend, recommendation, redFlag: false, clinicName })) {
          expect(line).not.toMatch(/\d|score|STEADI|below average/i)
        }
      }
    }
  })
})
