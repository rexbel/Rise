import { beforeEach, describe, expect, it } from "vitest"
import { triage } from "../lib/rules"
import { lastCheckIn, patients, scriptedResult } from "../lib/seed"
import { sessionTone } from "../components/clinic/format"
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

describe("review fixes", () => {
  it("a nurse callback keeps its route when questions are unfinished", () => {
    const r = scriptedResult(gary, { sessionId: "rise-04-leave03" })
    r.symptoms = { ...r.symptoms, dizzy: true }
    const base = triage(r, lastCheckIn(gary), gary.episode.post_op_day_today)
    expect(base.recommendation).toBe("nurse_callback")
    const d = triage({ ...r, questionsUnanswered: ["calf_pain_or_swelling"] }, lastCheckIn(gary), gary.episode.post_op_day_today)
    expect(d).toMatchObject({ recommendation: "human_confirm", ruleFired: "questions_unfinished", route: base.route })
  })

  it("a retracted red flag waits for a person even when the later answers are on track", () => {
    const { sessionId, path } = invite("rise-04", "classic", "Nurse A", 1000, true)
    const t = tokenOf(path)
    const r = scriptedResult(gary, { sessionId })
    applyResult(sessionId, { ...r, symptoms: { ...r.symptoms, short_of_breath_or_chest_pain: true } }, 2000, t)
    const card = applyResult(sessionId, r, 3000, t)
    expect(card.recommendation).toBe("continue_plan")
    const s = getSession(sessionId)!
    expect(s.status).toBe("needs_confirmation")
    expect(sessionTone(s)).toBe("confirm")
  })

  it("a late phone event can't move a left session back to testing", () => {
    const { sessionId, path } = invite("rise-04", "play", "Nurse A", 1000, false)
    const t = tokenOf(path)
    applyEvent(sessionId, { type: "left_flow", sessionId, step: "test", at: 1 }, 2000, t)
    applyEvent(sessionId, { type: "stop", sessionId, reason: "button", at: 2 }, 2100, t)
    applyEvent(sessionId, { type: "status", sessionId, status: "testing", at: 3 }, 2200, t)
    const s = getSession(sessionId)!
    expect(s).toMatchObject({ status: "left", leftFlow: { step: "test" } })
    expect(sessionTone(s)).toBe("confirm")
  })

  it("leaving before the test stays neutral; a repeat leave from the same step is not audited twice", () => {
    const { sessionId, path } = invite("rise-04", "play", "Nurse A", 1000, false)
    const t = tokenOf(path)
    applyEvent(sessionId, { type: "left_flow", sessionId, step: "welcome", at: 1 }, 2000, t)
    const n = getSession(sessionId)!.audit.length
    const s = applyEvent(sessionId, { type: "left_flow", sessionId, step: "welcome", at: 2 }, 2100, t)
    expect(s.audit.length).toBe(n)
    expect(sessionTone(s)).toBe("neutral")
  })
})
