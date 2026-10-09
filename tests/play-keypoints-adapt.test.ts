import { describe, expect, it } from "vitest"
import { toPlayKeypoints } from "@/lib/play/keypointsAdapt"
import type { Keypoints17 as LiveKp } from "@/lib/types"

function liveKp(x = 0.2): LiveKp {
  return Array.from({ length: 17 }, () => [x, 0.5, 0.9] as [number, number, number]) as LiveKp
}

describe("toPlayKeypoints", () => {
  it("maps tuple keypoints to {x,y,score}", () => {
    const play = toPlayKeypoints(liveKp(0.25))
    expect(play).not.toBeNull()
    expect(play![0]).toEqual({ x: 0.25, y: 0.5, score: 0.9 })
  })

  it("mirrors x for selfie overlay alignment", () => {
    const play = toPlayKeypoints(liveKp(0.2), true)
    expect(play![0].x).toBeCloseTo(0.8)
  })

  it("returns null for missing or short arrays", () => {
    expect(toPlayKeypoints(null)).toBeNull()
    expect(toPlayKeypoints([] as unknown as LiveKp)).toBeNull()
  })
})
