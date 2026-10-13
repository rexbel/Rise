import { describe, expect, it } from "vitest"
import raw from "../seed/patients.json"
import { RepEvent, SeedFile, SessionResult, TriageDecision } from "../lib/types"

const seed = SeedFile.parse(raw)
const kp = Array.from({ length: 17 }, () => [0.5, 0.5, 0.9])

describe("live contracts", () => {
  it("RepEvent accepts every event type and rejects bad keypoints", () => {
    const base = { sessionId: "s1", at: 1 }
    for (const e of [
      { ...base, type: "status", status: "testing", tier: "mediapipe" },
      { ...base, type: "rep", count: 3, armsUsed: true },
      { ...base, type: "tier", tier: "mediapipe", fps: 11 },
      { ...base, type: "stop", reason: "no_stand" },
      { ...base, type: "resume" },
      { ...base, type: "finished_early" },
      { ...base, type: "keypoints", frames: [{ t: 1, kp }] },
    ]) expect(RepEvent.safeParse(e).success, e.type).toBe(true)
    expect(RepEvent.safeParse({ ...base, type: "keypoints", frames: [{ t: 1, kp: kp.slice(1) }] }).success).toBe(false)
  })

  it("every seeded session maps to a valid SessionResult and its label to a TriageDecision", () => {
    for (const p of seed.patients) {
      const t = p.scripted_today
      SessionResult.parse({
        sessionId: `seed-${p.rise_id}`, riseId: p.rise_id, rawStands: t.raw, armsUsed: t.arms, armsFromRep: t.arms_from_rep,
        steadiScore: t.steadi_score, asymmetryPct: t.asymmetry_pct, favoring: t.favoring, pausesOver3s: t.pauses_over_3s_after_standing ?? 0,
        stoppedEarly: false, resumedAfterPause: false, tandemHoldS: t.balance_tandem_hold_s, gaitObservations: t.gait_observations,
        symptoms: t.symptoms, tier: "seeded", demoData: true, startedAt: 0, finishedAt: 30_000,
      })
      TriageDecision.parse({
        recommendation: p.expected_triage.recommendation, route: p.expected_triage.route, ruleFired: "seed",
        reasons: [p.expected_triage.why], emergency: t.symptoms.short_of_breath_or_chest_pain,
      })
    }
  })
})
