import { describe, expect, it } from "vitest"
import { avatarGeometry } from "../lib/play/avatarGeometry"
import { buildSkeleton } from "../lib/play/syntheticPose"

describe("medic ninja avatar geometry", () => {
  it("follows the same keypoints as the fruit, sitting and standing", () => {
    for (const stand of [0, 0.5, 1]) {
      const kp = buildSkeleton({ stand, armsOut: false, leftUnload: false, visible: true })
      const g = avatarGeometry(kp, 400, 800)!
      expect(g.knees[0]).toEqual({ x: kp[13].x * 400, y: kp[13].y * 800 })
      expect(g.wrists[1]).toEqual({ x: kp[10].x * 400, y: kp[10].y * 800 })
      expect(g.head.y).toBeLessThan(g.shoulders[0].y)
      for (const v of Object.values(g).flat()) {
        if (typeof v === "number") expect(Number.isFinite(v)).toBe(true)
      }
    }
  })

  it("scales limbs and head with the body, within bounds", () => {
    const kp = buildSkeleton({ stand: 1, armsOut: true, leftUnload: false, visible: true })
    const small = avatarGeometry(kp, 200, 400)!
    const big = avatarGeometry(kp, 1600, 900)!
    expect(big.limb).toBeGreaterThan(small.limb)
    expect(small.limb).toBeGreaterThanOrEqual(10)
    expect(big.limb).toBeLessThanOrEqual(48)
    expect(big.headR).toBeLessThanOrEqual(80)
  })

  it("draws nothing when tracking is weak", () => {
    expect(avatarGeometry(buildSkeleton({ stand: 1, armsOut: false, leftUnload: false, visible: false }), 400, 800)).toBeNull()
    expect(avatarGeometry(null, 400, 800)).toBeNull()
  })
})

describe("demo band", () => {
  it("keeps the whole demo body below the header and above the progress bar, preserving order", async () => {
    const { fitDemoBand, DEMO_BAND } = await import("../lib/play/avatarGeometry")
    for (const stand of [0, 1]) {
      const kp = fitDemoBand(buildSkeleton({ stand, armsOut: true, leftUnload: false, visible: true }))
      for (const k of kp) {
        expect(k.y).toBeGreaterThanOrEqual(DEMO_BAND.top)
        expect(k.y).toBeLessThanOrEqual(DEMO_BAND.bottom)
      }
      expect(kp[0].y).toBeLessThan(kp[11].y)
      expect(kp[11].y).toBeLessThan(kp[15].y)
    }
  })
})
