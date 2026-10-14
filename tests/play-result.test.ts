import { describe, expect, it } from "vitest"
import lines from "@/content/patient-lines.json"
import {
  buildPlayResult,
  playClose,
  playStatusFor,
  playSymptoms,
  playTrend,
  questionNumber,
  resolvePlaySessionId,
  type PlayResultInput,
} from "@/lib/play/playResult"
import type { FinishedSet, QuestionAnswers } from "@/lib/play/types"
import { triage } from "@/lib/rules"
import { getPatient } from "@/lib/seed"
import { SESSION_ID, SessionResult, type SeedPatient } from "@/lib/types"

const NOW = 1_760_000_000_000
const ALL_NO: QuestionAnswers = { pain: 2, dizzy: false, breath_chest: false, calf: false }

function patient(id: string): SeedPatient {
  const p = getPatient(id)
  if (!p) throw new Error(id)
  return p
}

function set(overrides: Partial<FinishedSet> = {}): FinishedSet {
  return { findings: [], durationMs: 24_000, endedBy: "script", exerciseId: "sit_to_stand", ...overrides }
}

function input(p: SeedPatient, overrides: Partial<PlayResultInput> = {}): PlayResultInput {
  return {
    sessionId: `${p.rise_id}-abc123`,
    patient: p,
    finishedSet: set(),
    answers: ALL_NO,
    reps: 6,
    targetReps: 6,
    resumedAfterPause: false,
    tier: "mediapipe",
    demo: false,
    seeded: false,
    startedAt: NOW - 30_000,
    finishedAt: NOW,
    ...overrides,
  }
}

describe("resolvePlaySessionId", () => {
  it("keeps a valid invite id for this patient", () => {
    expect(resolvePlaySessionId("rise-01", "rise-01-mg2abc12", NOW)).toBe("rise-01-mg2abc12")
  })

  it("rejects another patient's id, a bad shape, or nothing, and generates one", () => {
    for (const bad of ["rise-02-mg2abc12", "rise-01-", "rise-01-ABC!", "x", undefined]) {
      const id = resolvePlaySessionId("rise-01", bad, NOW)
      expect(id).toBe(`rise-01-${NOW.toString(36)}`)
      expect(SESSION_ID.test(id)).toBe(true)
    }
  })
})

describe("playStatusFor", () => {
  it("maps phases to board statuses", () => {
    expect(playStatusFor("howto")).toBeNull()
    expect(playStatusFor("home")).toBeNull()
    expect(playStatusFor("ready")).toBe("setting_up")
    expect(playStatusFor("frame")).toBe("setting_up")
    expect(playStatusFor("countdown")).toBe("setting_up")
    expect(playStatusFor("live")).toBe("testing")
    expect(playStatusFor("stepBack")).toBe("testing")
    expect(playStatusFor("paused")).toBe("paused")
    expect(playStatusFor("questions")).toBe("questions")
    expect(playStatusFor("close")).toBe("scoring")
    expect(playStatusFor("emergency")).toBe("scoring")
  })
})

describe("buildPlayResult", () => {
  it("builds a valid play_set result counting every completed rep", () => {
    const ellen = patient("rise-01")
    const r = buildPlayResult(
      input(ellen, {
        finishedSet: set({ findings: [{ id: "arms", severity: "soft", atMs: 9000 }] }),
        reps: 6,
        armsFromRep: 3,
        demo: true,
        seeded: true,
        tier: "seeded",
      }),
    )
    expect(() => SessionResult.parse(r)).not.toThrow()
    expect(r.protocol).toBe("play_set")
    expect(r.exerciseId).toBe("sit_to_stand")
    expect(r.targetReps).toBe(6)
    expect(r.rawStands).toBe(6)
    expect(r.armsUsed).toBe(true)
    expect(r.armsFromRep).toBe(3)
    expect(r.steadiScore).toBe(0)
    expect(r.stoppedEarly).toBe(false)
    expect(r.demoData).toBe(true)
    expect(r.riseId).toBe("rise-01")
  })

  it("marks Finish here as stopped early and drops armsFromRep without arm use", () => {
    const r = buildPlayResult(input(patient("rise-04"), { finishedSet: set({ endedBy: "finish_here" }), reps: 2, armsFromRep: 2 }))
    expect(r.stoppedEarly).toBe(true)
    expect(r.armsUsed).toBe(false)
    expect(r.armsFromRep).toBeUndefined()
    expect(r.demoData).toBe(false)
  })

  it("carries scripted gait, tandem, and incontinence only in demo", () => {
    const harold = patient("rise-07")
    const live = buildPlayResult(input(harold))
    expect(live.symptoms.new_incontinence).toBe(false)
    expect(live.gaitObservations).toEqual([])
    expect(live.tandemHoldS).toBeUndefined()
    const demo = buildPlayResult(input(harold, { demo: true }))
    expect(demo.symptoms.new_incontinence).toBe(harold.scripted_today.symptoms.new_incontinence)
    expect(demo.gaitObservations).toEqual(harold.scripted_today.gait_observations)
    const diane = patient("rise-05")
    expect(buildPlayResult(input(diane, { demo: true })).tandemHoldS).toBe(diane.scripted_today.balance_tandem_hold_s)
  })

  it("maps answers to symptoms; unanswered after an emergency Yes count as no", () => {
    const s = playSymptoms({ pain: 7, dizzy: true, breath_chest: true }, patient("rise-01"), false)
    expect(s).toEqual({ pain_0_10: 7, dizzy: true, short_of_breath_or_chest_pain: true, calf_pain_or_swelling: false, new_incontinence: false })
  })
})

describe("playTrend", () => {
  const prevNoArms = { label: "x", post_op_day: 2, raw_stands: 5, arms_used: false, steadi_score: 5 }
  const prevArms = { ...prevNoArms, arms_used: true, steadi_score: 0 }

  it("finished early wins", () => {
    expect(playTrend({ stoppedEarly: true, armsUsed: true }, prevNoArms)).toBe("finished_early")
  })
  it("new arm use is harder; arms already used last time is same", () => {
    expect(playTrend({ stoppedEarly: false, armsUsed: true }, prevNoArms)).toBe("harder")
    expect(playTrend({ stoppedEarly: false, armsUsed: true }, prevArms)).toBe("same")
  })
  it("is never better, whatever the rep count", () => {
    expect(playTrend({ stoppedEarly: false, armsUsed: false }, prevNoArms)).toBe("same")
    expect(playTrend({ stoppedEarly: false, armsUsed: false }, undefined)).toBe("first")
  })
})

describe("playClose", () => {
  it("runs the live rules on the sent result, not the seed's expected triage", () => {
    // Gary's seed says trend "better" + continue_plan; a game set is never "better".
    const gary = patient("rise-04")
    const r = buildPlayResult(input(gary, { reps: 2 }))
    const out = playClose(r, gary, set(), "Riverside Ortho")
    expect(out.decision).toEqual(triage(r, gary.checkins.at(-1), gary.episode.post_op_day_today))
    expect(out.recommendation).toBe("continue_plan")
    expect(out.trend).toBe("same")
    expect(out.lines).toEqual([lines.trend.same, lines.next_step.continue_plan, lines.closure])
  })

  it("Ellen's new arm use: correction, harder, care team today", () => {
    const ellen = patient("rise-01")
    const fs = set({ findings: [{ id: "arms", severity: "soft", atMs: 9000 }] })
    const r = buildPlayResult(input(ellen, { finishedSet: fs, armsFromRep: 3 }))
    const out = playClose(r, ellen, fs, "Riverside Ortho")
    expect(out.recommendation).toBe("escalate_urgent")
    expect(out.trend).toBe("harder")
    expect(out.correction?.what).toMatch(/arms/i)
    expect(out.lines).toEqual([lines.trend.harder, lines.next_step.escalate_urgent, lines.closure])
  })

  it("Finish here uses the finished-early lines", () => {
    const walter = patient("rise-03")
    const fs = set({ endedBy: "finish_here" })
    const out = playClose(buildPlayResult(input(walter, { finishedSet: fs })), walter, fs, "Riverside Ortho")
    expect(out.recommendation).toBe("finished_early")
    expect(out.lines).toEqual([lines.trend.finished_early, lines.next_step.finished_early, lines.closure])
  })

  it("dizzy names the clinic on the nurse call", () => {
    const walter = patient("rise-03")
    const r = buildPlayResult(input(walter, { answers: { ...ALL_NO, dizzy: true } }))
    const out = playClose(r, walter, set(), "Lakeside Bone & Joint")
    expect(out.recommendation).toBe("nurse_callback")
    expect(out.lines[1]).toContain("Lakeside Bone & Joint")
  })

  it("a red flag is the emergency line alone, no correction", () => {
    const ellen = patient("rise-01")
    const fs = set({ findings: [{ id: "arms", severity: "soft", atMs: 9000 }] })
    const r = buildPlayResult(input(ellen, { finishedSet: fs, answers: { pain: 4, dizzy: false, breath_chest: true } }))
    const out = playClose(r, ellen, fs, "Riverside Ortho")
    expect(out.emergency).toBe(true)
    expect(out.correction).toBeNull()
    expect(out.lines).toEqual([lines.emergency.line])
  })

  it("never puts a count or score in front of the patient", () => {
    for (const id of ["rise-01", "rise-02", "rise-03", "rise-04", "rise-05", "rise-06", "rise-07"]) {
      const p = patient(id)
      const r = buildPlayResult(input(p, { reps: 9 }))
      const out = playClose(r, p, set(), "Riverside Ortho")
      const text = [...out.lines, out.correction?.what ?? ""].join(" ")
      expect(text, id).not.toMatch(/\d|STEADI|score|below average|stands/i)
    }
  })
})

describe("questionNumber", () => {
  it("numbers the four questions in order", () => {
    expect([questionNumber("pain"), questionNumber("dizzy"), questionNumber("breath_chest"), questionNumber("calf")]).toEqual([1, 2, 3, 4])
  })
})
