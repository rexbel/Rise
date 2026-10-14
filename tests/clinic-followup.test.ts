import { describe, expect, it } from "vitest"
import {
  attemptsLabel,
  daysUntilDue,
  FOLLOWUP_OUTCOMES,
  followUpErrorMessage,
  followUpErrors,
  nextCheckInView,
  outcomeLabel,
  PAUSED_LABEL,
  seedNextCheckIn,
  todayWorklist,
} from "../components/clinic/followup"
import protocol from "../config/protocol.default.json"
import type { FollowUp, NextCheckIn, Recommendation, SessionSnapshot } from "../lib/types"

function session(id: string, followUp?: Partial<FollowUp> & { recommendation: Recommendation }): SessionSnapshot {
  return {
    sessionId: id,
    riseId: id.slice(0, 7),
    surface: "play",
    status: "ready",
    count: 0,
    armsUsed: false,
    tier: null,
    audit: [],
    crewPaused: false,
    invitedAt: 0,
    updatedAt: 0,
    demoData: true,
    followUp: followUp
      ? {
          status: "open",
          route: null,
          openedAt: 0,
          attempts: 0,
          lastAttemptAt: null,
          outcome: null,
          note: null,
          closedAt: null,
          closedBy: null,
          ...followUp,
        }
      : undefined,
  }
}

describe("Today worklist", () => {
  it("lists only open follow-ups: escalate, then confirm, then callback, oldest first within each", () => {
    const list = todayWorklist([
      session("rise-03-a", { recommendation: "nurse_callback", openedAt: 100 }),
      session("rise-02-a", { recommendation: "human_confirm", openedAt: 300 }),
      session("rise-01-b", { recommendation: "escalate_urgent", openedAt: 500 }),
      session("rise-01-a", { recommendation: "escalate_urgent", openedAt: 200 }),
      session("rise-05-a", { recommendation: "nurse_callback", openedAt: 50 }),
      session("rise-04-a", { recommendation: "escalate_urgent", openedAt: 1, status: "done" }),
      session("rise-06-a"),
    ])
    expect(list.map((s) => s.sessionId)).toEqual(["rise-01-a", "rise-01-b", "rise-02-a", "rise-05-a", "rise-03-a"])
  })

  it("is empty when nothing is open", () => {
    expect(todayWorklist([session("rise-06-a")])).toEqual([])
  })
})

describe("attempts", () => {
  it("says how many times the patient was not reached, in words", () => {
    expect(attemptsLabel(0)).toBeNull()
    expect(attemptsLabel(1)).toBe("Not reached once")
    expect(attemptsLabel(2)).toBe("Not reached twice")
    expect(attemptsLabel(3)).toBe("Not reached 3 times")
  })
})

describe("outcomes and the form", () => {
  it("uses the config labels and flags", () => {
    expect(FOLLOWUP_OUTCOMES.map((o) => o.code)).toEqual(protocol.followup.outcomes.map((o) => o.code))
    expect(outcomeLabel("not_reached")).toBe("Not reached: try again")
    expect(FOLLOWUP_OUTCOMES.find((o) => o.code === "other")?.requiresFreeText).toBe(true)
    expect(FOLLOWUP_OUTCOMES.find((o) => o.code === "reached_urgent_care")?.pausesSchedule).toBe(true)
    expect(outcomeLabel("made_up_code")).toBe("made up code")
  })

  it("asks for an outcome, and for a note only when the outcome needs one", () => {
    expect(followUpErrors("", "").outcome).toBeTruthy()
    expect(followUpErrors("reached_plan_continues", "")).toEqual({})
    expect(followUpErrors("other", "  ").note).toBeTruthy()
    expect(followUpErrors("other", "Daughter answered; will call back")).toEqual({})
  })

  it("explains a 409 as a follow-up that is no longer open", () => {
    expect(followUpErrorMessage(409, { error: "no open follow-up" })).toMatch(/no longer open/)
    expect(followUpErrorMessage(400, { error: "this outcome needs a note" })).toMatch(/needs a note/)
  })
})

describe("next check-in wording", () => {
  // Wed Oct 14 2026, 3:30 PM local
  const now = new Date(2026, 9, 14, 15, 30).getTime()
  const due = (days: number) => new Date(2026, 9, 14 + days).getTime()
  const nc = (over: Partial<NextCheckIn>): NextCheckIn => ({
    inDays: 2,
    dueOn: null,
    phase: "Episode days 0-14, day 8",
    reason: "Recheck within 2 days of the nurse callback",
    paused: false,
    source: "session",
    ...over,
  })

  it("says Today, Tomorrow, In N days, then a weekday date a week or more out", () => {
    expect(nextCheckInView(nc({ inDays: 0, dueOn: due(0) }), now).when).toBe("Today")
    expect(nextCheckInView(nc({ inDays: 1, dueOn: due(1) }), now)).toMatchObject({ when: "Tomorrow", on: "Thu, Oct 15" })
    expect(nextCheckInView(nc({ inDays: 3, dueOn: due(3) }), now)).toMatchObject({ when: "In 3 days", on: "Sat, Oct 17" })
    expect(nextCheckInView(nc({ inDays: 9, dueOn: due(9) }), now)).toMatchObject({ when: "Fri, Oct 23", on: null })
  })

  it("counts from the due day as days pass, and flags an overdue one", () => {
    const set2DaysAgo = nc({ inDays: 1, dueOn: due(-1) })
    expect(daysUntilDue(set2DaysAgo, now)).toBe(-1)
    expect(nextCheckInView(set2DaysAgo, now)).toMatchObject({ when: "Overdue since Tue, Oct 13", overdue: true })
  })

  it("falls back to inDays without a due day (seed schedule, or before the clock is read)", () => {
    expect(nextCheckInView(seedNextCheckIn({ inDays: 4, phase: "p", reason: "r" }), now).when).toBe("In 4 days")
    expect(daysUntilDue(nc({ inDays: 1, dueOn: due(5) }), 0)).toBe(1)
  })

  it("shows the paused line with no date", () => {
    expect(nextCheckInView(nc({ paused: true, inDays: null, dueOn: null }), now)).toMatchObject({ when: PAUSED_LABEL, paused: true, on: null })
  })
})
