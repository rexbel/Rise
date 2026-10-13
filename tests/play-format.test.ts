import { describe, expect, it } from "vitest"
import { formatPlayClose, pickFinding } from "@/lib/play/formatPatient"
import { clinicRouteFromAnswers, isPatientEmergency } from "@/lib/play/symptomRoute"
import type { Finding } from "@/lib/play/types"
import corrections from "@/content/form-corrections.json"

const closing = {
  trend: "harder" as const,
  recommendation: "escalate_urgent" as const,
  redFlag: false,
  clinicName: "Riverside Ortho",
}

describe("pickFinding", () => {
  it("HARD beats soft", () => {
    const findings: Finding[] = [
      { id: "arms", severity: "soft", atMs: 1 },
      { id: "valgus", severity: "hard", atMs: 2 },
    ]
    expect(pickFinding(findings)?.id).toBe("valgus")
  })

  it("soft priority is valgus then arms then asymmetry then speed", () => {
    const findings: Finding[] = [
      { id: "speed", severity: "soft", atMs: 1 },
      { id: "arms", severity: "soft", atMs: 2 },
      { id: "asymmetry", severity: "soft", atMs: 3 },
    ]
    expect(pickFinding(findings)?.id).toBe("arms")
  })

  it("suppress drops arms for Ruth-style close", () => {
    const findings: Finding[] = [{ id: "arms", severity: "soft", atMs: 1 }]
    expect(pickFinding(findings, ["arms"])).toBeNull()
  })
})

describe("formatPlayClose", () => {
  it("emergency beats a stable pose", () => {
    const out = formatPlayClose([], { breath_chest: true }, closing)
    expect(out.emergency).toBe(true)
    expect(out.correction).toBeNull()
    expect(out.closingLines[0]).toContain("short of breath")
  })

  it("Ellen arms maps to locked correction, no STEADI", () => {
    const out = formatPlayClose([{ id: "arms", severity: "soft", atMs: 4000 }], { breath_chest: false }, closing)
    expect(out.emergency).toBe(false)
    expect(out.correction?.what).toBe(corrections.arms.what)
    expect(out.closingLines.join(" ")).not.toMatch(/STEADI|score|valgus/i)
  })
})

describe("symptomRoute", () => {
  it("only breath is a patient emergency", () => {
    expect(isPatientEmergency({ breath_chest: true })).toBe(true)
    expect(isPatientEmergency({ calf: true })).toBe(false)
    expect(isPatientEmergency({ dizzy: true })).toBe(false)
  })

  it("matches Rise clinic routing without a pain 911 cutoff", () => {
    expect(clinicRouteFromAnswers({ breath_chest: true }, false)).toBe("escalate_urgent")
    expect(clinicRouteFromAnswers({ calf: true }, false)).toBe("escalate_urgent")
    expect(clinicRouteFromAnswers({ dizzy: true }, false)).toBe("nurse_callback")
    expect(clinicRouteFromAnswers({ pain: 9 }, false)).toBe("continue_plan")
    expect(clinicRouteFromAnswers({}, true)).toBe("human_confirm")
  })
})
