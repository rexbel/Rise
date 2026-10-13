import { describe, expect, it } from "vitest"
import type { LiveVisual } from "@/lib/play/findings"
import { createHitMissTracker, hitSummary } from "@/lib/play/hitMiss"

function v(standAmount: number, partial: Partial<LiveVisual> = {}): LiveVisual {
  return {
    trackingOk: true,
    kneeInward: 0,
    armsOut: false,
    fast: false,
    hipY: 0.5,
    standing: standAmount > 0.55,
    hard: false,
    asymmetry: false,
    standAmount,
    sway: 0,
    ...partial,
  }
}

/** One sit -> stand -> sit cycle sampled every 100 ms. */
const CYCLE = [0.2, 0.3, 0.45, 0.6, 0.8, 0.95, 0.8, 0.5, 0.3, 0.2]

function play(reps: Array<Partial<LiveVisual>>) {
  const t = createHitMissTracker()
  let ms = 0
  for (const form of reps) {
    for (const s of CYCLE) {
      t.push(v(s, form), null, ms)
      ms += 100
    }
    ms += 1000
  }
  return t.snapshot()
}

describe("repCount (care-team rawStands)", () => {
  it("counts clean reps once each, alongside hits", () => {
    const s = play([{}, {}, {}])
    expect(s.repCount).toBe(3)
    expect(s.hitCount).toBe(3)
  })

  it("counts arm-assisted reps that score a miss instead of a hit", () => {
    const s = play([{}, {}, { armsOut: true }, { armsOut: true }])
    expect(s.repCount).toBe(4)
    expect(s.hitCount).toBe(2)
  })

  it("does not count a half rise that never reaches standing", () => {
    const t = createHitMissTracker()
    ;[0.2, 0.3, 0.45, 0.5, 0.4, 0.2].forEach((s, i) => t.push(v(s), null, i * 100))
    expect(t.snapshot().repCount).toBe(0)
  })

  it("resets with the tracker", () => {
    const t = createHitMissTracker()
    CYCLE.forEach((s, i) => t.push(v(s), null, i * 100))
    expect(t.snapshot().repCount).toBe(1)
    t.reset()
    expect(t.snapshot().repCount).toBe(0)
  })
})

describe("hitSummary", () => {
  it("summarizes hits and misses for screen readers", () => {
    expect(hitSummary(["hit", "hit", "miss"])).toBe("2 hits, 1 miss")
    expect(hitSummary(["hit"])).toBe("1 hit, 0 misses")
    expect(hitSummary([])).toBe("0 hits, 0 misses")
  })
})
