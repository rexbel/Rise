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

// Writes to an invited session need its invite token (lib/sessions checkInviteToken). These wrappers remember the
// token each invite() returned and pass it on, so tests read like the phone: invite, then report with the link.
const __tokens = new Map<string, string>()
function inv(riseId: string, surface: Parameters<typeof invite>[1], user?: string, now?: number, demo = true) {
  // Scripted seed results are demo data, so test invites are demo invites unless a test says otherwise.
  const r = invite(riseId, surface, user, now, demo)
  __tokens.set(r.sessionId, new URL(r.path, "https://x").searchParams.get("i")!)
  return r
}
const res = (id: string, r: Parameters<typeof applyResult>[1], now?: number) => applyResult(id, r, now, __tokens.get(id))
const ev = (id: string, e: Parameters<typeof applyEvent>[1], now?: number) => applyEvent(id, e, now, __tokens.get(id))


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
    const { sessionId, path, sms } = inv("rise-01", "play", "Nurse A", 1000)
    // The link carries the unguessable invite token, never the session id.
    expect(path).toMatch(/^\/play\/rise-01\?i=[A-Za-z0-9_-]{32}$/)
    expect(path).not.toContain(sessionId)
    expect(sms).toEqual({ sent: false, demoData: true })

    ev(sessionId, { type: "status", sessionId, status: "testing", tier: "mediapipe", at: 1 }, 2000)
    ev(sessionId, { type: "rep", sessionId, count: 2, armsUsed: true, at: 2 }, 3000)
    expect(getSession(sessionId)).toMatchObject({ status: "testing", count: 2, armsUsed: true, tier: "mediapipe" })

    const card = res(sessionId, resultFor(ellen, sessionId), 4000)
    expect(card).toMatchObject({ recommendation: "escalate_urgent", route: "surgeon_on_call", ruleFired: "red_flag", approval: "pending" })
    expect(getSession(sessionId)?.status).toBe("ready")
    expect(seen.filter((m) => m.type === "session")).toHaveLength(4)
    off()
  })

  it("matches expected_triage for every seed patient through the server path", () => {
    for (const p of patients) {
      const sessionId = `${p.rise_id}-seedcheck`
      const card = res(sessionId, resultFor(p, sessionId))
      expect(card.recommendation, p.rise_id).toBe(p.expected_triage.recommendation)
    }
  })

  it("accepts a phone that opened a link without an invite, but not an unknown patient", () => {
    ev("rise-02-abcd1234", { type: "status", sessionId: "rise-02-abcd1234", status: "setting_up", at: 1 })
    expect(getSession("rise-02-abcd1234")?.riseId).toBe("rise-02")
    expect(() => ev("rise-99-abcd1234", { type: "resume", sessionId: "rise-99-abcd1234", at: 1 })).toThrow(SessionError)
    expect(riseIdOf("../etc-passwd")).toBeNull()
  })

  it("rejects a result whose ids don't match the URL", () => {
    const { sessionId } = inv("rise-01", "classic")
    expect(() => res(sessionId, resultFor(ellen, "rise-01-other0000"))).toThrow(/mismatch/)
    expect(() => res(sessionId, resultFor(gary, sessionId))).toThrow(/does not match/)
  })

  it("late phone events never move a finished card backwards", () => {
    const { sessionId } = inv("rise-04", "classic")
    res(sessionId, resultFor(gary, sessionId))
    ev(sessionId, { type: "status", sessionId, status: "testing", at: 9 })
    expect(getSession(sessionId)?.status).toBe("ready")
  })

  it("posting the result again with a plain note keeps a human decision", () => {
    const { sessionId } = inv("rise-04", "classic")
    res(sessionId, resultFor(gary, sessionId))
    approve(sessionId, { action: "approve", user: "Nurse A" })
    const card = res(sessionId, resultFor(gary, sessionId, { patientNote: "Knees a bit stiff today" }))
    expect(card.approval).toBe("approved")
    expect(card.patientNote).toBe("Knees a bit stiff today")
  })

  it("a newly flagged note reopens an approved card", () => {
    const { sessionId } = inv("rise-04", "classic")
    res(sessionId, resultFor(gary, sessionId))
    approve(sessionId, { action: "approve", user: "Nurse A" })
    const card = res(sessionId, resultFor(gary, sessionId, { patientNote: "I had a fall yesterday" }))
    expect(card.noteNeedsReview).toBe(true)
    expect(card.approval).toBe("pending")
    expect(getSession(sessionId)?.status).toBe("needs_confirmation")
    expect(approve(sessionId, { action: "approve", user: "Nurse A" }).card?.approval).toBe("approved")
  })

  it("any change beyond the note reopens an approved card, even at the same recommendation", () => {
    const { sessionId } = inv("rise-04", "classic")
    res(sessionId, resultFor(gary, sessionId))
    approve(sessionId, { action: "approve", user: "Nurse A" })
    const card = res(sessionId, resultFor(gary, sessionId, { symptoms: { ...gary.scripted_today.symptoms, pain_0_10: 7 } }))
    expect(card.recommendation).toBe("continue_plan")
    expect(card.approval).toBe("pending")
    expect(card.warnings[0]).toMatch(/^Answers changed after the first report\. Earlier: continue_plan/)
  })

  it("a milder re-post never quietly replaces an escalation", () => {
    const { sessionId } = inv("rise-01", "play")
    res(sessionId, resultFor(ellen, sessionId))
    approve(sessionId, { action: "approve", user: "Nurse A" })
    const benign = resultFor(gary, sessionId, { riseId: "rise-01" })
    const card = res(sessionId, benign)
    expect(card.approval).toBe("pending")
    expect(card.warnings.join(" ")).toMatch(/Earlier: escalate_urgent \(rule red_flag\)/)
    expect(getSession(sessionId)?.audit.map((a) => a.action)).toEqual(["invited", "approved", "followup_opened", "red_flag_retracted", "reopened"])
  })

  it("re-answering into a different rule reopens an approved card", () => {
    const { sessionId } = inv("rise-01", "play")
    res(sessionId, resultFor(ellen, sessionId))
    approve(sessionId, { action: "approve", user: "Nurse A" })
    const noRedFlag = { ...ellen.scripted_today.symptoms, short_of_breath_or_chest_pain: false }
    const card = res(sessionId, resultFor(ellen, sessionId, { symptoms: noRedFlag }))
    expect(card).toMatchObject({ recommendation: "escalate_urgent", ruleFired: "decline", approval: "pending" })
  })

  it("with a console key set, only invited sessions reach the board", () => {
    process.env.CONSOLE_KEY = "test-key"
    try {
      expect(() => ev("rise-02-abcd1234", { type: "resume", sessionId: "rise-02-abcd1234", at: 1 })).toThrow(/unknown session/)
      const { sessionId } = inv("rise-02", "play")
      expect(ev(sessionId, { type: "resume", sessionId, at: 1 }).status).toBe("testing")
    } finally {
      delete process.env.CONSOLE_KEY
    }
  })

  it("evicts decided sessions before cards still waiting for a person", () => {
    const waiting = inv("rise-01", "play", "A", 1).sessionId
    res(waiting, resultFor(ellen, waiting), 2)
    for (let i = 0; i < 100; i++) inv("rise-04", "classic", "A", 10 + i)
    expect(getSession(waiting)?.card?.approval).toBe("pending")
    expect(listSessions()).toHaveLength(100)
  })

  it("Reset demo clears every session", () => {
    inv("rise-01", "play")
    resetSessions()
    expect(listSessions()).toHaveLength(0)
  })
})

describe("human decision boundary", () => {
  function escalated() {
    const { sessionId } = inv("rise-01", "play")
    res(sessionId, resultFor(ellen, sessionId))
    return sessionId
  }

  it("nothing is approved until a person acts, and approval is recorded once", () => {
    const id = escalated()
    expect(getSession(id)?.card?.approval).toBe("pending")
    const s = approve(id, { action: "approve", user: "Nurse A" }, 5000)
    expect(s.card?.approval).toBe("approved")
    // The approval, then the follow-up it opens (close-the-loop).
    expect(s.audit.at(-2)).toMatchObject({ action: "approved", from: "escalate_urgent", user: "Nurse A", at: 5000 })
    expect(s.audit.at(-1)).toMatchObject({ action: "followup_opened", to: "escalate_urgent" })
    expect(() => approve(id, { action: "approve", user: "Nurse B" })).toThrow(/already decided/)
  })

  it("cannot approve before a card exists", () => {
    const { sessionId } = inv("rise-01", "play")
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
    const { sessionId } = inv("rise-04", "classic")
    res(sessionId, resultFor(gary, sessionId, { patientNote: "private words" }))
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
    const card = res(sessionId, resultFor(gary, sessionId, { protocol: "play_set" }))
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

describe("review fixes", () => {
  const noRedFlag = { ...ellen.scripted_today.symptoms, short_of_breath_or_chest_pain: false }

  it("seed patients match expected route and rule through the server path too", () => {
    for (const p of patients) {
      const card = res(`${p.rise_id}-routecheck`, resultFor(p, `${p.rise_id}-routecheck`))
      expect(card.route, p.rise_id).toBe(p.expected_triage.route)
    }
  })

  it("a retracted red flag stays on the record: audit entry plus a warning on every later card", () => {
    const { sessionId } = inv("rise-01", "play")
    res(sessionId, resultFor(ellen, sessionId))
    const card = res(sessionId, resultFor(ellen, sessionId, { symptoms: noRedFlag }))
    expect(card.ruleFired).toBe("decline")
    expect(card.warnings[0]).toMatch(/^Red flag retracted: .*911/)
    expect(getSession(sessionId)?.audit.map((a) => a.action)).toContain("red_flag_retracted")
    const later = res(sessionId, resultFor(ellen, sessionId, { symptoms: noRedFlag, patientNote: "ok now" }))
    expect(later.warnings.some((w) => w.startsWith("Red flag retracted"))).toBe(true)
  })

  it("an old downgrade never stands for a card that new input reopened", () => {
    const judith = patients.find((p) => p.rise_id === "rise-02")!
    const { sessionId } = inv("rise-02", "play")
    res(sessionId, resultFor(judith, sessionId))
    approve(sessionId, { action: "downgrade", to: "nurse_callback", reasonCode: "spoke_with_patient", user: "A" })
    res(sessionId, resultFor(judith, sessionId, { symptoms: { ...judith.scripted_today.symptoms, short_of_breath_or_chest_pain: true } }))
    const s = getSession(sessionId)!
    expect(s.card?.approval).toBe("pending")
    expect(finalRecommendation(s)).toBe("escalate_urgent")
    expect(s.audit.map((a) => a.action)).toEqual(["invited", "downgraded", "followup_opened", "reopened"])
  })

  it("a decision made on an older card version is refused", () => {
    const { sessionId } = inv("rise-01", "play")
    res(sessionId, resultFor(ellen, sessionId))
    res(sessionId, resultFor(ellen, sessionId, { symptoms: noRedFlag }))
    expect(() => approve(sessionId, { action: "approve", user: "A", expectRecommendation: "escalate_urgent", expectRule: "red_flag" })).toThrow(/card changed/)
    expect(approve(sessionId, { action: "approve", user: "A", expectRecommendation: "escalate_urgent", expectRule: "decline" }).card?.approval).toBe("approved")
  })

  it("downgrades must be strictly lower (confirm -> nurse callback is refused)", () => {
    const sessionId = "rise-04-confirm01"
    res(sessionId, resultFor(gary, sessionId, { stoppedEarly: true }))
    expect(() => approve(sessionId, { action: "downgrade", to: "nurse_callback", reasonCode: "known_finding", user: "A" })).toThrow(/lower/)
  })

  it("re-answering without the note keeps the note the patient already sent", () => {
    const { sessionId } = inv("rise-04", "classic")
    res(sessionId, resultFor(gary, sessionId, { patientNote: "I had a fall" }))
    const card = res(sessionId, resultFor(gary, sessionId))
    expect(card.patientNote).toBe("I had a fall")
    expect(card.noteNeedsReview).toBe(true)
  })

  it("the live count never goes down within an attempt", () => {
    const { sessionId } = inv("rise-01", "play")
    ev(sessionId, { type: "rep", sessionId, count: 3, armsUsed: false, at: 1 })
    ev(sessionId, { type: "rep", sessionId, count: 2, armsUsed: false, at: 2 })
    expect(getSession(sessionId)?.count).toBe(3)
  })

  it("a replayed demo set starts fresh; a red-flag demo or a real session's card is never cleared by the phone", () => {
    const demo = inv("rise-04", "play").sessionId
    res(demo, resultFor(gary, demo))
    ev(demo, { type: "status", sessionId: demo, status: "setting_up", at: 1 })
    expect(getSession(demo)).toMatchObject({ status: "setting_up", count: 0 })
    expect(getSession(demo)?.card).toBeUndefined()
    expect(getSession(demo)?.audit.at(-1)?.action).toBe("restarted")

    // Ellen's red flag keeps her off her crew: a replay must not clear it; only a person does.
    const flagged = inv("rise-01", "play").sessionId
    res(flagged, resultFor(ellen, flagged))
    ev(flagged, { type: "status", sessionId: flagged, status: "setting_up", at: 1 })
    expect(getSession(flagged)?.card?.ruleFired).toBe("red_flag")

    const real = inv("rise-04", "classic").sessionId
    res(real, resultFor(gary, real, { demoData: false, scripted: [] }))
    ev(real, { type: "status", sessionId: real, status: "setting_up", at: 1 })
    expect(getSession(real)?.card?.recommendation).toBe("continue_plan")
  })

  it("stopped early still lists the signals it outranks, without changing routing", () => {
    const judith = patients.find((p) => p.rise_id === "rise-02")!
    const d = triage(scriptedResult(judith, { stoppedEarly: true }), lastCheckIn(judith), 7)
    expect(d).toMatchObject({ recommendation: "human_confirm", route: "care_coordinator", ruleFired: "stopped_early" })
    expect(d.reasons).toContain("Also present: new calf pain or swelling")
  })

  it("live sessions say the non-surgical check was not evaluated; scripted fields are named", () => {
    const live = res("rise-04-livecheck", resultFor(gary, "rise-04-livecheck", { demoData: false, scripted: [] }))
    expect(live.warnings.join(" ")).toMatch(/Non-surgical check not evaluated/)
    const demo = res("rise-04-democheck", resultFor(gary, "rise-04-democheck"))
    expect(demo.scripted).toEqual(["new_incontinence", "gait", "tandem"])
    expect(demo.warnings.join(" ")).toMatch(/Scripted, not measured/)
  })
})

describe("note phrase screen on phone keyboards", () => {
  it("handles curly apostrophes, line breaks and common word forms", () => {
    expect(noteNeedsReview("I can’t breathe")).toBe(true)
    expect(noteNeedsReview("short of\nbreath since lunch")).toBe(true)
    expect(noteNeedsReview("I’ve fallen twice")).toBe(true)
    expect(noteNeedsReview("kept fainting")).toBe(true)
  })
})
