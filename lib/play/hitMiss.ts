/**
 * RehabNinja scoring: clean rep apex → hit; form break → bomb/miss.
 * Never emits stand counts or STEADI.
 */

import type { LiveVisual } from "@/lib/play/findings"
import { KNEE_BEND_SOFT } from "@/lib/play/findings"
import type { ExerciseId } from "@/lib/play/programs"
import type { Keypoints17 } from "@/lib/play/types"

export type LineQuality = "held" | "bent" | "lost"

export const HIT_STREAK_BACKUP = 12
export const HIT_COOLDOWN_MS = 900
export const MISS_COOLDOWN_MS = 500
export const HOLD_HIT_EVERY_MS = 2500
export const APEX_RISE = 0.12
export const APEX_MIN = 0.55
/** Mini squat needs a deeper dip before a stand counts as a hit. */
export const SQUAT_DEEP = 0.42
export const SQUAT_APEX_MIN = 0.72
/** Must visit sit/squat before backup streak can fire. */
export const SIT_FOR_BACKUP = 0.38

export type HitMissKind = "hit" | "miss"

export type HitMissJoint = "midKnees" | "leftKnee" | "rightKnee" | "leftWrist" | "rightWrist" | "midAnkles"

export type HitMissEvent = {
  kind: HitMissKind
  atMs: number
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
  holdCleanMs: number
}

export type HitMissTracker = {
  push: (
    visual: LiveVisual,
    keypoints: Keypoints17 | null,
    tMs: number,
    exerciseId?: ExerciseId,
  ) => HitMissEvent[]
  reset: () => void
  snapshot: () => HitMissState
}

export function toLineQuality(visual: LiveVisual, exerciseId: ExerciseId = "sit_to_stand"): LineQuality {
  if (!visual.trackingOk) return "lost"
  if (visual.hard) return "bent"
  if (visual.kneeInward > KNEE_BEND_SOFT) return "bent"
  if (exerciseId !== "single_leg_balance" && visual.armsOut) return "bent"
  if (exerciseId === "single_leg_balance" && visual.sway > 0.08) return "bent"
  if (exerciseId === "mini_squat" && visual.fast) return "bent"
  return "held"
}

function midKnees(kp: Keypoints17): { x: number; y: number } {
  return {
    x: (kp[13].x + kp[14].x) / 2,
    y: (kp[13].y + kp[14].y) / 2,
  }
}

function midAnkles(kp: Keypoints17): { x: number; y: number } {
  return {
    x: (kp[15].x + kp[16].x) / 2,
    y: (kp[15].y + kp[16].y) / 2,
  }
}

function missTarget(
  visual: LiveVisual,
  kp: Keypoints17 | null,
  exerciseId: ExerciseId,
): { x: number; y: number; joint: HitMissJoint } {
  if (!kp) return { x: 0.5, y: 0.55, joint: "midKnees" }
  if (exerciseId === "single_leg_balance") {
    const m = midAnkles(kp)
    return { ...m, joint: "midAnkles" }
  }
  if (visual.armsOut) {
    const leftWorse = kp[9].y > kp[10].y
    const i = leftWorse ? 9 : 10
    return { x: kp[i].x, y: kp[i].y, joint: leftWorse ? "leftWrist" : "rightWrist" }
  }
  if (visual.kneeInward > KNEE_BEND_SOFT) {
    const mid = (kp[11].x + kp[12].x) / 2
    const leftIn = kp[13].x - mid
    const rightIn = mid - kp[14].x
    if (leftIn >= rightIn) return { x: kp[13].x, y: kp[13].y, joint: "leftKnee" }
    return { x: kp[14].x, y: kp[14].y, joint: "rightKnee" }
  }
  const m = midKnees(kp)
  return { ...m, joint: "midKnees" }
}

function hitTarget(kp: Keypoints17 | null, exerciseId: ExerciseId): { x: number; y: number; joint: HitMissJoint } {
  if (!kp) return { x: 0.5, y: 0.55, joint: "midKnees" }
  if (exerciseId === "single_leg_balance") {
    const m = midAnkles(kp)
    return { ...m, joint: "midAnkles" }
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
  let holdCleanMs = 0
  let prevStand = 0.3
  let rising = false
  let sawSit = false
  let prevT: number | null = null

  function reset() {
    hitCount = 0
    goodStreak = 0
    lastHitAt = -Infinity
    lastMissAt = -Infinity
    wasBent = false
    holdCleanMs = 0
    prevStand = 0.3
    rising = false
    sawSit = false
    prevT = null
  }

  function snapshot(): HitMissState {
    return { hitCount, goodStreak, lastHitAt, lastMissAt, wasBent, holdCleanMs }
  }

  function emitHit(tMs: number, kp: Keypoints17 | null, exerciseId: ExerciseId, events: HitMissEvent[]) {
    if (tMs - lastHitAt < HIT_COOLDOWN_MS) return
    const target = hitTarget(kp, exerciseId)
    events.push({ kind: "hit", atMs: tMs, ...target })
    hitCount += 1
    lastHitAt = tMs
    goodStreak = 0
  }

  function push(
    visual: LiveVisual,
    keypoints: Keypoints17 | null,
    tMs: number,
    exerciseId: ExerciseId = "sit_to_stand",
  ): HitMissEvent[] {
    const events: HitMissEvent[] = []
    const quality = toLineQuality(visual, exerciseId)
    const dt = prevT == null ? 0 : Math.max(0, tMs - prevT)
    prevT = tMs

    if (quality === "lost") {
      goodStreak = 0
      wasBent = false
      rising = false
      holdCleanMs = 0
      prevStand = visual.standAmount
      return events
    }

    const bent = quality === "bent"
    if (bent) {
      goodStreak = 0
      rising = false
      holdCleanMs = 0
      if (!wasBent && tMs - lastMissAt >= MISS_COOLDOWN_MS) {
        const target = missTarget(visual, keypoints, exerciseId)
        events.push({ kind: "miss", atMs: tMs, ...target })
        lastMissAt = tMs
      }
      wasBent = true
      prevStand = visual.standAmount
      return events
    }

    wasBent = false

    if (exerciseId === "single_leg_balance") {
      holdCleanMs += dt
      if (holdCleanMs >= HOLD_HIT_EVERY_MS && tMs - lastHitAt >= HIT_COOLDOWN_MS) {
        emitHit(tMs, keypoints, exerciseId, events)
        holdCleanMs = 0
      }
      prevStand = visual.standAmount
      return events
    }

    // Apex: rising through standAmount threshold with quality held
    const s = visual.standAmount
    const delta = s - prevStand
    const apexMin = exerciseId === "mini_squat" ? SQUAT_APEX_MIN : APEX_MIN
    const deepNeed = exerciseId === "mini_squat" ? SQUAT_DEEP : SIT_FOR_BACKUP
    if (s <= deepNeed) {
      sawSit = true
      rising = false
    }
    if (delta > 0.02) rising = true
    if (
      sawSit &&
      rising &&
      prevStand < apexMin &&
      s >= apexMin &&
      delta >= 0
    ) {
      emitHit(tMs, keypoints, exerciseId, events)
      rising = false
      sawSit = false
    }
    // Backup streak only after a sit/squat — never while holding a stand
    if (sawSit && s < apexMin) {
      goodStreak += 1
      if (
        goodStreak >= HIT_STREAK_BACKUP &&
        tMs - lastHitAt >= HIT_COOLDOWN_MS * 2
      ) {
        emitHit(tMs, keypoints, exerciseId, events)
        sawSit = false
      }
    } else {
      goodStreak = 0
    }
    if (delta < -APEX_RISE) rising = false
    prevStand = s
    return events
  }

  return { push, reset, snapshot }
}
