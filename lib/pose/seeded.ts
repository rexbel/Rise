/**
 * Seeded tier: replays a keypoint stream through the same counter as live tracking, with the "Demo data" badge.
 * Source is a recorded fixture (fixtures/<riseId>-<variant>.json, see fixtures/README.md) when one is passed in,
 * else synthetic frames built from the patient's scripted_today.
 */
import type { Keypoints17, SeedPatient } from "@/lib/types"
import { synthSession } from "@/lib/pose/synth"

export interface Fixture {
  riseId: string
  variant: string
  tier: string
  fps: number
  recordedAt: string
  source: string
  expected: { rawStands: number; armsUsed: boolean; armsFromRep?: number | null; asymmetryPct: number | null }
  frames: { t_ms: number; keypoints: Keypoints17 }[]
}

/** Frames with t relative to the start of the 30 s test (negative = seated lead-in for calibration). */
export function seededFrames(patient: SeedPatient, fixture?: Fixture): { t: number; kp: Keypoints17 }[] {
  if (fixture) {
    const t0 = fixture.frames[0]?.t_ms ?? 0
    return fixture.frames.map((f) => ({ t: f.t_ms - t0, kp: f.keypoints }))
  }
  const s = patient.scripted_today
  const { frames, startT } = synthSession({
    stands: s.raw,
    armsFromRep: s.arms ? s.arms_from_rep : undefined,
    asymmetryPct: s.asymmetry_pct,
    favoring: s.favoring === "left" || s.favoring === "right" ? s.favoring : null,
    pauses: s.pauses_over_3s_after_standing ?? 0,
  })
  return frames.map((f) => ({ t: f.t - startT, kp: f.kp }))
}
