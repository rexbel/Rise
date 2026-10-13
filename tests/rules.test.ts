import { describe, expect, it } from "vitest"
import { patients, lastCheckIn, scriptedResult } from "../lib/seed"
import { triage } from "../lib/rules"

describe("triage rules", () => {
  it.each(patients.map((p) => [p.rise_id, p] as const))("%s: reproduces expected_triage", (_id, p) => {
    const d = triage(scriptedResult(p), lastCheckIn(p), p.episode.post_op_day_today)
    expect(d.recommendation).toBe(p.expected_triage.recommendation)
    expect(d.route).toBe(p.expected_triage.route)
    expect(d.emergency).toBe(p.scripted_today.symptoms.short_of_breath_or_chest_pain)
  })

  it("a stopped-early session asks a human, unless a red flag wins", () => {
    const gary = patients.find((p) => p.rise_id === "rise-04")!
    expect(triage(scriptedResult(gary, { stoppedEarly: true }), lastCheckIn(gary), 14).recommendation).toBe("human_confirm")
    const ellen = patients.find((p) => p.rise_id === "rise-01")!
    expect(triage(scriptedResult(ellen, { stoppedEarly: true }), lastCheckIn(ellen), 3).ruleFired).toBe("red_flag")
  })

  it("routes a decline after day 30 to primary care", () => {
    const gary = patients.find((p) => p.rise_id === "rise-04")!
    const d = triage(scriptedResult(gary, { rawStands: 5, steadiScore: 5 }), lastCheckIn(gary), 45)
    expect(d).toMatchObject({ recommendation: "escalate_urgent", route: "primary_care", ruleFired: "decline" })
  })
})
