import { describe, expect, it } from "vitest"
import { createPlaySession, reducePlaySession } from "@/lib/play/sessionMachine"
import type { PlayAction, PlaySession } from "@/lib/play/types"

function run(riseId: string, actions: PlayAction[], demo = false): PlaySession {
  return actions.reduce(reducePlaySession, createPlaySession(riseId, demo))
}

const toLive: PlayAction[] = [
  { type: "BEGIN" },
  { type: "READY_OK" },
  { type: "FRAME_OK" },
  { type: "COUNTDOWN_DONE" },
]

describe("sessionMachine", () => {
  it("walks howto to live", () => {
    const s = run("rise-01", toLive)
    expect(s.phase).toBe("live")
    expect(s.finishedSet).toBeNull()
  })

  it("BEGIN in demo skips to countdown", () => {
    const s = run("rise-01", [{ type: "BEGIN" }], true)
    expect(s.phase).toBe("countdown")
  })

  it("pause and resume do not reset finishedSet (still null)", () => {
    const s = run("rise-01", [...toLive, { type: "PAUSE" }, { type: "RESUME" }])
    expect(s.phase).toBe("live")
    expect(s.finishedSet).toBeNull()
  })

  it("STOP then FINISH_HERE sets finishedSet once and goes to questions", () => {
    const s = run("rise-01", [
      ...toLive,
      { type: "STOP" },
      { type: "FINISH_HERE", durationMs: 12_000 },
    ])
    expect(s.phase).toBe("questions")
    expect(s.finishedSet?.endedBy).toBe("finish_here")
    expect(s.finishedSet?.durationMs).toBe(12_000)
  })

  it("SET_COMPLETE keeps finishedSet through later actions", () => {
    const s = run("rise-01", [
      ...toLive,
      { type: "FINDING", finding: { id: "arms", severity: "soft", atMs: 4000 } },
      { type: "SET_COMPLETE", durationMs: 12_000 },
      { type: "ANSWER", id: "pain", value: 6 },
      { type: "BACK_TO_QUESTIONS" },
      { type: "SET_COMPLETE", durationMs: 99_000 },
    ])
    expect(s.finishedSet?.durationMs).toBe(12_000)
    expect(s.finishedSet?.findings).toHaveLength(1)
    expect(s.finishedSet?.exerciseId).toBe("sit_to_stand")
  })

  it("SELECT_EXERCISE before begin sticks on finishedSet", () => {
    const s = run("rise-01", [
      { type: "SELECT_EXERCISE", exerciseId: "mini_squat" },
      ...toLive,
      { type: "SET_COMPLETE", durationMs: 8_000 },
    ])
    expect(s.exerciseId).toBe("mini_squat")
    expect(s.finishedSet?.exerciseId).toBe("mini_squat")
  })

  it("tracking loss resumes to live without a finishedSet", () => {
    const s = run("rise-01", [...toLive, { type: "TRACKING_LOST" }, { type: "TRACKING_OK" }])
    expect(s.phase).toBe("live")
    expect(s.finishedSet).toBeNull()
  })

  it("breath_chest true goes to emergencyConfirm then emergency", () => {
    const s = run("rise-01", [
      ...toLive,
      { type: "SET_COMPLETE", durationMs: 12_000 },
      { type: "ANSWER", id: "breath_chest", value: true },
      { type: "CONFIRM_EMERGENCY" },
    ])
    expect(s.phase).toBe("emergency")
    expect(s.answers.breath_chest).toBe(true)
  })

  it("emergency mistap returns to questions and clears breath", () => {
    const s = run("rise-01", [
      ...toLive,
      { type: "SET_COMPLETE", durationMs: 12_000 },
      { type: "ANSWER", id: "breath_chest", value: true },
      { type: "EMERGENCY_MISTAP" },
    ])
    expect(s.phase).toBe("questions")
    expect(s.answers.breath_chest).toBeUndefined()
    expect(s.finishedSet).not.toBeNull()
  })

  it("non-red-flag answers go to close when complete", () => {
    const s = run("rise-01", [
      ...toLive,
      { type: "SET_COMPLETE", durationMs: 12_000 },
      { type: "ANSWER", id: "pain", value: 2 },
      { type: "ANSWER", id: "dizzy", value: false },
      { type: "ANSWER", id: "breath_chest", value: false },
      { type: "ANSWER", id: "calf", value: false },
    ])
    expect(s.phase).toBe("close")
  })

  it("can re-answer questions from close without replaying the set", () => {
    const s = run("rise-01", [
      ...toLive,
      { type: "SET_COMPLETE", durationMs: 12_000 },
      { type: "ANSWER", id: "pain", value: 2 },
      { type: "ANSWER", id: "dizzy", value: false },
      { type: "ANSWER", id: "breath_chest", value: false },
      { type: "ANSWER", id: "calf", value: false },
      { type: "PRESENTER_JUMP_TO_QUESTIONS" },
      { type: "ANSWER", id: "breath_chest", value: true },
    ])
    expect(s.phase).toBe("emergencyConfirm")
    expect(s.finishedSet?.durationMs).toBe(12_000)
    expect(s.answers.pain).toBeUndefined()
  })

  it("PRESENTER_JUMP_TO_QUESTIONS is a no-op before the set ends", () => {
    const s = run("rise-01", [...toLive, { type: "PRESENTER_JUMP_TO_QUESTIONS" }])
    expect(s.phase).toBe("live")
    expect(s.finishedSet).toBeNull()
  })

  it("PRESENTER_SKIP_TO_LIVE from howto", () => {
    const s = run("rise-01", [{ type: "PRESENTER_SKIP_TO_LIVE" }], true)
    expect(s.phase).toBe("live")
  })

  it("ignores ANSWER before finishedSet", () => {
    const s = run("rise-01", [...toLive, { type: "ANSWER", id: "breath_chest", value: true }])
    expect(s.phase).toBe("live")
    expect(s.answers.breath_chest).toBeUndefined()
  })
})
