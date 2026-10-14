import { beforeEach, describe, expect, it } from "vitest"
import { exportCrew, importCrew, joinCrew } from "../lib/crew"
import { CREW_CONSENT_VERSION } from "../lib/types"
import { patients, scriptedResult } from "../lib/seed"
import {
  applyResult,
  approve,
  exportSessions,
  getSession,
  importSessions,
  invite,
  patientNextCheckIn,
  recordFollowUp,
  resetSessions,
  SessionError,
} from "../lib/sessions"

const ellen = patients.find((p) => p.rise_id === "rise-01")!
const gary = patients.find((p) => p.rise_id === "rise-04")!
const DAY = 24 * 60 * 60 * 1000
const T0 = new Date(2026, 9, 14, 9, 0).getTime()

/** A decided card for a seed patient's scripted session. */
function decided(p: typeof ellen, how: "approve" | { to: "nurse_callback" | "continue_plan" } = "approve") {
  const { sessionId } = invite(p.rise_id, "classic", "Nurse A", T0)
  const card = applyResult(sessionId, scriptedResult(p, { sessionId }), T0)
  if (how === "approve") approve(sessionId, { action: "approve", user: "Nurse A" }, T0 + 1000)
  else approve(sessionId, { action: "downgrade", to: how.to, reasonCode: "spoke_with_patient", user: "Nurse A" }, T0 + 1000)
  return { sessionId, card }
}

beforeEach(() => resetSessions())

describe("follow-up after a decision", () => {
  it("an approved escalation opens a follow-up and schedules a recheck the next day", () => {
    const { sessionId, card } = decided(ellen)
    expect(card.recommendation).toBe("escalate_urgent")
    const s = getSession(sessionId)!
    expect(s.followUp).toMatchObject({ status: "open", recommendation: "escalate_urgent", route: "surgeon_on_call", attempts: 0 })
    expect(s.nextCheckIn).toMatchObject({ inDays: 1, paused: false, source: "session" })
    expect(s.nextCheckIn!.dueOn).toBe(new Date(2026, 9, 15).getTime())
    expect(s.audit.map((a) => a.action)).toEqual(["invited", "approved", "followup_opened"])
  })

  it("not reached keeps it open and counts the attempt; a closing outcome ends it and sets the next check-in", () => {
    const { sessionId } = decided(ellen)
    recordFollowUp(sessionId, { outcome: "not_reached", user: "Nurse A" }, T0 + 2000)
    expect(getSession(sessionId)!.followUp).toMatchObject({ status: "open", attempts: 1, lastAttemptAt: T0 + 2000 })

    const s = recordFollowUp(sessionId, { outcome: "reached_visit_booked", note: "Seen tomorrow 9am", user: "Nurse B" }, T0 + DAY)
    expect(s.followUp).toMatchObject({ status: "done", outcome: "reached_visit_booked", note: "Seen tomorrow 9am", closedBy: "Nurse B", attempts: 1 })
    expect(s.nextCheckIn).toMatchObject({ inDays: 1, dueOn: new Date(2026, 9, 16).getTime(), paused: false })
    expect(s.audit.at(-1)).toMatchObject({ action: "followup_closed", reasonCode: "reached_visit_booked", user: "Nurse B" })
  })

  it("sent for urgent care pauses the schedule until a clinician clears the patient", () => {
    const { sessionId } = decided(ellen)
    const s = recordFollowUp(sessionId, { outcome: "reached_urgent_care", user: "Nurse A" }, T0 + 2000)
    expect(s.nextCheckIn).toMatchObject({ inDays: null, dueOn: null, paused: true })
    expect(patientNextCheckIn("rise-01")).toMatchObject({ paused: true, source: "session" })
  })

  it("rejects unknown outcomes, a missing note on Other, and a second close", () => {
    const { sessionId } = decided(ellen)
    expect(() => recordFollowUp(sessionId, { outcome: "nope", user: "N" })).toThrow(SessionError)
    expect(() => recordFollowUp(sessionId, { outcome: "other", user: "N" })).toThrow(/needs a note/)
    recordFollowUp(sessionId, { outcome: "reached_plan_continues", user: "N" })
    expect(() => recordFollowUp(sessionId, { outcome: "reached_plan_continues", user: "N" })).toThrow(/no open follow-up/)
  })

  it("a downgrade to nurse callback opens a callback follow-up; continue the plan opens none but still schedules", () => {
    const callback = decided(ellen, { to: "nurse_callback" })
    expect(getSession(callback.sessionId)!.followUp).toMatchObject({ status: "open", recommendation: "nurse_callback" })
    expect(getSession(callback.sessionId)!.nextCheckIn?.inDays).toBe(2)

    const plan = decided(gary)
    expect(getSession(plan.sessionId)!.followUp).toBeUndefined()
    expect(getSession(plan.sessionId)!.nextCheckIn).toMatchObject({ inDays: gary.cadence.next_checkin_in_days, source: "session" })
  })

  it("the patient's next check-in falls back to the seed before any decision", () => {
    expect(patientNextCheckIn("rise-04")).toMatchObject({ inDays: gary.cadence.next_checkin_in_days, source: "seed", paused: false })
    expect(patientNextCheckIn("nobody")).toBeNull()
  })
})

describe("durable storage round trip", () => {
  it("sessions and crew survive export -> reset -> import", () => {
    const { sessionId } = decided(ellen)
    recordFollowUp(sessionId, { outcome: "not_reached", user: "Nurse A" }, T0 + 2000)
    joinCrew({ riseId: "rise-04", showPhoto: false, consentVersion: CREW_CONSENT_VERSION }, T0)
    const saved = JSON.parse(JSON.stringify({ sessions: exportSessions(), crew: exportCrew() }))

    resetSessions()
    expect(getSession(sessionId)).toBeUndefined()

    importCrew(saved.crew)
    importSessions(saved.sessions)
    expect(getSession(sessionId)!.followUp).toMatchObject({ status: "open", attempts: 1 })
    expect(exportCrew().members.map(([id]) => id)).toContain("rise-04")
  })
})
