import { describe, expect, it } from "vitest"
import { symptomAsked } from "@/components/clinic/session-facts"
import { FLOW_STEP_LABEL, statusText } from "@/components/clinic/format"
import { unansweredKeys, withoutAnswer } from "@/components/patient/flow"
import lines from "@/content/patient-lines.json"
import voice from "@/content/voice-lines.json"
import { buildPlayResult, unansweredQuestions } from "@/lib/play/playResult"
import { createPlaySession, currentQuestion, playExits, reducePlaySession } from "@/lib/play/sessionMachine"
import type { PlayAction, PlayPhase, PlaySession } from "@/lib/play/types"
import { patients } from "@/lib/seed"
import { SessionResult } from "@/lib/types"

function run(actions: PlayAction[], demo = false): PlaySession {
  return actions.reduce(reducePlaySession, createPlaySession("rise-01", demo))
}

const toLive: PlayAction[] = [{ type: "BEGIN" }, { type: "READY_OK" }, { type: "FRAME_OK" }, { type: "COUNTDOWN_DONE" }]
const toQuestions: PlayAction[] = [...toLive, { type: "SET_COMPLETE", durationMs: 12_000 }]

describe("RehabNinja Back", () => {
  it("goes one question back and keeps every answer", () => {
    const s = run([...toQuestions, { type: "ANSWER", id: "pain", value: 4 }, { type: "ANSWER", id: "dizzy", value: true }, { type: "BACK" }])
    expect(s.phase).toBe("questions")
    expect(currentQuestion(s)).toBe("dizzy")
    expect(s.answers).toEqual({ pain: 4, dizzy: true })
    const again = reducePlaySession(s, { type: "BACK" })
    expect(currentQuestion(again)).toBe("pain")
    expect(again.answers).toEqual({ pain: 4, dizzy: true })
  })

  it("is a no-op on the first question", () => {
    const s = run([...toQuestions, { type: "BACK" }])
    expect(currentQuestion(s)).toBe("pain")
    expect(playExits(s).back).toBe(false)
  })

  it("after Back, answering walks forward one question at a time and keeps later answers", () => {
    const s = run([
      ...toQuestions,
      { type: "ANSWER", id: "pain", value: 4 },
      { type: "ANSWER", id: "dizzy", value: false },
      { type: "ANSWER", id: "breath_chest", value: false },
      { type: "BACK" },
      { type: "BACK" },
      { type: "ANSWER", id: "pain", value: 6 },
    ])
    expect(currentQuestion(s)).toBe("dizzy")
    expect(s.answers).toEqual({ pain: 6, dizzy: false, breath_chest: false })
    const done = [
      { type: "ANSWER", id: "dizzy", value: false },
      { type: "ANSWER", id: "breath_chest", value: false },
      { type: "ANSWER", id: "calf", value: false },
    ] as PlayAction[]
    expect(done.reduce(reducePlaySession, s).phase).toBe("close")
  })

  it("never skips past an answered red-flag Yes", () => {
    const red = run([
      ...toQuestions,
      { type: "ANSWER", id: "pain", value: 2 },
      { type: "ANSWER", id: "dizzy", value: false },
      { type: "ANSWER", id: "breath_chest", value: true },
    ])
    expect(red.phase).toBe("emergency")
    // Back does nothing on the emergency screen; only "I tapped Yes by mistake" leaves it.
    expect(reducePlaySession(red, { type: "BACK" })).toBe(red)
    expect(playExits(red)).toMatchObject({ back: false, leave: null, mistap: true })
    // Even a questions state holding a red-flag Yes (forced) goes to the emergency screen on Back, never around it.
    const forced: PlaySession = { ...red, phase: "questions", question: "calf" }
    expect(reducePlaySession(forced, { type: "BACK" }).phase).toBe("emergency")
    // Leave is not offered there either.
    expect(reducePlaySession(red, { type: "LEAVE" })).toBe(red)
  })

  it("the mistap clears the red flag answer and returns to that question", () => {
    const s = run([
      ...toQuestions,
      { type: "ANSWER", id: "pain", value: 2 },
      { type: "ANSWER", id: "dizzy", value: false },
      { type: "ANSWER", id: "breath_chest", value: true },
      { type: "EMERGENCY_MISTAP" },
    ])
    expect(s.phase).toBe("questions")
    expect(currentQuestion(s)).toBe("breath_chest")
    expect(s.answers).toEqual({ pain: 2, dizzy: false })
    expect(unansweredQuestions(s.answers)).toEqual(["short_of_breath_or_chest_pain", "calf_pain_or_swelling"])
  })

  it("steps back from framing to the ready card, and from the ready card to the start", () => {
    const frame = run([{ type: "BEGIN" }, { type: "READY_OK" }])
    expect(frame.phase).toBe("frame")
    const ready = reducePlaySession(frame, { type: "BACK" })
    expect(ready.phase).toBe("ready")
    expect(reducePlaySession(ready, { type: "BACK" }).phase).toBe("howto")
  })

  it("steps back through the closing steps", () => {
    const close = run([
      ...toQuestions,
      { type: "ANSWER", id: "pain", value: 0 },
      { type: "ANSWER", id: "dizzy", value: false },
      { type: "ANSWER", id: "breath_chest", value: false },
      { type: "ANSWER", id: "calf", value: false },
    ])
    expect(close.phase).toBe("close")
    expect(playExits(close)).toMatchObject({ back: false, leave: "done" })
    const second = reducePlaySession(close, { type: "CLOSE_NEXT" })
    expect(second.closeStep).toBe(1)
    expect(playExits(second).back).toBe(true)
    expect(reducePlaySession(second, { type: "BACK" }).closeStep).toBe(0)
  })
})

describe("RehabNinja countdown Stop", () => {
  it("cancels the countdown back to framing; the set never starts", () => {
    const s = run([{ type: "BEGIN" }, { type: "READY_OK" }, { type: "FRAME_OK" }, { type: "STOP" }])
    expect(s.phase).toBe("frame")
    expect(reducePlaySession(s, { type: "COUNTDOWN_DONE" }).phase).toBe("frame")
  })

  it("a demo (no framing) goes back to the start", () => {
    expect(run([{ type: "BEGIN" }, { type: "STOP" }], true).phase).toBe("howto")
  })
})

describe("RehabNinja Leave", () => {
  const states: Record<PlayPhase, PlaySession> = {
    home: { ...createPlaySession("rise-01"), phase: "home" },
    howto: createPlaySession("rise-01"),
    ready: run([{ type: "BEGIN" }]),
    frame: run([{ type: "BEGIN" }, { type: "READY_OK" }]),
    countdown: run([{ type: "BEGIN" }, { type: "READY_OK" }, { type: "FRAME_OK" }]),
    live: run(toLive),
    stepBack: run([...toLive, { type: "TRACKING_LOST" }]),
    paused: run([...toLive, { type: "PAUSE" }]),
    questions: run(toQuestions),
    emergency: run([...toQuestions, { type: "ANSWER", id: "breath_chest", value: true }]),
    close: run([
      ...toQuestions,
      { type: "ANSWER", id: "pain", value: 0 },
      { type: "ANSWER", id: "dizzy", value: false },
      { type: "ANSWER", id: "breath_chest", value: false },
      { type: "ANSWER", id: "calf", value: false },
    ]),
    left: run([{ type: "BEGIN" }, { type: "LEAVE" }]),
  }

  it("fixtures reach the phase they are named for", () => {
    for (const [phase, s] of Object.entries(states)) expect(s.phase, phase).toBe(phase)
  })

  it("every phase has a way back or out", () => {
    for (const [phase, s] of Object.entries(states)) {
      if (phase === "left") continue
      const e = playExits(s)
      expect(e.back || e.leave !== null || e.stop || e.mistap, phase).toBe(true)
    }
  })

  it("Leave (confirmed) is on every phase outside the live set and the emergency screen; the closing has Done", () => {
    const confirm: PlayPhase[] = ["home", "howto", "ready", "frame", "countdown", "paused", "questions"]
    for (const phase of confirm) {
      expect(playExits(states[phase]).leave, phase).toBe("confirm")
      const left = reducePlaySession(states[phase], { type: "LEAVE" })
      expect(left.phase, phase).toBe("left")
    }
    expect(playExits(states.close).leave).toBe("done")
    // The live set keeps its own Stop and Pause; nothing duplicated over the game.
    expect(playExits(states.live)).toMatchObject({ leave: null, stop: true })
    expect(playExits(states.stepBack)).toMatchObject({ leave: null, stop: true })
  })

  it("records where the patient left from", () => {
    expect(reducePlaySession(states.howto, { type: "LEAVE" }).leftFrom).toBe("welcome")
    expect(reducePlaySession(states.ready, { type: "LEAVE" }).leftFrom).toBe("setup")
    expect(reducePlaySession(states.frame, { type: "LEAVE" }).leftFrom).toBe("frame")
    expect(reducePlaySession(states.frame, { type: "LEAVE", step: "help" }).leftFrom).toBe("help")
    expect(reducePlaySession(states.live, { type: "LEAVE", step: "help" }).leftFrom).toBe("help")
    expect(reducePlaySession(states.paused, { type: "LEAVE" }).leftFrom).toBe("test")
    expect(reducePlaySession(states.questions, { type: "LEAVE" }).leftFrom).toBe("questions")
  })

  it("leaving the questions keeps the answers and the finished set for the result", () => {
    const s = reducePlaySession(
      reducePlaySession(states.questions, { type: "ANSWER", id: "pain", value: 3 }),
      { type: "LEAVE" },
    )
    expect(s.phase).toBe("left")
    expect(s.finishedSet).not.toBeNull()
    expect(s.answers).toEqual({ pain: 3 })
  })
})

describe("unanswered questions", () => {
  it("lists the questions not answered, in order, with the shared keys", () => {
    expect(unansweredQuestions({})).toEqual(["pain_0_10", "dizzy", "short_of_breath_or_chest_pain", "calf_pain_or_swelling"])
    expect(unansweredQuestions({ pain: 0, dizzy: false })).toEqual(["short_of_breath_or_chest_pain", "calf_pain_or_swelling"])
    // A 0 pain and a No are answers, not gaps.
    expect(unansweredQuestions({ pain: 0, dizzy: false, breath_chest: false, calf: false })).toEqual([])
  })

  it("the classic flow computes the same list from its own ids", () => {
    const ids = ["pain_0_10", "dizzy", "short_of_breath_or_chest_pain", "calf_pain_or_swelling"]
    expect(unansweredKeys(ids, { pain_0_10: 0, dizzy: true })).toEqual(["short_of_breath_or_chest_pain", "calf_pain_or_swelling"])
    expect(unansweredKeys(ids, { pain_0_10: 0, dizzy: false, short_of_breath_or_chest_pain: false, calf_pain_or_swelling: false })).toEqual([])
    expect(withoutAnswer({ pain_0_10: 1, short_of_breath_or_chest_pain: true }, "short_of_breath_or_chest_pain")).toEqual({ pain_0_10: 1 })
  })

  it("the result carries the list only when something is unanswered, and stays valid", () => {
    const patient = patients.find((p) => p.rise_id === "rise-01")!
    const base = {
      sessionId: "rise-01-leave",
      patient,
      finishedSet: { findings: [], durationMs: 12_000, endedBy: "script" as const, exerciseId: "sit_to_stand" as const },
      reps: 5,
      targetReps: 8,
      resumedAfterPause: false,
      tier: "seeded" as const,
      demo: true,
      seeded: true,
      startedAt: 1,
      finishedAt: 2,
    }
    const left = buildPlayResult({ ...base, answers: { pain: 3 }, questionsUnanswered: unansweredQuestions({ pain: 3 }) })
    expect(SessionResult.parse(left).questionsUnanswered).toEqual(["dizzy", "short_of_breath_or_chest_pain", "calf_pain_or_swelling"])
    const full = buildPlayResult({ ...base, answers: { pain: 0, dizzy: false, breath_chest: false, calf: false }, questionsUnanswered: [] })
    expect(full.questionsUnanswered).toBeUndefined()
  })
})

describe("console", () => {
  it("says where the patient left", () => {
    expect(statusText({ status: "left", count: 0, surface: "play", leftFlow: { step: "frame", at: 1 } })).toBe("Left the check-in · framing")
    expect(statusText({ status: "left", count: 0, surface: "classic" })).toBe("Left the check-in")
    expect(Object.keys(FLOW_STEP_LABEL)).toHaveLength(9)
  })

  it("shows unanswered questions as Not answered, never No or Not asked", () => {
    const card = {
      symptoms: { pain_0_10: 0, dizzy: false, short_of_breath_or_chest_pain: false, calf_pain_or_swelling: false, new_incontinence: false },
      scripted: [],
      questionsUnanswered: ["pain_0_10", "short_of_breath_or_chest_pain", "calf_pain_or_swelling"] as const,
    }
    const c = { ...card, questionsUnanswered: [...card.questionsUnanswered] }
    expect(symptomAsked(c, "pain_0_10")).toBe("not_answered")
    expect(symptomAsked(c, "short_of_breath_or_chest_pain")).toBe("not_answered")
    expect(symptomAsked(c, "calf_pain_or_swelling")).toBe("not_answered")
    expect(symptomAsked(c, "dizzy")).toBe("asked")
    expect(symptomAsked(c, "new_incontinence")).toBe("not_asked")
    // Without a leave, the red-flag stop still reads "not asked" for calf.
    const red = { ...card, symptoms: { ...card.symptoms, short_of_breath_or_chest_pain: true }, questionsUnanswered: [] }
    expect(symptomAsked(red, "calf_pain_or_swelling")).toBe("not_asked")
  })
})

describe("leave copy", () => {
  it("is calm, has no digits, and never promises a call", () => {
    for (const text of Object.values(lines.leave)) {
      expect(text, text).not.toMatch(/\d/)
      expect(text, text).not.toMatch(/\bcall\b|score|below average/i)
    }
    expect(lines.emergency.mistap).toBe("I tapped Yes by mistake")
  })

  it("the classic voice lines for leaving match the printed copy", () => {
    const spoken = new Map(voice.lines.map((l) => [l.id, l.text]))
    expect(spoken.get("leave_confirm")).toBe(`${lines.leave.confirm_title} ${lines.leave.confirm_body}`)
    expect(spoken.get("leave_confirm_questions")).toBe(`${lines.leave.confirm_title} ${lines.leave.confirm_body_questions}`)
    expect(spoken.get("left_checkin")).toBe(`${lines.leave.left_title}. ${lines.leave.left_body}`)
    expect(spoken.get("left_checkin_sent")).toBe(`${lines.leave.left_title}. ${lines.leave.left_body_sent}`)
  })
})
