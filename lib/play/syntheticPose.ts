/**
 * ~15 Hz synthetic keypoints for RehabNinja demos. No STEADI scoring here.
 */

import type { ExerciseId } from "@/lib/play/programs"
import type { Keypoint, Keypoints17 } from "@/lib/play/types"

export const HZ = 15
export const MS_PER_RISE = 4000
export const MS_PER_SQUAT = 3200
export const MS_BALANCE = 20_000

export type PoseScript = {
  riseId: string
  rises: number
  armsFromRep?: number
  leftUnload?: boolean
  trackingLossAtMs?: [number, number]
}

const SCRIPTS: Record<string, PoseScript> = {
  "rise-01": { riseId: "rise-01", rises: 3, armsFromRep: 2 },
  "rise-04": { riseId: "rise-04", rises: 10 },
  "rise-02": { riseId: "rise-02", rises: 6, leftUnload: true },
}

export function poseScript(riseId: string): PoseScript {
  return SCRIPTS[riseId] ?? { riseId, rises: 3 }
}

export function scriptDurationMs(riseId: string): number {
  return poseScript(riseId).rises * MS_PER_RISE
}

export function exerciseDurationMs(exerciseId: ExerciseId, riseId: string): number {
  if (exerciseId === "single_leg_balance") return MS_BALANCE
  if (exerciseId === "mini_squat") return 8 * MS_PER_SQUAT
  return scriptDurationMs(riseId)
}

function kp(x: number, y: number, score = 0.95): Keypoint {
  return { x, y, score }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** 0 sit → 1 stand within one rise (2s up, 2s down). */
export function standAmount(tInRise: number): number {
  const p = tInRise / MS_PER_RISE
  if (p <= 0.5) return 0.5 - 0.5 * Math.cos((p / 0.5) * Math.PI)
  return 0.5 + 0.5 * Math.cos(((p - 0.5) / 0.5) * Math.PI)
}

/** Mini squat: 1 = stand, 0 = shallow squat bottom. */
export function squatAmount(tInCycle: number): number {
  const p = tInCycle / MS_PER_SQUAT
  // stand → squat → stand
  if (p <= 0.5) return 1 - (0.5 - 0.5 * Math.cos((p / 0.5) * Math.PI)) * 0.45
  return 1 - (0.5 + 0.5 * Math.cos(((p - 0.5) / 0.5) * Math.PI)) * 0.45
}

export function poseAt(riseId: string, tMs: number): Keypoints17 | null {
  return poseAtExercise("sit_to_stand", riseId, tMs)
}

export function poseAtExercise(exerciseId: ExerciseId, riseId: string, tMs: number): Keypoints17 | null {
  if (exerciseId === "single_leg_balance") {
    const duration = MS_BALANCE
    const t = Math.min(Math.max(tMs, 0), duration)
    const sway = Math.sin(t / 900) * 0.012
    return buildSkeleton({
      stand: 0.92,
      armsOut: false,
      leftUnload: false,
      visible: true,
      hipShift: sway,
    })
  }
  if (exerciseId === "mini_squat") {
    const duration = 8 * MS_PER_SQUAT
    const t = Math.min(Math.max(tMs, 0), duration)
    const cycle = Math.floor(t / MS_PER_SQUAT)
    const tIn = t - cycle * MS_PER_SQUAT
    const stand = squatAmount(tIn)
    return buildSkeleton({ stand, armsOut: false, leftUnload: false, visible: true })
  }
  const script = poseScript(riseId)
  const duration = scriptDurationMs(riseId)
  if (script.trackingLossAtMs) {
    const [a, b] = script.trackingLossAtMs
    if (tMs >= a && tMs < b) return null
  }
  const t = Math.min(Math.max(tMs, 0), duration)
  const riseIndex = Math.min(Math.floor(t / MS_PER_RISE), script.rises - 1)
  const tInRise = t - riseIndex * MS_PER_RISE
  const stand = standAmount(tInRise)
  const armsOut = script.armsFromRep != null && riseIndex + 1 >= script.armsFromRep
  return buildSkeleton({ stand, armsOut, leftUnload: Boolean(script.leftUnload), visible: true })
}

export function buildSkeleton(opts: {
  stand: number
  armsOut: boolean
  leftUnload: boolean
  visible: boolean
  hipShift?: number
}): Keypoints17 {
  const s = opts.stand
  const score = opts.visible ? 0.95 : 0.12
  const hipY = lerp(0.62, 0.4, s)
  const kneeY = lerp(0.72, 0.58, s)
  const ankleY = 0.88
  const shoulderY = lerp(0.38, 0.22, s)
  const headY = lerp(0.22, 0.08, s)
  const leftShift = (opts.leftUnload ? 0.05 : 0) + (opts.hipShift ?? 0)
  const hipLx = 0.44 + leftShift
  const hipRx = 0.56 + (opts.hipShift ?? 0)
  const hipLy = hipY + (opts.leftUnload ? 0.04 : 0)
  const hipRy = hipY
  const kneeIn = opts.leftUnload ? 0.06 : 0
  const wristY = opts.armsOut ? lerp(0.7, 0.55, s) : lerp(0.4, 0.28, s)
  const wristLx = opts.armsOut ? 0.28 : 0.48
  const wristRx = opts.armsOut ? 0.72 : 0.52

  const pts: Keypoints17 = [
    kp(0.5, headY, score),
    kp(0.47, headY + 0.02, score),
    kp(0.53, headY + 0.02, score),
    kp(0.44, headY + 0.03, score),
    kp(0.56, headY + 0.03, score),
    kp(0.4, shoulderY, score),
    kp(0.6, shoulderY, score),
    kp(0.36, lerp(shoulderY, wristY, 0.5), score),
    kp(0.64, lerp(shoulderY, wristY, 0.5), score),
    kp(wristLx, wristY, score),
    kp(wristRx, wristY, score),
    kp(hipLx, hipLy, score),
    kp(hipRx, hipRy, score),
    kp(hipLx - 0.02 + kneeIn, kneeY, score),
    kp(hipRx + 0.02, kneeY, score),
    kp(hipLx - 0.02, ankleY, score),
    kp(hipRx + 0.02, ankleY, score),
  ]
  return pts
}

/** Hip height peaks (stands) by sampling at HZ. */
export function countStandPeaks(riseId: string): number {
  const duration = scriptDurationMs(riseId)
  const step = 1000 / HZ
  let prev = 0
  let peaks = 0
  let rising = false
  for (let t = 0; t <= duration; t += step) {
    const pose = poseAt(riseId, t)
    if (!pose) continue
    const hipY = (pose[11].y + pose[12].y) / 2
    const standness = 0.62 - hipY
    if (standness > prev && standness > 0.15) {
      if (!rising) {
        peaks += 1
        rising = true
      }
    }
    if (standness < 0.08) rising = false
    prev = standness
  }
  return peaks
}
