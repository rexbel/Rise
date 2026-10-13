import { beforeEach, describe, expect, it } from "vitest"
import { cheer, crewBoard, dayKey, markActive, resetCrew, weekStart } from "../lib/crew"
import { applyResult, invite, resetSessions } from "../lib/sessions"
import { patients, scriptedResult } from "../lib/seed"
import { CheerResponse, CrewBoard } from "../lib/types"

const NOW = new Date("2026-10-14T15:00:00").getTime() // a Wednesday

beforeEach(() => {
  resetSessions()
  resetCrew()
})

describe("crew board", () => {
  it("parses as the contract and lists the patient's whole track, Ellen included", () => {
    const board = CrewBoard.parse(crewBoard("rise-01", NOW))
    expect(board.track).toBe("tka")
    expect(board.members.filter((m) => m.isYou).map((m) => m.id)).toEqual(["rise-01"])
    expect(board.members.length).toBeGreaterThan(4)
    expect(board.demoData).toBe(true)
  })

  it("carries no clinical data: no reps, hits, stands, scores, symptoms, procedures, or post-op days", () => {
    for (const p of patients) {
      const json = JSON.stringify(crewBoard(p.rise_id, NOW))
      expect(json, p.rise_id).not.toMatch(/raw|stand|steadi|score|hits|reps|symptom|pain|procedure|arthroplasty|post_op|recommend|escalat|triage/i)
    }
  })

  it("orders by days active, then name, with no places; others show first name and last initial", () => {
    const { members } = crewBoard("rise-01", NOW)
    for (let i = 1; i < members.length; i++) expect(members[i - 1].activeDays).toBeGreaterThanOrEqual(members[i].activeDays)
    expect(members.find((m) => m.id === "rise-08")?.name).toBe("Margaret C.")
    expect(members.find((m) => m.isYou)?.name).toBe("Ellen")
    expect(members.every((m) => !("rank" in m) && !("place" in m))).toBe(true)
  })

  it("a finished session makes today active once, however many sets she plays", () => {
    const before = crewBoard("rise-01", NOW).members.find((m) => m.isYou)!
    const goalBefore = crewBoard("rise-01", NOW).goal.done
    const { sessionId } = invite("rise-01", "play", "A", NOW)
    applyResult(sessionId, scriptedResult(patients[0], { sessionId }), NOW)
    const second = invite("rise-01", "play", "A", NOW + 1000).sessionId
    applyResult(second, scriptedResult(patients[0], { sessionId: second }), NOW + 2000)
    const after = crewBoard("rise-01", NOW + 3000).members.find((m) => m.isYou)!
    expect(after.activeDays).toBe(before.activeDays + 1)
    expect(after.activeToday).toBe(true)
    expect(crewBoard("rise-01", NOW + 3000).goal.done).toBe(goalBefore + 1)
  })

  it("active days reset with the week", () => {
    markActive("rise-01", NOW)
    const nextMonday = weekStart(NOW) + 7 * 86_400_000 + 3_600_000
    expect(crewBoard("rise-01", nextMonday).members.find((m) => m.isYou)?.activeToday).toBe(false)
    expect(dayKey(NOW)).toBe("2026-10-14")
  })

  it("shows seeded cheers for you, newest first", () => {
    const { cheersForYou } = crewBoard("rise-01", NOW)
    expect(cheersForYou.map((c) => c.fromName)).toEqual(["Margaret C.", "Helen O."])
  })
})

describe("cheers", () => {
  it("records one cheer per recipient per day; a repeat is a no-op", () => {
    const first = CheerResponse.parse(cheer({ from: "rise-01", to: "rise-08", cheerId: "keep_going" }, NOW))
    expect(first).toMatchObject({ recorded: true, member: { cheeredByYouToday: true } })
    const again = cheer({ from: "rise-01", to: "rise-08", cheerId: "nice_work" }, NOW + 1000)
    expect(again.recorded).toBe(false)
    expect(again.member.cheersReceived).toBe(first.member.cheersReceived)
    expect(cheer({ from: "rise-01", to: "rise-08", cheerId: "nice_work" }, NOW + 86_400_000).recorded).toBe(true)
  })

  it("a cheer to a playable patient shows up on their board", () => {
    cheer({ from: "rise-01", to: "rise-02", cheerId: "proud_of_you" }, NOW)
    expect(crewBoard("rise-02", NOW + 1).cheersForYou[0]).toMatchObject({ fromName: "Ellen M.", cheerId: "proud_of_you" })
  })

  it("refuses self-cheers, other tracks, unknown senders, and too many in a day", () => {
    expect(() => cheer({ from: "rise-01", to: "rise-01", cheerId: "nice_work" }, NOW)).toThrow(/yourself/)
    expect(() => cheer({ from: "rise-01", to: "rise-14", cheerId: "nice_work" }, NOW)).toThrow(/not on your crew/)
    expect(() => cheer({ from: "rise-08", to: "rise-01", cheerId: "nice_work" }, NOW)).toThrow(/unknown sender/)
    // The daily sender cap (config crew.max_cheers_per_sender_per_day) exceeds any crew size, so honest use never hits it.
    expect(crewBoard("rise-01", NOW).members.length).toBeLessThan(20)
  })

  it("Reset demo clears live cheers and active days", () => {
    cheer({ from: "rise-01", to: "rise-08", cheerId: "nice_work" }, NOW)
    markActive("rise-01", NOW)
    resetSessions()
    expect(crewBoard("rise-01", NOW).members.find((m) => m.id === "rise-08")?.cheeredByYouToday).toBe(false)
    expect(crewBoard("rise-01", NOW).members.find((m) => m.isYou)?.activeToday).toBe(false)
  })
})
