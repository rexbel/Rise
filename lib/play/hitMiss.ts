/**
 * muse.fit / Fruit Ninja scoring for Keep the Line.
 * Hits from good-frame streaks; misses flash on the bad joint.
 * Never emits stand counts or STEADI.
 */

import type { LiveVisual } from "@/lib/play/findings"
import type { Keypoints17 } from "@/lib/play/types"

export type LineQuality = "held" | "bent" | "lost"

/** muse.fit demo defaults */
export const HIT_STREAK = 8
export const HIT_COOLDOWN_MS = 1200
export const MISS_COOLDOWN_MS = 500
export const KNEE_BEND = 0.03

export type HitMissKind = "hit" | "miss"

export type HitMissJoint = "midKnees" | "leftKnee" | "rightKnee" | "leftWrist" | "rightWrist"

export type HitMissEvent = {
  kind: HitMissKind
  atMs: number
  /** Normalized 0..1 playfield coords for FX */
  x: number
  y: number
  joint: HitMissJoint
}

export type HitMissState = {
  hitCount: number
  goodStreak: number
  lastHitAt: number
  lastMissAt: number
  wasBent: boolean
}

export type HitMissTracker = {
  push: (visual: LiveVisual, keypoints: Keypoints17 | null, tMs: number) => HitMissEvent[]
  reset: () => void
  snapshot: () => HitMissState
}

export function toLineQuality(visual: LiveVisual): LineQuality {
  if (!visual.trackingOk) return "lost"
  if (visual.hard || visual.kneeInward > KNEE_BEND || visual.armsOut) return "bent"
  return "held"
}

function midKnees(kp: Keypoints17): { x: number; y: number } {
  return {
    x: (kp[13].x + kp[14].x) / 2,
    y: (kp[13].y + kp[14].y) / 2,
  }
}

function missTarget(
  visual: LiveVisual,
  kp: Keypoints17 | null,
): { x: number; y: number; joint: HitMissJoint } {
  if (!kp) return { x: 0.5, y: 0.55, joint: "midKnees" }
  if (visual.armsOut) {
    const leftWorse = kp[9].y > kp[10].y
    const i = leftWorse ? 9 : 10
    return { x: kp[i].x, y: kp[i].y, joint: leftWorse ? "leftWrist" : "rightWrist" }
  }
  if (visual.kneeInward > KNEE_BEND) {
    const mid = (kp[15].x + kp[16].x) / 2
    const leftIn = kp[13].x - mid
    const rightIn = mid - kp[14].x
    if (leftIn >= rightIn) return { x: kp[13].x, y: kp[13].y, joint: "leftKnee" }
    return { x: kp[14].x, y: kp[14].y, joint: "rightKnee" }
  }
  const m = midKnees(kp)
  return { ...m, joint: "midKnees" }
}

export function createHitMissTracker(): HitMissTracker {
  let hitCount = 0
  let goodStreak = 0
  let lastHitAt = -Infinity
  let lastMissAt = -Infinity
  let wasBent = false

  function reset() {
    hitCount = 0
    goodStreak = 0
    lastHitAt = -Infinity
    lastMissAt = -Infinity
    wasBent = false
  }

  function snapshot(): HitMissState {
    return { hitCount, goodStreak, lastHitAt, lastMissAt, wasBent }
  }

  function push(visual: LiveVisual, keypoints: Keypoints17 | null, tMs: number): HitMissEvent[] {
    const events: HitMissEvent[] = []
    const quality = toLineQuality(visual)

    if (quality === "lost") {
      goodStreak = 0
      wasBent = false
      return events
    }

    const bent = quality === "bent"
    if (bent) {
      goodStreak = 0
      if (!wasBent && tMs - lastMissAt >= MISS_COOLDOWN_MS) {
        const target = missTarget(visual, keypoints)
        events.push({ kind: "miss", atMs: tMs, ...target })
        lastMissAt = tMs
      }
      wasBent = true
      return events
    }

    wasBent = false
    goodStreak += 1
    if (goodStreak >= HIT_STREAK && tMs - lastHitAt >= HIT_COOLDOWN_MS) {
      const m = keypoints ? midKnees(keypoints) : { x: 0.5, y: 0.55 }
      events.push({ kind: "hit", atMs: tMs, x: m.x, y: m.y, joint: "midKnees" })
      hitCount += 1
      lastHitAt = tMs
      goodStreak = 0
    }
    return events
  }

  return { push, reset, snapshot }
}
