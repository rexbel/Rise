/**
 * Synthetic side-on keypoints for a scripted chair-stand session. Drives the "seeded" tier when no camera or
 * recorded fixture is available, and the counter tests. Real recorded fixtures (fixtures/*.json) replace it
 * for the demo patients that have one. Person faces +x; coordinates are normalized 0..1, y down.
 */
import type { Keypoints17 } from "@/lib/types"

export interface SynthScript {
  stands: number
  /** 1-based rep from which the hands push off the chair. */
  armsFromRep?: number
  /** Knee-angle asymmetry at mid-rise, percent. */
  asymmetryPct?: number
  favoring?: "left" | "right" | null
  /** How many stands are held more than 3 s before sitting. */
  pauses?: number
  durationS?: number
  fps?: number
  /** Seated frames before Go, used to calibrate. */
  leadInS?: number
}

const ANKLE = [0.62, 0.88]
const SHIN = 0.21
const THIGH = 0.2
const TORSO = 0.27
const SIT_KNEE = 92
const STAND_KNEE = 176

const rad = (d: number) => (d * Math.PI) / 180

/** One pose at stand progress s (0 seated .. 1 standing). */
export function poseAt(s: number, opts: { armsOff?: boolean; asymmetryPct?: number; favoring?: "left" | "right" | null } = {}): Keypoints17 {
  const knee = [ANKLE[0] - 0.02 * (1 - s), ANKLE[1] - SHIN]
  const theta = SIT_KNEE + (STAND_KNEE - SIT_KNEE) * s
  const legPoint = (angle: number) => [knee[0] - THIGH * Math.sin(rad(angle)), knee[1] + THIGH * Math.cos(rad(angle))]
  // Asymmetry shows mid-rise only: the favored leg extends ahead of the other.
  const bump = Math.sin(Math.PI * s)
  const asym = ((opts.asymmetryPct ?? 0) / 100) * theta * bump
  const favorLeft = opts.favoring !== "right"
  const lTheta = favorLeft ? theta : theta - asym
  const rTheta = favorLeft ? theta - asym : theta
  const hip = legPoint(theta)
  // Forward lean peaks mid-rise.
  const lean = rad(8 + 30 * bump)
  const sh = [hip[0] + TORSO * Math.sin(lean), hip[1] - TORSO * Math.cos(lean)]
  const wrist = opts.armsOff ? [hip[0] + 0.07, hip[1] + 0.01] : [sh[0] + 0.03, sh[1] + 0.06]
  const elbow = opts.armsOff ? [(sh[0] + wrist[0]) / 2 + 0.03, (sh[1] + wrist[1]) / 2] : [sh[0] + 0.06, sh[1] + 0.09]
  const nose = [sh[0] + 0.03, sh[1] - 0.09]
  const c = 0.95
  const p = (xy: number[], dx = 0): [number, number, number] => [xy[0] + dx, xy[1], c]
  // Both legs share the knee and ankle; each hip is placed from its own knee angle, so the angles are exact.
  const sideHip = (angle: number, dx: number): [number, number, number] => {
    const h = legPoint(angle)
    return [h[0] + dx, h[1], c]
  }
  return [
    p(nose), p([nose[0] - 0.01, nose[1] - 0.01]), p([nose[0] - 0.01, nose[1] - 0.01], 0.005),
    p([nose[0] - 0.04, nose[1]]), p([nose[0] - 0.04, nose[1]], 0.005),
    p(sh), p(sh, 0.005), p(elbow), p(elbow, 0.005), p(wrist), p(wrist, 0.005),
    sideHip(lTheta, 0), sideHip(rTheta, 0.005),
    p(knee), p(knee, 0.005), p(ANKLE), p(ANKLE, 0.005),
  ]
}

/** Frames for a full session: seated lead-in, then `stands` evenly spaced stands over durationS. */
export function synthSession(script: SynthScript): { frames: { t: number; kp: Keypoints17 }[]; startT: number; endT: number } {
  const fps = script.fps ?? 15
  const durationS = script.durationS ?? 30
  const leadInS = script.leadInS ?? 1
  const dt = 1000 / fps
  const period = (durationS - 0.5) / Math.max(script.stands, 1)
  const pauseSet = new Set(Array.from({ length: script.pauses ?? 0 }, (_, i) => i + 1))
  const frames: { t: number; kp: Keypoints17 }[] = []
  const startT = leadInS * 1000
  const endT = startT + durationS * 1000

  for (let t = 0; t <= endT; t += dt) {
    let s = 0
    let rep = 0
    if (t >= startT) {
      const x = (t - startT) / 1000 - 0.3
      rep = Math.floor(x / period) + 1
      if (x >= 0 && rep <= script.stands) {
        const local = x - (rep - 1) * period
        const hold = pauseSet.has(rep) ? 3.4 : 0.3
        const move = Math.max(0.6, Math.min(2.5, (period - hold - 0.3) / 2))
        if (local < move) s = local / move
        else if (local < move + hold) s = 1
        else if (local < 2 * move + hold) s = 1 - (local - move - hold) / move
      }
    }
    const armsOff = !!script.armsFromRep && rep >= script.armsFromRep && s > 0.05 && s < 0.95
    frames.push({ t: Math.round(t), kp: poseAt(s, { armsOff, asymmetryPct: script.asymmetryPct, favoring: script.favoring }) })
  }
  return { frames, startT, endT }
}
