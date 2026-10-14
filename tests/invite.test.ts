import { beforeEach, describe, expect, it } from "vitest"
import { patients, scriptedResult } from "../lib/seed"
import { applyEvent, applyResult, getSession, invite, listSessions, recordFollowUp, resetSessions, resolveInvite, SessionError } from "../lib/sessions"

const ellen = patients.find((p) => p.rise_id === "rise-01")!
const tokenOf = (path: string) => new URL(path, "https://x").searchParams.get("i")!

/** A real (non-demo) result: the patient's own camera, not a replay. */
const realResult = (sessionId: string) => ({ ...scriptedResult(ellen, { sessionId }), demoData: false, tier: "mediapipe" as const })

beforeEach(() => resetSessions())

describe("invite links (plan A)", () => {
  it("the link carries an unguessable token that resolves only for its patient; the board keeps only a hash", () => {
    const { sessionId, path } = invite("rise-01", "classic", "Nurse A", 1000, false)
    const token = tokenOf(path)
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(resolveInvite("rise-01", token)).toEqual({ sessionId, token, demo: false, surface: "classic" })
    expect(resolveInvite("rise-02", token)).toBeNull()
    expect(resolveInvite("rise-01", "x".repeat(32))).toBeNull()
    expect(resolveInvite("rise-01", undefined)).toBeNull()
    expect(JSON.stringify(listSessions())).not.toContain(token)
    expect(getSession(sessionId)).toMatchObject({ inviteDemo: false, inviteTokenHash: expect.stringMatching(/^[0-9a-f]{64}$/) })
  })

  it("writes to an invited session need the token; knowing the session id is not enough", () => {
    const { sessionId, path } = invite("rise-01", "classic", "Nurse A", 1000, false)
    const e = { type: "status" as const, sessionId, status: "setting_up" as const, at: 1 }
    expect(() => applyEvent(sessionId, e, 2000)).toThrow(SessionError)
    expect(() => applyEvent(sessionId, e, 2000, "wrong-token-wrong-token-wrong-to")).toThrow(/not valid/)
    expect(() => applyResult(sessionId, realResult(sessionId), 3000)).toThrow(/not valid/)
    expect(applyEvent(sessionId, e, 2000, tokenOf(path)).status).toBe("setting_up")
  })

  it("an unlinked visit (no invite) still reports without a token, labeled as before", () => {
    const sessionId = "rise-01-unlinked01"
    expect(applyEvent(sessionId, { type: "status", sessionId, status: "testing", at: 1 }, 1000).inviteDemo).toBeNull()
  })

  it("a real invite refuses a demo result and a skipped safety setup; a demo invite allows both", () => {
    const real = invite("rise-01", "classic", "Nurse A", 1000, false)
    const t = tokenOf(real.path)
    expect(() => applyResult(real.sessionId, scriptedResult(ellen, { sessionId: real.sessionId }), 2000, t)).toThrow(/own camera only/)
    expect(() => applyEvent(real.sessionId, { type: "setup_skipped", sessionId: real.sessionId, at: 1 }, 2000, t)).toThrow(/can't be skipped/)
    expect(applyResult(real.sessionId, realResult(real.sessionId), 3000, t).demoData).toBe(false)

    const demo = invite("rise-01", "classic", "Nurse A", 1000, true)
    const d = tokenOf(demo.path)
    expect(applyEvent(demo.sessionId, { type: "setup_skipped", sessionId: demo.sessionId, at: 1 }, 2000, d).setup?.skipped).toBe(true)
    expect(applyResult(demo.sessionId, scriptedResult(ellen, { sessionId: demo.sessionId }), 3000, d).demoData).toBe(true)
  })
})

describe("safety confirmations and couldn't-complete (plan A)", () => {
  it("records each confirmation once, in order", () => {
    const { sessionId, path } = invite("rise-01", "classic", "Nurse A", 1000, false)
    const t = tokenOf(path)
    for (const check of ["chair", "helper", "chair", "phone"] as const) applyEvent(sessionId, { type: "setup_confirmed", sessionId, check, at: 1 }, 2000, t)
    expect(getSession(sessionId)?.setup).toEqual({ confirmed: ["chair", "helper", "phone"], skipped: false, at: 2000 })
  })

  it("a camera failure the patient reports is a real attempt, audited, owned on Today, never demo", () => {
    const { sessionId, path } = invite("rise-01", "play", "Nurse A", 1000, false)
    const t = tokenOf(path)
    const s = applyEvent(sessionId, { type: "could_not_complete", sessionId, reason: "camera", at: 1 }, 5000, t)
    expect(s).toMatchObject({ status: "could_not_complete", couldNotComplete: { reason: "camera", at: 5000 }, demoData: false })
    expect(s.followUp).toMatchObject({ status: "open", kind: "could_not_complete", recommendation: "nurse_callback" })
    expect(s.nextCheckIn).toMatchObject({ paused: true })
    expect(s.audit.map((a) => a.action).slice(-2)).toEqual(["could_not_complete", "followup_opened"])
    // A retried report (the phone retries until acknowledged) isn't audited twice.
    applyEvent(sessionId, { type: "could_not_complete", sessionId, reason: "camera", at: 2 }, 6000, t)
    expect(getSession(sessionId)!.audit.filter((x) => x.action === "could_not_complete")).toHaveLength(1)
  })

  it("stray events can't hide it; a new attempt clears the banner, and a second failure is recorded again", () => {
    const { sessionId, path } = invite("rise-01", "play", "Nurse A", 1000, false)
    const t = tokenOf(path)
    applyEvent(sessionId, { type: "could_not_complete", sessionId, reason: "camera", at: 1 }, 5000, t)
    applyEvent(sessionId, { type: "stop", sessionId, reason: "button", at: 2 }, 5100, t)
    applyEvent(sessionId, { type: "status", sessionId, status: "testing", at: 3 }, 5200, t)
    expect(getSession(sessionId)!.status).toBe("could_not_complete")

    applyEvent(sessionId, { type: "status", sessionId, status: "setting_up", at: 4 }, 6000, t)
    expect(getSession(sessionId)).toMatchObject({ status: "setting_up", couldNotComplete: undefined })
    applyEvent(sessionId, { type: "could_not_complete", sessionId, reason: "camera", at: 5 }, 7000, t)
    const s = getSession(sessionId)!
    expect(s).toMatchObject({ status: "could_not_complete", couldNotComplete: { at: 7000 } })
    expect(s.audit.filter((x) => x.action === "could_not_complete")).toHaveLength(2)
    // Still one open follow-up for the session.
    expect(s.audit.filter((x) => x.action === "followup_opened")).toHaveLength(1)
  })

  it("is refused once a result exists, and for demo or unlinked sessions", () => {
    const real = invite("rise-01", "classic", "Nurse A", 1000, false)
    const t = tokenOf(real.path)
    applyResult(real.sessionId, realResult(real.sessionId), 2000, t)
    expect(() => applyEvent(real.sessionId, { type: "could_not_complete", sessionId: real.sessionId, reason: "camera", at: 1 }, 3000, t)).toThrow(/already has a result/)
    const demo = invite("rise-01", "classic", "Nurse A", 1000, true)
    expect(() => applyEvent(demo.sessionId, { type: "could_not_complete", sessionId: demo.sessionId, reason: "camera", at: 1 }, 3000, tokenOf(demo.path))).toThrow(/only a real/)
    const id = "rise-01-unlinked02"
    expect(() => applyEvent(id, { type: "could_not_complete", sessionId: id, reason: "camera", at: 1 }, 3000)).toThrow(/only a real/)
  })

  it("the couldn't-complete follow-up closes without a card and sets the next check-in", () => {
    const { sessionId, path } = invite("rise-03", "classic", "Nurse A", 1000, false)
    applyEvent(sessionId, { type: "could_not_complete", sessionId, reason: "tracker", at: 1 }, 5000, tokenOf(path))
    const s = recordFollowUp(sessionId, { outcome: "reached_plan_continues", user: "Nurse A" }, 6000)
    expect(s.followUp).toMatchObject({ status: "done", outcome: "reached_plan_continues" })
    expect(s.nextCheckIn).toMatchObject({ paused: false, source: "session" })
  })
})

describe("store limits can't reopen an invite (plan A)", () => {
  it("unlinked posts are evicted before invites, and an evicted invite's id can't be written without its token", () => {
    const { sessionId } = invite("rise-01", "classic", "Nurse A", 1000, false)
    for (let i = 0; i < 120; i++) {
      const id = `rise-02-flood${i.toString().padStart(4, "0")}`
      applyEvent(id, { type: "status", sessionId: id, status: "testing", at: i }, 2000 + i)
    }
    expect(getSession(sessionId)).toBeDefined()
    // Fill with invites only, so the oldest invite is evicted, then try its id with no token.
    for (let i = 0; i < 120; i++) invite("rise-04", "play", "N", 3000 + i, false)
    expect(getSession(sessionId)).toBeUndefined()
    expect(() => applyEvent(sessionId, { type: "status", sessionId, status: "testing", at: 1 }, 9000)).toThrow(/not valid/)
  })

})
