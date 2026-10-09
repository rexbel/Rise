/**
 * Deterministic findings from Keypoints17. Debounce before a finding fires.
 */

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

export const DEBOUNCE_SOFT = 5
export const DEBOUNCE_HARD = 8

export type LiveVisual = {
  trackingOk: boolean
  kneeInward: number
  armsOut: boolean
  fast: boolean
  hipY: number
  standing: boolean
  hard: boolean
  asymmetry: boolean
}

export type Tracker = {
  push: (frame: PoseFrame) => { visual: LiveVisual; finding: Finding | null }
  reset: () => void
}

function scoreOk(kp: Keypoints17): boolean {
  return [I.lHip, I.rHip, I.lKnee, I.rKnee, I.lAnkle, I.rAnkle].every((i) => kp[i].score >= 0.4)
}

export function measure(kp: Keypoints17, dtMs: number, prevHipY: number | null) {
  const hipY = (kp[I.lHip].y + kp[I.rHip].y) / 2
  const mid = (kp[I.lAnkle].x + kp[I.rAnkle].x) / 2
  const kneeInward = Math.max(0, kp[I.lKnee].x - mid, mid - kp[I.rKnee].x)
  const shoulderY = (kp[I.lShoulder].y + kp[I.rShoulder].y) / 2
  const wristY = (kp[I.lWrist].y + kp[I.rWrist].y) / 2
  const armsOut = wristY - shoulderY > 0.18
  const dy = prevHipY == null ? 0 : Math.abs(hipY - prevHipY)
  const speed = dtMs > 0 ? dy / (dtMs / 1000) : 0
  const fast = speed > 0.55
  const asymmetry = Math.abs(kp[I.lHip].y - kp[I.rHip].y) > 0.035
  return { kneeInward, armsOut, fast, hipY, standing: hipY < 0.48, asymmetry }
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
    }
  }

  function push(frame: PoseFrame): { visual: LiveVisual; finding: Finding | null } {
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
      valgus: sig.kneeInward > 0.03,
      speed: sig.fast,
      arms: sig.armsOut,
      asymmetry: sig.asymmetry,
    }
    const hardValgus = sig.kneeInward > 0.08
    let finding: Finding | null = null
    for (const id of Object.keys(flags) as FindingId[]) {
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
      visual: { ...sig, trackingOk: true, hard: hardValgus && streak.valgus >= DEBOUNCE_HARD },
      finding,
    }
  }

  return { push, reset }
}
