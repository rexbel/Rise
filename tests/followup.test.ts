import { beforeEach, describe, expect, it } from "vitest"
import { exportCrew, importCrew, joinCrew } from "../lib/crew"
import { CREW_CONSENT_VERSION } from "../lib/types"
import { patients, scriptedResult } from "../lib/seed"
import { standingNextCheckIn } from "../lib/schedule"
import {
  applyResult,
  listSessions,
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
  it("an approved escalation opens a follow-up and holds the next check-in until the call is recorded", () => {
    const { sessionId, card } = decided(ellen)
    expect(card.recommendation).toBe("escalate_urgent")
    const s = getSession(sessionId)!
    expect(s.followUp).toMatchObject({ status: "open", recommendation: "escalate_urgent", route: "surgeon_on_call", attempts: 0, awaitingClearance: false })
    // No date for the patient before anyone has called them.
    expect(s.nextCheckIn).toMatchObject({ inDays: null, dueOn: null, paused: true, reason: "Waiting for the follow-up call" })
    expect(patientNextCheckIn("rise-01")).toMatchObject({ paused: true })
    expect(s.audit.map((a) => a.action)).toEqual(["invited", "approved", "followup_opened"])
  })

  it("not reached keeps it open and counts the attempt; reached closes it and only then sets a date", () => {
    const { sessionId } = decided(ellen)
    recordFollowUp(sessionId, { outcome: "not_reached", user: "Nurse A" }, T0 + 2000)
    expect(getSession(sessionId)!.followUp).toMatchObject({ status: "open", attempts: 1, lastAttemptAt: T0 + 2000 })
    expect(getSession(sessionId)!.nextCheckIn?.paused).toBe(true)

    const s = recordFollowUp(sessionId, { outcome: "reached_visit_booked", note: "Seen tomorrow 9am", user: "Nurse B" }, T0 + DAY)
    expect(s.followUp).toMatchObject({ status: "done", outcome: "reached_visit_booked", note: "Seen tomorrow 9am", closedBy: "Nurse B", attempts: 1 })
    expect(s.nextCheckIn).toMatchObject({ inDays: 1, dueOn: new Date(2026, 9, 16).getTime(), paused: false })
    // Never claims a clearance that wasn't recorded.
    expect(s.nextCheckIn?.reason).toBe("Recheck after the follow-up: Reached: visit booked")
    expect(s.audit.at(-1)).toMatchObject({ action: "followup_closed", reasonCode: "reached_visit_booked", user: "Nurse B" })
  })

  it("sent for urgent care stays on Today, paused, until a clinician clears the patient", () => {
    const { sessionId } = decided(ellen)
    let s = recordFollowUp(sessionId, { outcome: "reached_urgent_care", user: "Nurse A" }, T0 + 2000)
    expect(s.followUp).toMatchObject({ status: "open", awaitingClearance: true })
    expect(s.nextCheckIn).toMatchObject({ paused: true, reason: "Paused until a clinician clears the patient" })
    expect(() => recordFollowUp(sessionId, { outcome: "reached_plan_continues", user: "N" })).toThrow(/clinician to clear/)

    s = recordFollowUp(sessionId, { outcome: "clinician_cleared", user: "Dr C" }, T0 + 2 * DAY)
    expect(s.followUp).toMatchObject({ status: "done", outcome: "clinician_cleared", awaitingClearance: false })
    expect(s.nextCheckIn).toMatchObject({ inDays: 1, paused: false, reason: "Recheck the day after the clinician clears the patient" })
  })

  it("clearance is only offered once a patient is waiting for it; unknown outcomes and a bare Other are rejected", () => {
    const { sessionId } = decided(ellen)
    expect(() => recordFollowUp(sessionId, { outcome: "clinician_cleared", user: "N" })).toThrow(/only after/)
    expect(() => recordFollowUp(sessionId, { outcome: "nope", user: "N" })).toThrow(SessionError)
    expect(() => recordFollowUp(sessionId, { outcome: "other", user: "N" })).toThrow(/needs a note/)
    recordFollowUp(sessionId, { outcome: "reached_plan_continues", user: "N" })
    expect(() => recordFollowUp(sessionId, { outcome: "reached_plan_continues", user: "N" })).toThrow(/no open follow-up/)
  })

  it("a card reopened by new patient input must be decided again before the follow-up is recorded", () => {
    const { sessionId } = decided(ellen)
    applyResult(sessionId, scriptedResult(ellen, { sessionId, symptoms: { ...ellen.scripted_today.symptoms, pain_0_10: 9 } }), T0 + 5000)
    expect(getSession(sessionId)!.card?.approval).toBe("pending")
    expect(() => recordFollowUp(sessionId, { outcome: "reached_plan_continues", user: "N" })).toThrow(/decide it first/)
  })

  it("a downgrade to nurse callback opens a callback follow-up; continue the plan opens none and schedules", () => {
    const callback = decided(ellen, { to: "nurse_callback" })
    expect(getSession(callback.sessionId)!.followUp).toMatchObject({ status: "open", recommendation: "nurse_callback" })
    expect(getSession(callback.sessionId)!.nextCheckIn?.paused).toBe(true)

    const plan = decided(gary)
    expect(getSession(plan.sessionId)!.followUp).toBeUndefined()
    expect(getSession(plan.sessionId)!.nextCheckIn).toMatchObject({ inDays: gary.cadence.next_checkin_in_days, source: "session" })
  })

  it("the patient's next check-in falls back to the seed before any decision", () => {
    expect(patientNextCheckIn("rise-04")).toMatchObject({ inDays: gary.cadence.next_checkin_in_days, source: "seed", paused: false })
    expect(patientNextCheckIn("nobody")).toBeNull()
  })

  it("a pause stands over a newer invite or a later routine decision, until it is cleared", () => {
    const { sessionId } = decided(ellen)
    recordFollowUp(sessionId, { outcome: "reached_urgent_care", user: "Nurse A" }, T0 + 2000)
    invite("rise-01", "play", "Nurse A", T0 + 3000)
    expect(patientNextCheckIn("rise-01")).toMatchObject({ paused: true })
    // The console patient list uses the same rule.
    expect(standingNextCheckIn(listSessions(), "rise-01")).toEqual(patientNextCheckIn("rise-01"))
  })

  it("open follow-ups are kept when the store is full", () => {
    const { sessionId } = decided(ellen)
    for (let i = 0; i < 105; i++) invite("rise-04", "play", "N", T0 + 10_000 + i)
    expect(getSession(sessionId)?.followUp?.status).toBe("open")
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
