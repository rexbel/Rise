import { beforeEach, describe, expect, it } from "vitest"
import {
  cheer,
  consentLog,
  crewBoard,
  dayKey,
  isPaused,
  joinCrew,
  leaveCrew,
  markActive,
  recordSelfStartedSet,
  resetCrew,
  setPhoto,
  tokenMatches,
  weekStart,
} from "../lib/crew"
import { applyResult, approve, getSession, invite, resetSessions, resumeCrew } from "../lib/sessions"
import { patients, scriptedResult } from "../lib/seed"
import { CheerResponse, CREW_CONSENT_VERSION, CrewBoard } from "../lib/types"

const NOW = new Date("2026-10-14T15:00:00").getTime() // a Wednesday
const ellen = patients[0]
const judith = patients.find((p) => p.rise_id === "rise-02")!
const calm = { ...ellen.scripted_today.symptoms, short_of_breath_or_chest_pain: false }

/** Opt in as a patient; returns the device token the cookie would carry. */
const join = (riseId: string, showPhoto = true) => joinCrew({ riseId, showPhoto, consentVersion: CREW_CONSENT_VERSION }, NOW).token
const you = (riseId: string, at = NOW) => crewBoard(riseId, at, true).members.find((m) => m.isYou)

beforeEach(() => {
  resetSessions()
  resetCrew()
})

describe("crew board", () => {
  it("parses as the contract, uses a neutral crew name, and lists the track's synthetic peers", () => {
    const board = CrewBoard.parse(crewBoard("rise-01", NOW))
    expect(board.crewName).toBe("Maple crew")
    expect(board.status).toBe("not_joined")
    expect(board.members.some((m) => m.id === "rise-08")).toBe(true)
    expect(board.members.some((m) => m.isYou)).toBe(false)
  })

  it("carries no clinical data or track: no reps, stands, scores, symptoms, procedures, post-op days", () => {
    for (const p of patients) {
      join(p.rise_id)
      const json = JSON.stringify(crewBoard(p.rise_id, NOW, true))
      expect(json, p.rise_id).not.toMatch(/raw|stand|steadi|score|hits|reps|symptom|pain|procedure|arthroplasty|post_op|recommend|escalat|triage|"track"|tka|tha|fracture/i)
    }
  })

  it("orders by days active, then name, with no places; others show first name and last initial", () => {
    join("rise-01")
    const { members } = crewBoard("rise-01", NOW, true)
    for (let i = 1; i < members.length; i++) expect(members[i - 1].activeDays).toBeGreaterThanOrEqual(members[i].activeDays)
    expect(members.find((m) => m.id === "rise-08")?.name).toBe("Margaret C.")
    expect(members.find((m) => m.isYou)?.name).toBe("Ellen")
  })

  it("the shared goal follows the CDC-based default of two days per listed member", () => {
    join("rise-01")
    const board = crewBoard("rise-01", NOW, true)
    expect(board.goal.target).toBe(board.members.length * 2)
  })

  it("a finished on-track session makes today active once, however many sets they play", () => {
    const gary = patients.find((p) => p.rise_id === "rise-04")! // continue_plan: never paused
    join("rise-04")
    const before = you("rise-04")!
    const goalBefore = crewBoard("rise-04", NOW, true).goal.done
    for (const at of [NOW, NOW + 1000]) {
      const sid = invite("rise-04", "play", "A", at).sessionId
      applyResult(sid, scriptedResult(gary, { sessionId: sid }), at + 10)
    }
    const after = you("rise-04", NOW + 3000)!
    expect(after.activeDays).toBe(before.activeDays + 1)
    expect(after.activeToday).toBe(true)
    expect(crewBoard("rise-04", NOW + 3000, true).goal.done).toBe(goalBefore + 1)
  })

  it("active days reset with the week and never exceed days elapsed", () => {
    join("rise-01")
    markActive("rise-01", NOW)
    expect(you("rise-01", weekStart(NOW) + 7 * 86_400_000 + 3_600_000)?.activeToday).toBe(false)
    for (const m of crewBoard("rise-01", weekStart(NOW) + 9 * 3_600_000, true).members) expect(m.activeDays).toBeLessThanOrEqual(1)
    expect(dayKey(NOW)).toBe("2026-10-14")
  })

  it("a red-flag session never marks the day active; a self-started calm game set does", () => {
    join("rise-01")
    const sid = invite("rise-01", "play", "A", NOW).sessionId
    applyResult(sid, scriptedResult(ellen, { sessionId: sid }), NOW)
    resumeCrew(sid, "Nurse A", NOW + 1) // back on the board, so her row is visible to check
    expect(you("rise-01", NOW + 2)?.activeToday).toBe(false)
    expect(recordSelfStartedSet(scriptedResult(ellen, { protocol: "steadi_30s", symptoms: calm }), NOW)).toBe(false)
    expect(recordSelfStartedSet(scriptedResult(ellen, { protocol: "play_set", symptoms: calm }), NOW + 3)).toBe(true)
    expect(you("rise-01", NOW + 4)?.activeToday).toBe(true)
  })
})

describe("opt-in and consent", () => {
  it("nobody appears to their crew until they join; joining shows them and logs consent", () => {
    expect(crewBoard("rise-02", NOW).members.some((m) => m.id === "rise-01")).toBe(false)
    const token = join("rise-01", false)
    expect(tokenMatches("rise-01", token)).toBe(true)
    expect(tokenMatches("rise-02", token)).toBe(false)
    expect(crewBoard("rise-02", NOW).members.find((m) => m.id === "rise-01")).toMatchObject({ name: "Ellen M.", avatarSrc: null })
    expect(consentLog("rise-01").map((c) => [c.action, c.source, c.consentVersion])).toEqual([
      ["joined", "patient_phone", CREW_CONSENT_VERSION],
      ["photo_hidden", "patient_phone", CREW_CONSENT_VERSION],
    ])
  })

  it("refuses a join made against an older consent text", () => {
    expect(() => joinCrew({ riseId: "rise-01", showPhoto: true, consentVersion: "2020-01-01" }, NOW)).toThrow(/changed/)
  })

  it("photo choice is respected and logged", () => {
    join("rise-01", false)
    expect(you("rise-01")?.avatarSrc).toBeNull()
    expect(setPhoto("rise-01", true, NOW).members.find((m) => m.isYou)?.avatarSrc).toBe("/play/avatars/rise-01.jpg")
    expect(consentLog("rise-01").at(-1)?.action).toBe("photo_shown")
  })

  it("leaving removes them everywhere, revokes the token, and is logged", () => {
    const token = join("rise-01")
    leaveCrew("rise-01", NOW + 5)
    expect(tokenMatches("rise-01", token)).toBe(false)
    expect(crewBoard("rise-02", NOW).members.some((m) => m.id === "rise-01")).toBe(false)
    expect(crewBoard("rise-01", NOW, true).status).toBe("not_joined")
    expect(consentLog("rise-01").at(-1)).toMatchObject({ action: "left", at: NOW + 5 })
  })
})

describe("cheers", () => {
  it("needs the sender's device token and membership", () => {
    expect(() => cheer({ from: "rise-01", to: "rise-08", cheerId: "nice_work" }, NOW, "x", false)).toThrow(/join your crew on this phone/)
    expect(() => cheer({ from: "rise-01", to: "rise-08", cheerId: "nice_work" }, NOW, "x", true)).toThrow(/join your crew first/)
  })

  it("records one cheer per recipient per day; a repeat is a no-op", () => {
    join("rise-01")
    const first = CheerResponse.parse(cheer({ from: "rise-01", to: "rise-08", cheerId: "keep_going" }, NOW, "x", true))
    expect(first).toMatchObject({ recorded: true, member: { cheeredByYouToday: true } })
    const again = cheer({ from: "rise-01", to: "rise-08", cheerId: "nice_work" }, NOW + 1000, "x", true)
    expect(again.recorded).toBe(false)
    expect(again.member.cheersReceived).toBe(first.member.cheersReceived)
    expect(cheer({ from: "rise-01", to: "rise-08", cheerId: "nice_work" }, NOW + 86_400_000, "x", true).recorded).toBe(true)
  })

  it("only reaches people who joined; a cheer to a joined patient shows on their board", () => {
    join("rise-01")
    expect(() => cheer({ from: "rise-01", to: "rise-02", cheerId: "proud_of_you" }, NOW, "x", true)).toThrow(/not on your crew/)
    join("rise-02")
    cheer({ from: "rise-01", to: "rise-02", cheerId: "proud_of_you" }, NOW, "x", true)
    expect(crewBoard("rise-02", NOW + 1, true).cheersForYou[0]).toMatchObject({ fromName: "Ellen M.", cheerId: "proud_of_you" })
  })

  it("refuses self-cheers, other crews, and unknown senders", () => {
    join("rise-01")
    expect(() => cheer({ from: "rise-01", to: "rise-01", cheerId: "nice_work" }, NOW, "x", true)).toThrow(/yourself/)
    expect(() => cheer({ from: "rise-01", to: "rise-14", cheerId: "nice_work" }, NOW, "x", true)).toThrow(/not on your crew/)
    expect(() => cheer({ from: "rise-08", to: "rise-01", cheerId: "nice_work" }, NOW, "x", true)).toThrow(/unknown sender/)
  })
})

describe("pause while the care team checks in", () => {
  function escalateJudith() {
    join("rise-02")
    const sid = invite("rise-02", "play", "A", NOW).sessionId
    applyResult(sid, scriptedResult(judith, { sessionId: sid }), NOW) // calf signal -> escalate_urgent
    return sid
  }

  it("an escalated patient is hidden from the crew, sees a pause, can't be cheered or cheer", () => {
    join("rise-01")
    const sid = escalateJudith()
    expect(isPaused("rise-02")).toBe(true)
    expect(crewBoard("rise-01", NOW, true).members.some((m) => m.id === "rise-02")).toBe(false)
    const own = crewBoard("rise-02", NOW, true)
    expect(own).toMatchObject({ status: "paused", members: [], cheersForYou: [] })
    expect(() => cheer({ from: "rise-01", to: "rise-02", cheerId: "keep_going" }, NOW, "x", true)).toThrow(/not on your crew/)
    expect(() => cheer({ from: "rise-02", to: "rise-08", cheerId: "nice_work" }, NOW, "x", true)).toThrow(/paused/)
    expect(getSession(sid)?.card?.recommendation).toBe("escalate_urgent")
  })

  it("a red flag pauses, and stays paused after the patient retracts it", () => {
    join("rise-01")
    const sid = invite("rise-01", "play", "A", NOW).sessionId
    applyResult(sid, scriptedResult(ellen, { sessionId: sid }), NOW)
    expect(isPaused("rise-01")).toBe(true)
    applyResult(sid, scriptedResult(ellen, { sessionId: sid, symptoms: calm }), NOW + 10)
    expect(isPaused("rise-01")).toBe(true)
  })

  it("a person returns them to the crew (audited); a downgrade to continue plan also lifts it", () => {
    const sid = escalateJudith()
    const s = resumeCrew(sid, "Nurse A", NOW + 5)
    expect(s.audit.at(-1)).toMatchObject({ action: "crew_resumed", user: "Nurse A" })
    expect(isPaused("rise-02")).toBe(false)
    expect(() => resumeCrew(sid, "Nurse A")).toThrow(/not paused/)

    const sid2 = invite("rise-02", "play", "A", NOW + 100).sessionId
    applyResult(sid2, scriptedResult(judith, { sessionId: sid2 }), NOW + 110)
    expect(isPaused("rise-02")).toBe(true)
    approve(sid2, { action: "downgrade", to: "continue_plan", reasonCode: "spoke_with_patient", user: "Nurse A" })
    expect(isPaused("rise-02")).toBe(false)
  })

  it("Reset demo clears membership, tokens, consent, pauses, cheers and active days", () => {
    const token = join("rise-01")
    escalateJudith()
    markActive("rise-01", NOW)
    resetSessions()
    expect(tokenMatches("rise-01", token)).toBe(false)
    expect(isPaused("rise-02")).toBe(false)
    expect(consentLog("rise-01")).toEqual([])
    expect(crewBoard("rise-01", NOW).status).toBe("not_joined")
  })
})
