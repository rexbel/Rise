import { describe, expect, it } from "vitest"
import corrections from "@/content/form-corrections.json"
import lines from "@/content/patient-lines.json"
import playUi from "@/content/play-ui.json"

const BANNED = /STEADI|valgus|score|below average|ACL graft/i

function stringsOf(value: unknown, acc: string[] = []): string[] {
  if (typeof value === "string") acc.push(value)
  else if (value && typeof value === "object") {
    for (const v of Object.values(value)) stringsOf(v, acc)
  }
  return acc
}

describe("play patient copy", () => {
  it("form-corrections have no banned clinical terms or digits", () => {
    const { $comment, ...rows } = corrections
    void $comment
    for (const text of stringsOf(rows)) {
      expect(text, text).not.toMatch(BANNED)
      expect(text, text).not.toMatch(/\d/)
    }
  })

  it("non-emergency patient-lines have no digits", () => {
    const { emergency, $comment, ...rest } = lines
    void $comment
    void emergency
    for (const text of stringsOf(rest)) {
      expect(text.replace("{clinic}", "Clinic")).not.toMatch(/\d/)
    }
  })

  it("player home copy has no banned clinical terms", () => {
    for (const text of stringsOf(playUi.home)) {
      expect(text, text).not.toMatch(BANNED)
    }
  })

  it("all RehabNinja chrome has no banned terms, ranks, places, or peers", () => {
    const { $comment, ...rest } = playUi
    void $comment
    for (const text of stringsOf(rest)) {
      expect(text, text).not.toMatch(BANNED)
      expect(text, text).not.toMatch(/\b(rank|place|peer|cohort|leaderboard|board place)\b/i)
    }
  })

  it("your-week, note, emergency, and question copy carry no counts", () => {
    const { pain_value, ...questions } = playUi.questions
    expect(pain_value).toContain("{n}")
    for (const text of stringsOf([playUi.week, playUi.note, playUi.emergency, questions])) {
      expect(text.replace(/\{\w+\}/g, "N"), text).not.toMatch(/\d/)
    }
  })

  it("new patient lines stay short (under 20 words)", () => {
    for (const text of stringsOf([playUi.week, playUi.note, playUi.emergency, playUi.close.tip_label, playUi.close.how_it_went])) {
      expect(text.split(/\s+/).length, text).toBeLessThan(20)
    }
  })
})
