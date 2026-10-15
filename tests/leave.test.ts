import { beforeEach, describe, expect, it } from "vitest"
import { triage } from "../lib/rules"
import { lastCheckIn, patients, scriptedResult } from "../lib/seed"
import { applyEvent, applyResult, getSession, invite, resetSessions } from "../lib/sessions"

const gary = patients.find((p) => p.rise_id === "rise-04")!
const ellen = patients.find((p) => p.rise_id === "rise-01")!
const tokenOf = (path: string) => new URL(path, "https://x").searchParams.get("i")!

beforeEach(() => resetSessions())

describe("leaving mid-questions (pending clinical sign-off)", () => {
  it("unanswered questions are never read as No: an on-track result becomes confirm-with-a-person", () => {
    const r = scriptedResult(gary, { sessionId: "rise-04-leave01" })
    expect(triage(r, lastCheckIn(gary), gary.episode.post_op_day_today).recommendation).toBe("continue_plan")
    const left = { ...r, questionsUnanswered: ["short_of_breath_or_chest_pain", "calf_pain_or_swelling"] as const }
    const d = triage({ ...left, questionsUnanswered: [...left.questionsUnanswered] }, lastCheckIn(gary), gary.episode.post_op_day_today)
    expect(d).toMatchObject({ recommendation: "human_confirm", ruleFired: "questions_unfinished", emergency: false })
    expect(d.reasons[0]).toBe("Questions not finished: shortness of breath or chest pain, calf pain or swelling not answered")
  })

  it("an escalation from the answers given still stands, with the unanswered questions listed", () => {
    const r = { ...scriptedResult(ellen, { sessionId: "rise-01-leave02" }), questionsUnanswered: ["calf_pain_or_swelling" as const] }
    r.symptoms = { ...r.symptoms, short_of_breath_or_chest_pain: false }
    const d = triage(r, lastCheckIn(ellen), ellen.episode.post_op_day_today)
    expect(d.recommendation).toBe("escalate_urgent")
    expect(d.reasons.at(-1)).toMatch(/^Questions not finished: calf pain or swelling/)
  })

  it("the card keeps the unanswered list for the console", () => {
    const { sessionId, path } = invite("rise-04", "classic", "Nurse A", 1000, true)
    const card = applyResult(sessionId, { ...scriptedResult(gary, { sessionId }), questionsUnanswered: ["dizzy"] }, 2000, tokenOf(path))
    expect(card.questionsUnanswered).toEqual(["dizzy"])
    expect(card.recommendation).toBe("human_confirm")
  })
})

describe("leaving before a result", () => {
  it("records where the patient left, audited; a new attempt starts over", () => {
    const { sessionId, path } = invite("rise-04", "play", "Nurse A", 1000, false)
    const t = tokenOf(path)
    const s = applyEvent(sessionId, { type: "left_flow", sessionId, step: "frame", at: 1 }, 2000, t)
    expect(s).toMatchObject({ status: "left", leftFlow: { step: "frame", at: 2000 } })
    expect(s.audit.at(-1)).toMatchObject({ action: "left_flow", reasonCode: "frame" })
    applyEvent(sessionId, { type: "status", sessionId, status: "setting_up", at: 2 }, 3000, t)
    expect(getSession(sessionId)).toMatchObject({ status: "setting_up", leftFlow: undefined })
  })

  it("leaving after a result changes nothing", () => {
    const { sessionId, path } = invite("rise-04", "classic", "Nurse A", 1000, true)
    const t = tokenOf(path)
    applyResult(sessionId, scriptedResult(gary, { sessionId }), 2000, t)
    const before = getSession(sessionId)!.status
    expect(applyEvent(sessionId, { type: "left_flow", sessionId, step: "closing", at: 1 }, 3000, t).status).toBe(before)
  })
})
