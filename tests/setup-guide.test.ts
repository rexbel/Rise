import { describe, expect, it } from "vitest"
import { guideStepFor } from "../app/p/[token]/setup-guide"

describe("classic check-in setup guide", () => {
  it("shows the first safety check not yet ticked, then the phone picture", () => {
    expect(guideStepFor({})).toBe("chair")
    expect(guideStepFor({ chair: true })).toBe("helper")
    expect(guideStepFor({ chair: true, helper: true })).toBe("phone")
    expect(guideStepFor({ chair: true, helper: true, phone: true })).toBe("phone")
    expect(guideStepFor({ helper: true })).toBe("chair") // an unticked earlier check comes first
  })
})
