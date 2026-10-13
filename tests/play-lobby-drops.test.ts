import { describe, expect, it } from "vitest"
import { DROP_ORDER, MAX_DROPS, pruneDrops, spawnDrop, stepDrops, type Drop } from "../lib/play/lobbyDrops"

const fixed = () => 0.25

describe("lobby supply drops", () => {
  it("cycles crutch, pill, band-aid", () => {
    let drops: Drop[] = []
    for (let i = 0; i < 6; i++) drops = spawnDrop(drops, i * 26, -24, i, fixed)
    expect(drops.map((d) => d.kind)).toEqual([...DROP_ORDER, ...DROP_ORDER])
  })

  it("falls to the surface within a few frames and settles flat", () => {
    let drops = spawnDrop([], 100, -24, 0, fixed)
    let frames = 0
    while (drops[0].y < 0 && frames < 60) {
      drops = stepDrops(drops, 16)
      frames++
    }
    expect(drops[0].y).toBe(0)
    expect(frames).toBeLessThan(20) // about a third of a second at 60 fps
    expect(Math.abs(Math.cos(drops[0].rot))).toBeCloseTo(0, 5) // crutch lies on its side
    expect(stepDrops(drops, 16)[0]).toEqual(drops[0]) // stays put once landed
  })

  it("keeps at most MAX_DROPS and prunes what scrolled off", () => {
    let drops: Drop[] = []
    for (let i = 0; i < MAX_DROPS + 5; i++) drops = spawnDrop(drops, i, -24, i, fixed)
    expect(drops).toHaveLength(MAX_DROPS)
    expect(pruneDrops(drops, 20).every((d) => d.x > 20)).toBe(true)
  })
})
