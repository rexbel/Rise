/**
 * Deterministic findings from Keypoints17. Debounce before a finding fires.
 * Valgus vs hip mid for camera robustness. exerciseId soft-gates which flags matter.
 */

import type { ExerciseId } from "@/lib/play/programs"
import type { Finding, FindingId, Keypoints17, PoseFrame } from "@/lib/play/types"

const I = {
  lShoulder: 5,
  rShoulder: 6,
  lWrist: 9,
  rWrist: 10,
  lHip: 11,
  rHip: 12,
  lKnee: 13,
  rKnee: 14,
  lAnkle: 15,
  rAnkle: 16,
} as const

export const DEBOUNCE_SOFT = 6
export const DEBOUNCE_HARD = 10
export const MIN_JOINT = 0.45
export const KNEE_BEND_SOFT = 0.035
export const KNEE_BEND_HARD = 0.09
export const ARMS_DELTA = 0.22

export type LiveVisual = {
  trackingOk: boolean
  kneeInward: number
  armsOut: boolean
  fast: boolean
  hipY: number
  standing: boolean
  hard: boolean
  asymmetry: boolean
  /** 0 sit/deep … 1 stand/high — for apex detection */
  standAmount: number
  sway: number
}

export type Tracker = {
  push: (frame: PoseFrame, exerciseId?: ExerciseId) => { visual: LiveVisual; finding: Finding | null }
  reset: () => void
}

function jointOk(kp: Keypoints17, i: number): boolean {
  return kp[i].score >= MIN_JOINT
}

function scoreOk(kp: Keypoints17): boolean {
  return [I.lHip, I.rHip, I.lKnee, I.rKnee].every((i) => jointOk(kp, i))
}

export function measure(kp: Keypoints17, dtMs: number, prevHipY: number | null) {
  const hipY = (kp[I.lHip].y + kp[I.rHip].y) / 2
  const midHip = (kp[I.lHip].x + kp[I.rHip].x) / 2
  const kneeInward = Math.max(0, kp[I.lKnee].x - midHip, midHip - kp[I.rKnee].x)
  const shoulderY = (kp[I.lShoulder].y + kp[I.rShoulder].y) / 2
  const wristY = (kp[I.lWrist].y + kp[I.rWrist].y) / 2
  const wristsOk = jointOk(kp, I.lWrist) && jointOk(kp, I.rWrist)
  const armsOut = wristsOk && wristY - shoulderY > ARMS_DELTA
  const dy = prevHipY == null ? 0 : Math.abs(hipY - prevHipY)
  const speed = dtMs > 0 ? dy / (dtMs / 1000) : 0
  const fast = speed > 0.55
  const asymmetry = Math.abs(kp[I.lHip].y - kp[I.rHip].y) > 0.04
  // hipY smaller = higher in frame = more standing
  const standAmount = Math.max(0, Math.min(1, (0.72 - hipY) / 0.28))
  const ankleMid = jointOk(kp, I.lAnkle) && jointOk(kp, I.rAnkle) ? (kp[I.lAnkle].x + kp[I.rAnkle].x) / 2 : midHip
  const sway = Math.abs(midHip - ankleMid)
  return {
    kneeInward,
    armsOut,
    fast,
    hipY,
    standing: standAmount > 0.55,
    asymmetry,
    standAmount,
    sway,
  }
}

function relevantFlags(exerciseId: ExerciseId): FindingId[] {
  if (exerciseId === "single_leg_balance") return ["valgus", "asymmetry"]
  if (exerciseId === "mini_squat") return ["valgus", "speed", "asymmetry"]
  return ["valgus", "speed", "arms", "asymmetry"]
}

export function createFindingTracker(): Tracker {
  const streak: Record<FindingId, number> = { valgus: 0, speed: 0, arms: 0, asymmetry: 0 }
  const fired = new Set<FindingId>()
  let prevHipY: number | null = null
  let prevT: number | null = null

  function reset() {
    streak.valgus = 0
    streak.speed = 0
    streak.arms = 0
    streak.asymmetry = 0
    fired.clear()
    prevHipY = null
    prevT = null
  }

  function idleVisual(trackingOk: boolean): LiveVisual {
    return {
      trackingOk,
      kneeInward: 0,
      armsOut: false,
      fast: false,
      hipY: 0.62,
      standing: false,
      hard: false,
      asymmetry: false,
      standAmount: 0.2,
      sway: 0,
    }
  }

  function push(frame: PoseFrame, exerciseId: ExerciseId = "sit_to_stand"): { visual: LiveVisual; finding: Finding | null } {
    if (!frame.keypoints || !scoreOk(frame.keypoints)) {
      prevHipY = null
      prevT = frame.t
      return { visual: idleVisual(false), finding: null }
    }
    const dt = prevT == null ? 0 : frame.t - prevT
    const sig = measure(frame.keypoints, dt, prevHipY)
    prevHipY = sig.hipY
    prevT = frame.t
    const flags: Record<FindingId, boolean> = {
      valgus: sig.kneeInward > KNEE_BEND_SOFT,
      speed: sig.fast,
      arms: sig.armsOut,
      asymmetry: sig.asymmetry || (exerciseId === "single_leg_balance" && sig.sway > 0.08),
    }
    const hardValgus = sig.kneeInward > KNEE_BEND_HARD
    const allow = new Set(relevantFlags(exerciseId))
    let finding: Finding | null = null
    for (const id of Object.keys(flags) as FindingId[]) {
      if (!allow.has(id)) {
        streak[id] = 0
        continue
      }
      streak[id] = flags[id] ? streak[id] + 1 : 0
      const need = id === "valgus" && hardValgus ? DEBOUNCE_HARD : DEBOUNCE_SOFT
      if (streak[id] >= need && !fired.has(id)) {
        fired.add(id)
        finding = {
          id,
          severity: id === "valgus" && hardValgus ? "hard" : "soft",
          atMs: frame.t,
        }
      }
    }
    return {
      visual: {
        ...sig,
        trackingOk: true,
        hard: hardValgus && streak.valgus >= DEBOUNCE_HARD,
      },
      finding,
    }
  }

  return { push, reset }
}
