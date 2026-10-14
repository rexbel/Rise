import { beforeEach, describe, expect, it } from "vitest"
import { patients, scriptedResult } from "../lib/seed"
import { applyEvent, applyResult, getSession, invite, listSessions, resetSessions, resolveInvite, SessionError } from "../lib/sessions"

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

  it("a camera failure the patient reports is a real attempt on the board, audited, never demo", () => {
    const { sessionId, path } = invite("rise-01", "play", "Nurse A", 1000, false)
    const s = applyEvent(sessionId, { type: "could_not_complete", sessionId, reason: "camera", at: 1 }, 5000, tokenOf(path))
    expect(s).toMatchObject({ status: "could_not_complete", couldNotComplete: { reason: "camera", at: 5000 }, demoData: false })
    expect(s.audit.at(-1)).toMatchObject({ action: "could_not_complete", reasonCode: "camera", user: "Patient phone" })
  })
})
