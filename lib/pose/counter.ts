/**
 * Stand counter for the CDC 30-Second Chair Stand. Pure state machine over 17 COCO keypoints, so the live tiers,
 * the seeded replay and the tests all run the same code. Assumes the phone is propped side-on at floor level.
 *
 * - Progress of a stand = how far the knee has opened (sit angle -> ~170 deg) AND how far the hip has risen
 *   (in thigh lengths, so it works at any distance). Requiring both stops a seated leg kick from counting.
 * - Stand = progress reaches STAND_AT from below SIT_AT (hysteresis). Counted on reaching full standing.
 * - Arm use = during a rise, a confident wrist leaves the chest (far from the shoulders, in torso lengths)
 *   for ARM_FRAMES frames in a row. CDC rule: arms used -> STEADI score 0; the raw count is kept.
 * - Half-way rule: at 30 s, a rise that is past halfway counts.
 * - Pause after standing longer than pauseS -> pausesOver3s (orthostatic signal).
 * - No rise started for stopNoStandS (sitting still, or out of frame) -> one "no_stand" stop event
 *   (the phone shows "keep going or finish here"). A slow patient mid-rise is never stopped.
 * - Asymmetry = left vs right knee-angle difference at mid-rise, when both knees are visible.
 *   `favoring` is the leg that extends first (drives the rise).
 */
import type { Keypoints17 } from "@/lib/types"

export const KP = {
  nose: 0, lShoulder: 5, rShoulder: 6, lElbow: 7, rElbow: 8, lWrist: 9, rWrist: 10,
  lHip: 11, rHip: 12, lKnee: 13, rKnee: 14, lAnkle: 15, rAnkle: 16,
} as const

const MIN_CONF = 0.4
const SIT_AT = 0.3
const STAND_AT = 0.8
const HALFWAY = 0.5
const STAND_ANGLE = 170
const DEFAULT_SIT_ANGLE = 95
const ARM_AWAY_TORSO = 0.55
const ARM_FRAMES = 2

export interface CounterOptions {
  durationS: number
  stopNoStandS: number
  pauseS: number
}

export interface Frame {
  t: number
  kp: Keypoints17
}

export interface Rep {
  n: number
  t: number
  armsUsed: boolean
  partial?: boolean
}

export type CounterEvent =
  | { type: "rep"; rep: Rep; count: number }
  | { type: "arm_use"; rep: number; t: number }
  | { type: "no_stand"; t: number }

export interface CounterSummary {
  rawStands: number
  armsUsed: boolean
  armsFromRep?: number
  asymmetryPct: number
  favoring: "left" | "right" | null
  pausesOver3s: number
  reps: Rep[]
}

type Phase = "calibrating" | "seated" | "rising" | "standing" | "lowering" | "done"

const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1])
const mid = (a: number[], b: number[]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
const ok = (p: number[]) => p[2] >= MIN_CONF
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

/** Interior angle at b (degrees) of the a-b-c joint. */
export function jointAngle(a: number[], b: number[], c: number[]) {
  const v1 = [a[0] - b[0], a[1] - b[1]], v2 = [c[0] - b[0], c[1] - b[1]]
  const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2) || 1)
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI
}

/** Knee angle per side, or null when that leg isn't visible. */
function kneeAngles(kp: Keypoints17) {
  const side = (h: number, k: number, a: number) => (ok(kp[h]) && ok(kp[k]) && ok(kp[a]) ? jointAngle(kp[h], kp[k], kp[a]) : null)
  return { left: side(KP.lHip, KP.lKnee, KP.lAnkle), right: side(KP.rHip, KP.rKnee, KP.rAnkle) }
}

/** The more confident side's hip/knee, for hip-rise and thigh length. */
function leg(kp: Keypoints17) {
  const l = kp[KP.lHip][2] + kp[KP.lKnee][2], r = kp[KP.rHip][2] + kp[KP.rKnee][2]
  const [h, k] = l >= r ? [KP.lHip, KP.lKnee] : [KP.rHip, KP.rKnee]
  return ok(kp[h]) && ok(kp[k]) ? { hip: kp[h], knee: kp[k] } : null
}

export class StandCounter {
  phase: Phase = "calibrating"
  count = 0
  private opts: CounterOptions
  private calib: Frame[] = []
  private sitAngle = DEFAULT_SIT_ANGLE
  private sitHipY: number | null = null
  private thigh: number | null = null
  private startT = 0
  private lastActiveT = 0
  private standingSince = 0
  private stoppedForNoStand = false
  private armFrames = 0
  private armThisRep = false
  private armsFromRep: number | undefined
  private pauses = 0
  private progress = 0
  private asym: { diff: number; leftLarger: boolean }[] = []
  private reps: Rep[] = []

  constructor(opts: Partial<CounterOptions> = {}) {
    this.opts = { durationS: 30, stopNoStandS: 8, pauseS: 3, ...opts }
  }

  /** Current stand progress 0..1 (for the skeleton overlay / debug). */
  get currentProgress() {
    return this.progress
  }

  /** Begin the 30 s test. Frames pushed before this (seated, during the countdown) calibrate the sit pose. */
  start(t: number) {
    const angles = this.calib.map((f) => kneeAngles(f.kp)).flatMap((a) => [a.left, a.right]).filter((a): a is number => a !== null)
    if (angles.length) this.sitAngle = Math.min(median(angles), STAND_ANGLE - 40)
    const legs = this.calib.map((f) => leg(f.kp)).filter((l) => l !== null)
    if (legs.length) {
      this.sitHipY = median(legs.map((l) => l.hip[1]))
      this.thigh = median(legs.map((l) => dist(l.hip, l.knee)))
    }
    this.phase = "seated"
    this.startT = this.lastActiveT = t
  }

  /** The patient chose "Keep going" after a stop: restart the no-stand timer. */
  resume(t: number) {
    this.stoppedForNoStand = false
    this.lastActiveT = t
  }

  push({ t, kp }: Frame): CounterEvent[] {
    if (this.phase === "done") return []
    if (this.phase === "calibrating") {
      this.calib.push({ t, kp })
      if (this.calib.length > 60) this.calib.shift()
      return []
    }
    const events: CounterEvent[] = []
    const p = this.measure(kp)
    if (p === null) return this.checkNoStand(t, events)
    this.progress = p
    if (p > SIT_AT) {
      this.lastActiveT = t
      this.stoppedForNoStand = false
    }

    switch (this.phase) {
      case "seated":
        if (p > SIT_AT) {
          this.phase = "rising"
          this.armThisRep = false
          this.armFrames = 0
        }
        break
      case "rising":
        this.trackArms(kp, t, events)
        this.trackAsymmetry(kp, p)
        if (p >= STAND_AT) {
          this.count++
          const rep: Rep = { n: this.count, t, armsUsed: this.armThisRep }
          this.reps.push(rep)
          events.push({ type: "rep", rep, count: this.count })
          this.phase = "standing"
          this.standingSince = t
        } else if (p < SIT_AT) {
          this.phase = "seated"
        }
        break
      case "standing":
        if (p < STAND_AT - 0.1) {
          if (t - this.standingSince > this.opts.pauseS * 1000) this.pauses++
          this.phase = "lowering"
        }
        break
      case "lowering":
        if (p < SIT_AT) this.phase = "seated"
        else if (p >= STAND_AT) this.phase = "standing"
        break
    }
    return this.checkNoStand(t, events)
  }

  /** End of the 30 s (or Finish here). Applies the CDC half-way rule. */
  finish(t: number): CounterSummary {
    if (this.phase === "rising" && this.progress >= HALFWAY && t - this.startT >= this.opts.durationS * 1000 - 50) {
      this.count++
      this.reps.push({ n: this.count, t, armsUsed: this.armThisRep, partial: true })
    }
    if (this.phase === "standing" && t - this.standingSince > this.opts.pauseS * 1000) this.pauses++
    this.phase = "done"
    const a = this.asym
    const asymmetryPct = a.length ? Math.round((a.reduce((s, x) => s + x.diff, 0) / a.length) * 10) / 10 : 0
    const leftVotes = a.filter((x) => x.leftLarger).length
    return {
      rawStands: this.count,
      armsUsed: this.reps.some((r) => r.armsUsed),
      armsFromRep: this.armsFromRep,
      asymmetryPct,
      favoring: asymmetryPct < 10 ? null : leftVotes * 2 >= a.length ? "left" : "right",
      pausesOver3s: this.pauses,
      reps: this.reps,
    }
  }

  /** Stand progress 0..1, or null if the legs aren't visible this frame. */
  private measure(kp: Keypoints17): number | null {
    const { left, right } = kneeAngles(kp)
    const angle = left !== null && right !== null ? Math.max(left, right) : (left ?? right)
    if (angle === null) return null
    const angleP = clamp01((angle - this.sitAngle) / (STAND_ANGLE - this.sitAngle))
    const l = leg(kp)
    if (!l) return angleP
    if (this.sitHipY === null || this.thigh === null) {
      this.sitHipY = l.hip[1]
      this.thigh = dist(l.hip, l.knee)
    }
    // Standing lifts the hip by roughly a thigh length; 0.85 of that counts as fully up.
    const hipP = clamp01((this.sitHipY - l.hip[1]) / (this.thigh * 0.85))
    return Math.min(angleP, hipP)
  }

  private trackArms(kp: Keypoints17, t: number, events: CounterEvent[]) {
    const ls = kp[KP.lShoulder], rs = kp[KP.rShoulder], lh = kp[KP.lHip], rh = kp[KP.rHip]
    const sh = ok(ls) && ok(rs) ? mid(ls, rs) : ok(ls) ? ls : ok(rs) ? rs : null
    const hp = ok(lh) && ok(rh) ? mid(lh, rh) : ok(lh) ? lh : ok(rh) ? rh : null
    if (!sh || !hp) return
    const torso = dist(sh, hp)
    const away = [kp[KP.lWrist], kp[KP.rWrist]].some((w) => ok(w) && dist(w, sh) / torso > ARM_AWAY_TORSO)
    this.armFrames = away ? this.armFrames + 1 : 0
    if (this.armFrames >= ARM_FRAMES && !this.armThisRep) {
      this.armThisRep = true
      const rep = this.count + 1
      this.armsFromRep ??= rep
      events.push({ type: "arm_use", rep, t })
    }
  }

  private trackAsymmetry(kp: Keypoints17, p: number) {
    if (p < 0.35 || p > 0.65) return
    const { left, right } = kneeAngles(kp)
    if (left === null || right === null) return
    this.asym.push({ diff: (Math.abs(left - right) / Math.max(left, right)) * 100, leftLarger: left > right })
  }

  private checkNoStand(t: number, events: CounterEvent[]) {
    if (!this.stoppedForNoStand && t - this.lastActiveT > this.opts.stopNoStandS * 1000) {
      this.stoppedForNoStand = true
      events.push({ type: "no_stand", t })
    }
    return events
  }
}
