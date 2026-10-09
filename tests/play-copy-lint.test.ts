import { describe, expect, it } from "vitest"
import corrections from "@/content/form-corrections.json"
import lines from "@/content/patient-lines.json"

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
})
