import { beforeEach, describe, expect, it } from "vitest"
import { crewBoard, joinCrew, resetCrew } from "@/lib/crew"
import {
  activeDaysLabel,
  asNotJoined,
  CHEER_IDS,
  cheerForYouLine,
  cheersCountLabel,
  crewPanels,
  fetchCrewBoard,
  goalView,
  homeChipsRow,
  joinCrewCall,
  leaveCrewCall,
  postCheer,
  relativeTime,
  replaceMember,
  setCrewPhotoCall,
  yourRow,
} from "@/lib/play/crewView"
import * as crewView from "@/lib/play/crewView"
import { crewChips } from "@/lib/play/playerHome"
import { CheerId, CREW_CONSENT_VERSION } from "@/lib/types"

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
    // Your own row exists only after you join (opt-in).
    const board = joinCrew({ riseId: "rise-01", showPhoto: true, consentVersion: CREW_CONSENT_VERSION }, NOW).board
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

describe("crew panels by membership status", () => {
  it("not joined: join card above a read-only member list, no goal, cheers, settings, or chips", () => {
    expect(crewPanels("not_joined")).toEqual({
      joinCard: true,
      members: "readonly",
      intro: false,
      goal: false,
      cheersForYou: false,
      settings: false,
      pauseNote: false,
      homeChips: false,
    })
  })

  it("joined: the live board with cheers, settings, and home chips", () => {
    const p = crewPanels("joined")
    expect(p.joinCard).toBe(false)
    expect(p.members).toBe("cheer")
    expect(p.goal && p.cheersForYou && p.settings && p.homeChips).toBe(true)
    expect(p.pauseNote).toBe(false)
  })

  it("paused: only the pause note (no goal, members, cheers, counts, or chips)", () => {
    expect(crewPanels("paused")).toEqual({
      joinCard: false,
      members: "none",
      intro: false,
      goal: false,
      cheersForYou: false,
      settings: false,
      pauseNote: true,
      homeChips: false,
    })
  })

  it("home chips come only from a joined board", () => {
    const outside = crewBoard("rise-01", NOW)
    expect(outside.status).toBe("not_joined")
    expect(homeChipsRow(outside)).toBeUndefined()
    expect(homeChipsRow(undefined)).toBeUndefined()
    const joined = joinCrew({ riseId: "rise-01", showPhoto: false, consentVersion: CREW_CONSENT_VERSION }, NOW).board
    expect(homeChipsRow(joined)?.id).toBe("rise-01")
    expect(homeChipsRow({ ...joined, status: "paused" })).toBeUndefined()
  })

  it("asNotJoined drops your row and your cheers and shows the join card", () => {
    const joined = joinCrew({ riseId: "rise-01", showPhoto: true, consentVersion: CREW_CONSENT_VERSION }, NOW).board
    const out = asNotJoined(joined)
    expect(out.status).toBe("not_joined")
    expect(out.showPhoto).toBe(false)
    expect(out.members.some((m) => m.isYou)).toBe(false)
    expect(out.cheersForYou).toEqual([])
    expect(out.crewName).toBe(joined.crewName)
  })
})

describe("crew membership calls", () => {
  it("join posts the current consent version with the photo choice and sends cookies", async () => {
    const board = joinCrew({ riseId: "rise-01", showPhoto: true, consentVersion: CREW_CONSENT_VERSION }, NOW).board
    let seen: { url: string; init?: RequestInit } | null = null
    const out = await joinCrewCall(
      { riseId: "rise-01", showPhoto: true },
      {
        fetchImpl: async (url, init) => {
          seen = { url, init }
          return json(board)
        },
      },
    )
    expect(out).toEqual({ kind: "ok", board })
    expect(seen!.url).toBe("/api/crew/join")
    expect(seen!.init?.method).toBe("POST")
    expect(seen!.init?.credentials).toBe("same-origin")
    expect(JSON.parse(String(seen!.init?.body))).toEqual({ riseId: "rise-01", showPhoto: true, consentVersion: CREW_CONSENT_VERSION })
  })

  it("join maps 409 to a changed card, 403 to a refresh, and anything else to failed", async () => {
    const req = { riseId: "rise-01", showPhoto: false }
    expect(await joinCrewCall(req, { fetchImpl: async () => json({ error: "x" }, 409) })).toEqual({ kind: "changed" })
    expect(await joinCrewCall(req, { fetchImpl: async () => json({ error: "x" }, 403) })).toEqual({ kind: "refresh" })
    expect(await joinCrewCall(req, { fetchImpl: async () => json({ error: "x" }, 500) })).toEqual({ kind: "failed" })
    expect(await joinCrewCall(req, { fetchImpl: async () => json({ not: "a board" }) })).toEqual({ kind: "failed" })
    expect(await joinCrewCall(req, { fetchImpl: () => Promise.reject(new TypeError("offline")) })).toEqual({ kind: "failed" })
  })

  it("photo returns the new board, or signed_out on 401", async () => {
    const board = joinCrew({ riseId: "rise-01", showPhoto: false, consentVersion: CREW_CONSENT_VERSION }, NOW).board
    const req = { riseId: "rise-01", showPhoto: true }
    const ok = await setCrewPhotoCall(req, {
      fetchImpl: async (url, init) => {
        expect(url).toBe("/api/crew/photo")
        expect(JSON.parse(String(init?.body))).toEqual(req)
        return json({ ...board, showPhoto: true })
      },
    })
    expect(ok.kind === "ok" && ok.board.showPhoto).toBe(true)
    expect(await setCrewPhotoCall(req, { fetchImpl: async () => json({ error: "x" }, 401) })).toEqual({ kind: "signed_out" })
    expect(await setCrewPhotoCall(req, { fetchImpl: async () => json({ error: "x" }, 403) })).toEqual({ kind: "refresh" })
    expect(await setCrewPhotoCall(req, { fetchImpl: async () => json({ error: "x" }, 500) })).toEqual({ kind: "failed" })
  })

  it("leave treats 204 as ok and 401 as already out on this phone", async () => {
    expect(await leaveCrewCall("rise-01", { fetchImpl: async () => new Response(null, { status: 204 }) })).toEqual({ kind: "ok" })
    expect(await leaveCrewCall("rise-01", { fetchImpl: async () => json({ error: "x" }, 401) })).toEqual({ kind: "signed_out" })
    expect(await leaveCrewCall("rise-01", { fetchImpl: async () => json({ error: "x" }, 500) })).toEqual({ kind: "failed" })
  })

  it("cheer maps 401 to the join card and 403 to a refresh", async () => {
    const req = { from: "rise-01", to: "rise-02", cheerId: "nice_work" as const }
    expect(await postCheer(req, { fetchImpl: async () => json({ error: "x" }, 401) })).toEqual({ kind: "signed_out" })
    expect(await postCheer(req, { fetchImpl: async () => json({ error: "x" }, 403) })).toEqual({ kind: "refresh" })
  })
})

describe("withName", () => {
  it("never doubles the period after an initial", async () => {
    const { withName } = await import("../lib/play/crewView")
    expect(withName("Your cheer went to {name}.", "Frank D.")).toBe("Your cheer went to Frank D.")
    expect(withName("Your cheer went to {name}.", "Ellen")).toBe("Your cheer went to Ellen.")
  })
})
