import { beforeEach, describe, expect, it } from "vitest"
import { patients, scriptedResult } from "../lib/seed"
import { triage } from "../lib/rules"
import { lastCheckIn } from "../lib/seed"
import {
  applyEvent,
  applyResult,
  approve,
  finalRecommendation,
  getSession,
  invite,
  listSessions,
  noteNeedsReview,
  resetSessions,
  riseIdOf,
  SessionError,
  subscribe,
} from "../lib/sessions"
import type { SessionStreamMessage } from "../lib/types"

const ellen = patients.find((p) => p.rise_id === "rise-01")!
const gary = patients.find((p) => p.rise_id === "rise-04")!

function resultFor(p: typeof ellen, sessionId: string, overrides = {}) {
  return scriptedResult(p, { sessionId, ...overrides })
}

beforeEach(() => resetSessions())

describe("session store", () => {
  it("invite -> live events -> result -> card, all pushed to subscribers", () => {
    const seen: SessionStreamMessage[] = []
    const off = subscribe((m) => seen.push(m))
    const { sessionId, path, sms } = invite("rise-01", "play", "Nurse A", 1000)
    expect(path).toBe(`/play/rise-01?s=${sessionId}`)
    expect(sms).toEqual({ sent: false, demoData: true })

    applyEvent(sessionId, { type: "status", sessionId, status: "testing", tier: "mediapipe", at: 1 }, 2000)
    applyEvent(sessionId, { type: "rep", sessionId, count: 2, armsUsed: true, at: 2 }, 3000)
    expect(getSession(sessionId)).toMatchObject({ status: "testing", count: 2, armsUsed: true, tier: "mediapipe" })

    const card = applyResult(sessionId, resultFor(ellen, sessionId), 4000)
    expect(card).toMatchObject({ recommendation: "escalate_urgent", route: "surgeon_on_call", ruleFired: "red_flag", approval: "pending" })
    expect(getSession(sessionId)?.status).toBe("ready")
    expect(seen.filter((m) => m.type === "session")).toHaveLength(4)
    off()
  })

  it("matches expected_triage for every seed patient through the server path", () => {
    for (const p of patients) {
      const sessionId = `${p.rise_id}-seedcheck`
      const card = applyResult(sessionId, resultFor(p, sessionId))
      expect(card.recommendation, p.rise_id).toBe(p.expected_triage.recommendation)
    }
  })

  it("accepts a phone that opened a link without an invite, but not an unknown patient", () => {
    applyEvent("rise-02-abcd1234", { type: "status", sessionId: "rise-02-abcd1234", status: "setting_up", at: 1 })
    expect(getSession("rise-02-abcd1234")?.riseId).toBe("rise-02")
    expect(() => applyEvent("rise-99-abcd1234", { type: "resume", sessionId: "rise-99-abcd1234", at: 1 })).toThrow(SessionError)
    expect(riseIdOf("../etc-passwd")).toBeNull()
  })

  it("rejects a result whose ids don't match the URL", () => {
    const { sessionId } = invite("rise-01", "classic")
    expect(() => applyResult(sessionId, resultFor(ellen, "rise-01-other0000"))).toThrow(/mismatch/)
    expect(() => applyResult(sessionId, resultFor(gary, sessionId))).toThrow(/does not match/)
  })

  it("late phone events never move a finished card backwards", () => {
    const { sessionId } = invite("rise-04", "classic")
    applyResult(sessionId, resultFor(gary, sessionId))
    applyEvent(sessionId, { type: "status", sessionId, status: "testing", at: 9 })
    expect(getSession(sessionId)?.status).toBe("ready")
  })

  it("posting the result again with a plain note keeps a human decision", () => {
    const { sessionId } = invite("rise-04", "classic")
    applyResult(sessionId, resultFor(gary, sessionId))
    approve(sessionId, { action: "approve", user: "Nurse A" })
    const card = applyResult(sessionId, resultFor(gary, sessionId, { patientNote: "Knees a bit stiff today" }))
    expect(card.approval).toBe("approved")
    expect(card.patientNote).toBe("Knees a bit stiff today")
  })

  it("a newly flagged note reopens an approved card", () => {
    const { sessionId } = invite("rise-04", "classic")
    applyResult(sessionId, resultFor(gary, sessionId))
    approve(sessionId, { action: "approve", user: "Nurse A" })
    const card = applyResult(sessionId, resultFor(gary, sessionId, { patientNote: "I had a fall yesterday" }))
    expect(card.noteNeedsReview).toBe(true)
    expect(card.approval).toBe("pending")
    expect(getSession(sessionId)?.status).toBe("needs_confirmation")
    expect(approve(sessionId, { action: "approve", user: "Nurse A" }).card?.approval).toBe("approved")
  })

  it("re-answering into a different rule reopens an approved card", () => {
    const { sessionId } = invite("rise-01", "play")
    applyResult(sessionId, resultFor(ellen, sessionId))
    approve(sessionId, { action: "approve", user: "Nurse A" })
    const noRedFlag = { ...ellen.scripted_today.symptoms, short_of_breath_or_chest_pain: false }
    const card = applyResult(sessionId, resultFor(ellen, sessionId, { symptoms: noRedFlag }))
    expect(card).toMatchObject({ recommendation: "escalate_urgent", ruleFired: "decline", approval: "pending" })
  })

  it("Reset demo clears every session", () => {
    invite("rise-01", "play")
    resetSessions()
    expect(listSessions()).toHaveLength(0)
  })
})

describe("human decision boundary", () => {
  function escalated() {
    const { sessionId } = invite("rise-01", "play")
    applyResult(sessionId, resultFor(ellen, sessionId))
    return sessionId
  }

  it("nothing is approved until a person acts, and approval is recorded once", () => {
    const id = escalated()
    expect(getSession(id)?.card?.approval).toBe("pending")
    const s = approve(id, { action: "approve", user: "Nurse A" }, 5000)
    expect(s.card?.approval).toBe("approved")
    expect(s.audit.at(-1)).toMatchObject({ action: "approved", from: "escalate_urgent", user: "Nurse A", at: 5000 })
    expect(() => approve(id, { action: "approve", user: "Nurse B" })).toThrow(/already decided/)
  })

  it("cannot approve before a card exists", () => {
    const { sessionId } = invite("rise-01", "play")
    expect(() => approve(sessionId, { action: "approve", user: "Nurse A" })).toThrow(/no triage card/)
  })

  it("downgrade needs a known reason, lowers severity, and keeps the rules' recommendation for provenance", () => {
    const id = escalated()
    expect(() => approve(id, { action: "downgrade", to: "nurse_callback", reasonCode: "made_up", user: "A" })).toThrow(/reason/)
    expect(() => approve(id, { action: "downgrade", to: "nurse_callback", reasonCode: "other", user: "A" })).toThrow(/needs a note/)
    expect(() => approve(id, { action: "downgrade", to: "escalate_urgent", reasonCode: "known_finding", user: "A" })).toThrow(/lower/)
    const s = approve(id, { action: "downgrade", to: "nurse_callback", reasonCode: "spoke_with_patient", user: "Nurse A" })
    expect(s.card?.recommendation).toBe("escalate_urgent")
    expect(s.card?.approval).toBe("downgraded")
    expect(finalRecommendation(s)).toBe("nurse_callback")
  })

  it("the audit log never copies patient answers or notes", () => {
    const { sessionId } = invite("rise-04", "classic")
    applyResult(sessionId, resultFor(gary, sessionId, { patientNote: "private words" }))
    const s = approve(sessionId, { action: "approve", user: "Nurse A" })
    expect(JSON.stringify(s.audit)).not.toMatch(/private words|pain_0_10/)
  })
})

describe("RehabNinja sets (play_set)", () => {
  it("skip the count-based decline but keep new arm use", () => {
    const fewer = scriptedResult(gary, { protocol: "play_set", rawStands: 3, steadiScore: 3 })
    expect(triage(fewer, lastCheckIn(gary), 14).recommendation).toBe("continue_plan")
    const arms = scriptedResult(gary, { protocol: "play_set", rawStands: 6, armsUsed: true, armsFromRep: 2, steadiScore: 0 })
    expect(triage(arms, lastCheckIn(gary), 14)).toMatchObject({ recommendation: "escalate_urgent", ruleFired: "decline" })
  })

  it("never get a CDC cutoff on the card", () => {
    const sessionId = "rise-04-playset1"
    const card = applyResult(sessionId, resultFor(gary, sessionId, { protocol: "play_set" }))
    expect(card.metrics.cdcCutoff).toBeNull()
    expect(card.warnings.join(" ")).toMatch(/not the CDC 30-second test/)
  })
})

describe("note phrase screen", () => {
  it("matches whole phrases only", () => {
    expect(noteNeedsReview("Some chest pain this morning")).toBe(true)
    expect(noteNeedsReview("I can't breathe well")).toBe(true)
    expect(noteNeedsReview("Fallout from the weather, knees stiff")).toBe(false)
    expect(noteNeedsReview(undefined)).toBe(false)
  })
})
