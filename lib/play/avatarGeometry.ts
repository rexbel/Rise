/**
 * Medic ninja avatar for the live screen (demo replay): body geometry from the same 17 COCO keypoints that place
 * the fruit, so the figure, its arms, and the fruit always line up. Pure, so sizing is testable without a canvas.
 */
import type { Keypoints17 } from "@/lib/play/types"

type Pt = { x: number; y: number }

export type AvatarGeometry = {
  head: Pt
  headR: number
  /** Limb thickness in px. */
  limb: number
  shoulders: [Pt, Pt]
  elbows: [Pt, Pt]
  wrists: [Pt, Pt]
  hips: [Pt, Pt]
  knees: [Pt, Pt]
  ankles: [Pt, Pt]
}

const MIN_SCORE = 0.3
const NEEDED = [0, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]

/** Null when any needed joint is missing or low-confidence (draw nothing rather than a broken body). */
export function avatarGeometry(kp: Keypoints17 | null, w: number, h: number): AvatarGeometry | null {
  if (!kp || w <= 0 || h <= 0) return null
  if (NEEDED.some((i) => !kp[i] || kp[i].score < MIN_SCORE)) return null
  const p = (i: number): Pt => ({ x: kp[i].x * w, y: kp[i].y * h })
  const ls = p(5)
  const rs = p(6)
  const shoulderW = Math.hypot(rs.x - ls.x, rs.y - ls.y)
  const limb = Math.max(10, Math.min(48, shoulderW * 0.26))
  const nose = p(0)
  return {
    head: { x: nose.x, y: nose.y },
    headR: Math.max(14, Math.min(80, shoulderW * 0.42)),
    limb,
    shoulders: [ls, rs],
    elbows: [p(7), p(8)],
    wrists: [p(9), p(10)],
    hips: [p(11), p(12)],
    knees: [p(13), p(14)],
    ankles: [p(15), p(16)],
  }
}

/**
 * Demo replay only: the synthetic body spans almost the full height, so the head would sit under the title and coach
 * line. Fit it into the free band between the header and the progress bar. Fruit, avatar, and hit effects all use
 * this same mapping so they stay aligned. Live camera keypoints are never remapped (they must match the video).
 */
export const DEMO_BAND = { top: 0.24, bottom: 0.84 } as const

export function demoY(y: number): number {
  return DEMO_BAND.top + y * (DEMO_BAND.bottom - DEMO_BAND.top)
}

export function fitDemoBand(kp: Keypoints17): Keypoints17 {
  return kp.map((k) => ({ ...k, y: demoY(k.y) })) as Keypoints17
}
