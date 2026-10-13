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
    for (const text of stringsOf([playUi.week, playUi.note, playUi.emergency, playUi.close.tip_label, playUi.ready, playUi.crew])) {
      expect(text.split(/\s+/).length, text).toBeLessThan(20)
    }
  })
})

/*
 * The crew board deliberately allows "crew" and "cheer" on the patient surface. It is engagement, not performance:
 * still no rank, place, score, leaderboard, peer, below average, streak, missed day, or ordinal ("1st", "9th place").
 */
const CREW_BANNED =
  /\b(rank\w*|places?|placed|score\w*|leaderboards?|peers?|cohorts?|streaks?|missed|miss|behind|last|winner|top|podium|trophy|below average)\b/i
const ORDINAL = /\b\d+(st|nd|rd|th)\b|\b(first|second|third|fourth|fifth)\b/i

describe("crew copy", () => {
  const { cheers, ...rest } = playUi.crew

  it("allows crew and cheer words", () => {
    expect(playUi.crew.heading).toMatch(/crew/i)
    expect(playUi.crew.cheer_button).toMatch(/cheer/i)
  })

  it("never ranks, places, scores, or calls out missed days", () => {
    for (const text of stringsOf(playUi.crew)) {
      expect(text, text).not.toMatch(BANNED)
      expect(text, text).not.toMatch(CREW_BANNED)
      expect(text, text).not.toMatch(ORDINAL)
      expect(text, text).not.toMatch(/\d\s*(?:\w+\s+)?place/i)
    }
  })

  it("has exactly the three fixed cheer phrases keyed by CheerId", () => {
    expect(cheers).toEqual({ nice_work: "Nice work!", keep_going: "Keep going!", proud_of_you: "Proud of you!" })
  })

  it("puts counts only in {n}, {done}, or {target} templates, never literal digits", () => {
    for (const text of stringsOf(rest)) {
      expect(text, text).not.toMatch(/\d/)
    }
  })

  it("never names a procedure or body region (crew membership must not reveal a diagnosis)", () => {
    const BODY = /\b(knees?|hips?|fractures?|surgery|surgeries|surgical|operations?|procedures?|post-?op|ACL|TKA|THA|joint replacement)\b/i
    for (const text of stringsOf(playUi.crew)) {
      expect(text, text).not.toMatch(BODY)
    }
  })

  it("join card names what is shared and what is never shared, and offers a way out", () => {
    const shared = playUi.crew.join_shared.join(" ").toLowerCase()
    expect(shared).toMatch(/name/)
    expect(shared).toMatch(/initial/)
    expect(shared).toMatch(/days/)
    expect(shared).toMatch(/cheers/)
    expect(playUi.crew.join_private).toEqual(["How you did", "Your answers", "Your health"])
    expect(playUi.crew.join_button).toBe("Join my crew")
    expect(playUi.crew.join_note).toBe("You can leave any time.")
    expect(playUi.crew.photo_label).toBe("Show my photo")
    expect(playUi.crew.leave_confirm).toBe("Leave your crew? You can join again later.")
  })

  it("pause copy does not nudge toward play or mention progress", () => {
    for (const text of [playUi.crew.paused_heading, playUi.crew.paused_body]) {
      expect(text, text).not.toMatch(/\b(play|goal|cheer\w*|active|days?|keep going|come back|don't|should|need to)\b/i)
    }
  })
})
