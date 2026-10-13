import { describe, expect, it } from "vitest"
import type { LiveVisual } from "@/lib/play/findings"
import {
  APEX_MIN,
  createHitMissTracker,
  HIT_COOLDOWN_MS,
  HIT_STREAK_BACKUP,
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
    standAmount: 0.7,
    sway: 0,
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
    expect(toLineQuality(visual({ kneeInward: 0.25 }))).toBe("bent")
  })
  it("lost when tracking fails", () => {
    expect(toLineQuality(visual({ trackingOk: false }))).toBe("lost")
  })
})

describe("createHitMissTracker", () => {
  it("fires a hit on clean stand apex", () => {
    const t = createHitMissTracker()
    t.push(visual({ standAmount: 0.3 }), cleanKp, 0, "sit_to_stand")
    const ev = t.push(visual({ standAmount: APEX_MIN + 0.05 }), cleanKp, 100, "sit_to_stand")
    expect(ev.some((e) => e.kind === "hit")).toBe(true)
    expect(t.snapshot().hitCount).toBe(1)
  })

  it("respects hit cooldown after apex", () => {
    const t = createHitMissTracker()
    t.push(visual({ standAmount: 0.2 }), cleanKp, 0, "sit_to_stand")
    t.push(visual({ standAmount: 0.7 }), cleanKp, 80, "sit_to_stand")
    expect(t.snapshot().hitCount).toBe(1)
    t.push(visual({ standAmount: 0.2 }), cleanKp, 200, "sit_to_stand")
    t.push(visual({ standAmount: 0.7 }), cleanKp, 300, "sit_to_stand")
    expect(t.snapshot().hitCount).toBe(1)
    t.push(visual({ standAmount: 0.2 }), cleanKp, HIT_COOLDOWN_MS + 400, "sit_to_stand")
    t.push(visual({ standAmount: 0.7 }), cleanKp, HIT_COOLDOWN_MS + 500, "sit_to_stand")
    expect(t.snapshot().hitCount).toBe(2)
  })

  it("does not backup-hit while holding a stand", () => {
    const t = createHitMissTracker()
    for (let i = 0; i < HIT_STREAK_BACKUP + 4; i++) {
      t.push(visual({ standAmount: 0.85 }), cleanKp, i * 80, "sit_to_stand")
    }
    expect(t.snapshot().hitCount).toBe(0)
  })

  it("backup streak can hit after a sit if apex never crosses", () => {
    const t = createHitMissTracker()
    t.push(visual({ standAmount: 0.2 }), cleanKp, 0, "sit_to_stand")
    for (let i = 0; i < HIT_STREAK_BACKUP; i++) {
      t.push(visual({ standAmount: 0.45 }), cleanKp, HIT_COOLDOWN_MS * 2 + i * 80, "sit_to_stand")
    }
    expect(t.snapshot().hitCount).toBeGreaterThanOrEqual(1)
  })

  it("mini squat hits on rise from deep", () => {
    const t = createHitMissTracker()
    t.push(visual({ standAmount: 0.3 }), cleanKp, 0, "mini_squat")
    const ev = t.push(visual({ standAmount: 0.78 }), cleanKp, 120, "mini_squat")
    expect(ev.some((e) => e.kind === "hit")).toBe(true)
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

  it("balance emits hold hits over time", () => {
    const t = createHitMissTracker()
    t.push(visual({ standAmount: 0.9, sway: 0 }), cleanKp, 0, "single_leg_balance")
    const ev = t.push(visual({ standAmount: 0.9, sway: 0 }), cleanKp, 2600, "single_leg_balance")
    expect(ev.some((e) => e.kind === "hit")).toBe(true)
  })
})
