import { describe, expect, it } from "vitest"
import {
  avatarSrc,
  boardWeekLabel,
  cohortBoard,
  DEFAULT_YOU_ID,
  ordinalPlace,
} from "@/lib/play/cohort"
import { procedureFamily } from "@/lib/play/programs"

describe("cohortBoard", () => {
  it("defaults to Ellen with ~10 knee-track members", () => {
    const board = cohortBoard(DEFAULT_YOU_ID)
    expect(board.you.rise_id).toBe("rise-01")
    expect(board.family).toBe("tka")
    expect(board.entries.length).toBe(10)
    expect(board.entries.filter((e) => e.isYou)).toHaveLength(1)
    expect(board.entries.every((e) => e.member.id.startsWith("rise-"))).toBe(true)
  })

  it("ranks by hits descending and marks you", () => {
    const board = cohortBoard("rise-01")
    const scores = board.entries.map((e) => e.member.score)
    expect(scores).toEqual([...scores].sort((a, b) => b - a))
    const you = board.entries.find((e) => e.isYou)
    expect(you?.member.id).toBe("rise-01")
    expect(board.yourRank).toBe(you?.rank)
    expect(board.top.rank).toBe(1)
    expect(procedureFamily(board.you)).toBe("tka")
  })

  it("formats week label that includes today", () => {
    const now = new Date("2026-10-09T15:00:00")
    const label = boardWeekLabel(now)
    expect(label).toContain("Oct")
    expect(label).toMatch(/Sunday/)
    expect(boardWeekLabel(now)).toBe(label)
  })

  it("formats ordinal places and avatar paths", () => {
    expect(ordinalPlace(1)).toBe("1ST PLACE")
    expect(ordinalPlace(2)).toBe("2ND PLACE")
    expect(ordinalPlace(3)).toBe("3RD PLACE")
    expect(ordinalPlace(4)).toBe("4TH PLACE")
    expect(avatarSrc("rise-01")).toBe("/play/avatars/rise-01.jpg")
  })
})
