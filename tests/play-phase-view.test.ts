import { describe, expect, it } from "vitest"
import { isLiveShell, nextQuestionId } from "@/lib/play/phaseView"

describe("phaseView", () => {
  it("returns the first unanswered question", () => {
    expect(nextQuestionId({})).toBe("pain")
    expect(nextQuestionId({ pain: 2 })).toBe("dizzy")
    expect(nextQuestionId({ pain: 2, dizzy: false, breath_chest: false, calf: false })).toBeNull()
  })

  it("treats live and stepBack as the live shell", () => {
    expect(isLiveShell("live")).toBe(true)
    expect(isLiveShell("stepBack")).toBe(true)
    expect(isLiveShell("questions")).toBe(false)
  })
})
