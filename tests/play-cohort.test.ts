import { existsSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import * as cohort from "@/lib/play/cohort"
import { avatarSrc, DEFAULT_YOU_ID, familyLabel } from "@/lib/play/cohort"

describe("self-only identity helpers", () => {
  it("opens for the synthetic demo patient", () => {
    expect(DEFAULT_YOU_ID).toBe("rise-01")
  })

  it("exposes no board, rank, or peer helpers", () => {
    const names = Object.keys(cohort)
    expect(names.sort()).toEqual(["DEFAULT_YOU_ID", "avatarSrc", "familyLabel"].sort())
  })

  it("formats avatar paths that exist for every seed patient", () => {
    expect(avatarSrc("rise-01")).toBe("/play/avatars/rise-01.jpg")
    for (let i = 1; i <= 7; i++) {
      const id = `rise-0${i}`
      expect(existsSync(path.join(process.cwd(), "public", avatarSrc(id))), id).toBe(true)
    }
  })

  it("labels tracks in plain words", () => {
    expect(familyLabel("tka")).toBe("Knee track")
    expect(familyLabel("tha")).toBe("Hip track")
    expect(familyLabel("hip_fracture")).toBe("Fracture track")
  })
})
