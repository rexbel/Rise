import { describe, expect, it } from "vitest"
import type { LiveVisual } from "@/lib/play/findings"
import {
  createHitMissTracker,
  HIT_COOLDOWN_MS,
  HIT_STREAK,
  toLineQuality,
} from "@/lib/play/hitMiss"
import { buildSkeleton } from "@/lib/play/syntheticPose"

function visual(partial: Partial<LiveVisual>): LiveVisual {
  return {
    trackingOk: true,
    kneeInward: 0,
    armsOut: false,
    fast: false,
    hipY: 0.45,
    standing: true,
    hard: false,
    asymmetry: false,
    ...partial,
  }
}

const cleanKp = buildSkeleton({ stand: 1, armsOut: false, leftUnload: false, visible: true })
const armsKp = buildSkeleton({ stand: 1, armsOut: true, leftUnload: false, visible: true })

describe("toLineQuality", () => {
  it("held when tracking and form ok", () => {
    expect(toLineQuality(visual({}))).toBe("held")
  })
  it("bent when arms or knees", () => {
    expect(toLineQuality(visual({ armsOut: true }))).toBe("bent")
    expect(toLineQuality(visual({ kneeInward: 0.05 }))).toBe("bent")
  })
  it("lost when tracking fails", () => {
    expect(toLineQuality(visual({ trackingOk: false }))).toBe("lost")
  })
})

describe("createHitMissTracker", () => {
  it("fires a hit after HIT_STREAK held frames", () => {
    const t = createHitMissTracker()
    let hit = null as ReturnType<typeof t.push>[number] | null
    for (let i = 0; i < HIT_STREAK; i++) {
      const ev = t.push(visual({}), cleanKp, i * 70)
      if (ev[0]?.kind === "hit") hit = ev[0]
    }
    expect(hit?.kind).toBe("hit")
    expect(hit?.joint).toBe("midKnees")
    expect(t.snapshot().hitCount).toBe(1)
  })

  it("respects hit cooldown", () => {
    const t = createHitMissTracker()
    for (let i = 0; i < HIT_STREAK; i++) t.push(visual({}), cleanKp, i * 70)
    expect(t.snapshot().hitCount).toBe(1)
    for (let i = 0; i < HIT_STREAK; i++) t.push(visual({}), cleanKp, 500 + i * 70)
    expect(t.snapshot().hitCount).toBe(1)
    for (let i = 0; i < HIT_STREAK; i++) {
      t.push(visual({}), cleanKp, HIT_COOLDOWN_MS + 800 + i * 70)
    }
    expect(t.snapshot().hitCount).toBe(2)
  })

  it("fires miss on arms at a wrist joint", () => {
    const t = createHitMissTracker()
    t.push(visual({}), cleanKp, 0)
    const ev = t.push(visual({ armsOut: true }), armsKp, 100)
    expect(ev).toHaveLength(1)
    expect(ev[0].kind).toBe("miss")
    expect(ev[0].joint === "leftWrist" || ev[0].joint === "rightWrist").toBe(true)
  })

  it("does not spam miss while still bent", () => {
    const t = createHitMissTracker()
    t.push(visual({ armsOut: true }), armsKp, 0)
    const second = t.push(visual({ armsOut: true }), armsKp, 100)
    expect(second).toHaveLength(0)
  })

  it("resets streak on miss then can hit again after cooldown", () => {
    const t = createHitMissTracker()
    for (let i = 0; i < 4; i++) t.push(visual({}), cleanKp, i * 70)
    t.push(visual({ armsOut: true }), armsKp, 400)
    expect(t.snapshot().goodStreak).toBe(0)
    for (let i = 0; i < HIT_STREAK; i++) {
      t.push(visual({}), cleanKp, HIT_COOLDOWN_MS + 500 + i * 70)
    }
    expect(t.snapshot().hitCount).toBe(1)
  })
})
