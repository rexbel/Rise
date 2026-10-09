import { describe, expect, it } from "vitest"
import { createFindingTracker } from "@/lib/play/findings"
import { countStandPeaks, poseAt, poseScript, scriptDurationMs, HZ } from "@/lib/play/syntheticPose"
import { formatPlayClose } from "@/lib/play/formatPatient"

function runScript(riseId: string) {
  const tracker = createFindingTracker()
  const findings = []
  const step = 1000 / HZ
  for (let t = 0; t <= scriptDurationMs(riseId); t += step) {
    const { finding } = tracker.push({ t, keypoints: poseAt(riseId, t) })
    if (finding) findings.push(finding)
  }
  return findings
}

describe("syntheticPose peaks", () => {
  it("Ellen is 3 rises", () => {
    expect(poseScript("rise-01").rises).toBe(3)
    expect(countStandPeaks("rise-01")).toBe(3)
  })

  it("Gary is 10 clean rises", () => {
    expect(poseScript("rise-04").rises).toBe(10)
    expect(countStandPeaks("rise-04")).toBe(10)
  })

  it("Judith is 6 rises with unload", () => {
    expect(poseScript("rise-02").rises).toBe(6)
    expect(poseScript("rise-02").leftUnload).toBe(true)
    expect(countStandPeaks("rise-02")).toBe(6)
  })
})

describe("findings from stream", () => {
  it("debounces before firing arms on Ellen", () => {
    const findings = runScript("rise-01")
    expect(findings.some((f) => f.id === "arms")).toBe(true)
    expect(findings.find((f) => f.id === "arms")!.atMs).toBeGreaterThanOrEqual((1000 / HZ) * 4)
  })

  it("Gary has no form findings", () => {
    expect(runScript("rise-04")).toEqual([])
  })

  it("Judith fires asymmetry", () => {
    const ids = runScript("rise-02").map((f) => f.id)
    expect(ids).toContain("asymmetry")
  })

  it("null keypoints do not fire a finding", () => {
    const tracker = createFindingTracker()
    for (let i = 0; i < 12; i++) {
      const { finding, visual } = tracker.push({ t: i * 70, keypoints: null })
      expect(finding).toBeNull()
      expect(visual.trackingOk).toBe(false)
    }
  })
})

describe("emergency vs pose", () => {
  it("breath answer beats a stable Gary close", () => {
    const out = formatPlayClose([], { breath_chest: true }, {
      trend: "same",
      recommendation: "continue_plan",
      redFlag: false,
      clinicName: "Riverside Ortho",
    })
    expect(out.emergency).toBe(true)
    expect(out.correction).toBeNull()
  })
})
