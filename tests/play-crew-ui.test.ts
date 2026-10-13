import { beforeEach, describe, expect, it } from "vitest"
import { crewBoard, resetCrew } from "@/lib/crew"
import {
  activeDaysLabel,
  CHEER_IDS,
  cheerForYouLine,
  cheersCountLabel,
  fetchCrewBoard,
  goalView,
  postCheer,
  relativeTime,
  replaceMember,
  yourRow,
} from "@/lib/play/crewView"
import * as crewView from "@/lib/play/crewView"
import { crewChips } from "@/lib/play/playerHome"
import { CheerId } from "@/lib/types"

const NOW = new Date("2026-10-14T15:00:00").getTime()
const MIN = 60_000

beforeEach(() => resetCrew())

describe("crew labels", () => {
  it("says days active in words and never calls out a zero", () => {
    expect(activeDaysLabel(0)).toBe("Getting started this week")
    expect(activeDaysLabel(1)).toBe("Active one day this week")
    expect(activeDaysLabel(4)).toBe("Active 4 days this week")
  })

  it("hides a zero cheer count", () => {
    expect(cheersCountLabel(0)).toBe("")
    expect(cheersCountLabel(1)).toBe("One cheer")
    expect(cheersCountLabel(6)).toBe("6 cheers")
  })

  it("labels the crew goal in words and clamps the bar", () => {
    expect(goalView({ done: 20, target: 30 })).toEqual({ label: "20 of 30 crew days active this week", value: 20, max: 30, percent: 67, reached: false })
    const over = goalView({ done: 35, target: 30 })
    expect(over.value).toBe(30)
    expect(over.percent).toBe(100)
    expect(over.reached).toBe(true)
    expect(over.label).toBe("35 of 30 crew days active this week")
  })

  it("writes cheers for you as a sentence", () => {
    expect(cheerForYouLine("Margaret C.", "keep_going")).toBe("Margaret C. sent: Keep going!")
    expect([...CHEER_IDS].sort()).toEqual([...CheerId.options].sort())
  })

  it("formats relative time in plain words", () => {
    expect(relativeTime(NOW, NOW)).toBe("Just now")
    expect(relativeTime(NOW + 5 * MIN, NOW)).toBe("Just now")
    expect(relativeTime(NOW - MIN, NOW)).toBe("A minute ago")
    expect(relativeTime(NOW - 40 * MIN, NOW)).toBe("40 minutes ago")
    expect(relativeTime(NOW - 61 * MIN, NOW)).toBe("An hour ago")
    expect(relativeTime(NOW - 300 * MIN, NOW)).toBe("5 hours ago")
    expect(relativeTime(NOW - 25 * 60 * MIN, NOW)).toBe("Yesterday")
    expect(relativeTime(NOW - 3 * 24 * 60 * MIN, NOW)).toBe("3 days ago")
  })

  it("exposes no rank or place helper", () => {
    for (const name of Object.keys(crewView)) expect(name).not.toMatch(/^(rank|place|position|podium|streak)|(Rank|Place|Position|Podium|Streak)/)
  })
})

describe("crew board view on the real board", () => {
  it("finds your own row and replaces a member without reordering", () => {
    const board = crewBoard("rise-01", NOW)
    expect(yourRow(board)?.id).toBe("rise-01")
    const order = board.members.map((m) => m.id)
    const target = board.members.find((m) => !m.isYou)!
    const next = replaceMember(board, { ...target, cheeredByYouToday: true, cheersReceived: target.cheersReceived + 1 })
    expect(next.members.map((m) => m.id)).toEqual(order)
    expect(next.members.find((m) => m.id === target.id)?.cheeredByYouToday).toBe(true)
  })

  it("home chips show only positives and hide when the crew is missing", () => {
    expect(crewChips(undefined)).toEqual([])
    expect(crewChips({ activeDays: 0, cheersReceived: 0 })).toEqual([])
    expect(crewChips({ activeDays: 3, cheersReceived: 2 })).toEqual([
      { key: "days", label: "Days active", value: "3 this week" },
      { key: "cheers", label: "Cheers", value: "2" },
    ])
  })
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

describe("crew client calls", () => {
  it("retries once after a network failure, then returns the board", async () => {
    const board = crewBoard("rise-01", NOW)
    let calls = 0
    const got = await fetchCrewBoard("rise-01", {
      fetchImpl: async (url) => {
        calls++
        expect(url).toBe("/api/crew/rise-01")
        if (calls === 1) throw new TypeError("network")
        return json(board)
      },
    })
    expect(calls).toBe(2)
    expect(got.members.length).toBe(board.members.length)
  })

  it("does not retry a 404 and throws so the UI can offer Try again", async () => {
    let calls = 0
    await expect(
      fetchCrewBoard("rise-99", {
        fetchImpl: async () => {
          calls++
          return json({ error: "unknown patient" }, 404)
        },
      }),
    ).rejects.toThrow()
    expect(calls).toBe(1)
  })

  it("gives up after two bad attempts", async () => {
    let calls = 0
    await expect(
      fetchCrewBoard("rise-01", {
        fetchImpl: async () => {
          calls++
          return json({ not: "a board" })
        },
      }),
    ).rejects.toThrow()
    expect(calls).toBe(2)
  })

  it("times out a hung request", async () => {
    const hang = (_: string, init?: RequestInit) =>
      new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)))
    await expect(fetchCrewBoard("rise-01", { fetchImpl: hang, timeoutMs: 20 })).rejects.toBeTruthy()
  })

  it("treats recorded:false as success and 429 as the daily limit", async () => {
    const member = crewBoard("rise-01", NOW).members.find((m) => !m.isYou)!
    const repeat = await postCheer({ from: "rise-01", to: member.id, cheerId: "nice_work" }, { fetchImpl: async () => json({ recorded: false, member }) })
    expect(repeat).toEqual({ kind: "ok", recorded: false, member })
    expect(await postCheer({ from: "rise-01", to: member.id, cheerId: "nice_work" }, { fetchImpl: async () => json({ error: "x" }, 429) })).toEqual({ kind: "limit" })
    expect(await postCheer({ from: "rise-01", to: member.id, cheerId: "nice_work" }, { fetchImpl: async () => json({ error: "x" }, 400) })).toEqual({ kind: "failed" })
    expect(
      await postCheer({ from: "rise-01", to: member.id, cheerId: "nice_work" }, { fetchImpl: async () => Promise.reject(new TypeError("offline")) }),
    ).toEqual({ kind: "failed" })
  })
})

describe("withName", () => {
  it("never doubles the period after an initial", async () => {
    const { withName } = await import("../lib/play/crewView")
    expect(withName("Your cheer went to {name}.", "Frank D.")).toBe("Your cheer went to Frank D.")
    expect(withName("Your cheer went to {name}.", "Ellen")).toBe("Your cheer went to Ellen.")
  })
})
