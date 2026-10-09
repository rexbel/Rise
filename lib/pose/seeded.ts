/**
 * Seeded tier: replays a keypoint stream through the same counter as live tracking, with the "Demo data" badge.
 * Source is a recorded fixture (public/fixtures/<riseId>-<variant>.json, recorded at /dev/fixtures; format in
 * fixtures/README.md) when the patient has one, else synthetic frames built from the patient's scripted_today.
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
  /** t_ms is relative to Go: negative frames are the seated lead-in used for calibration. */
  frames: { t_ms: number; keypoints: Keypoints17 }[]
}

/** The three fallback recordings (fixtures/README.md). They match each patient's scripted_today. */
export const FIXTURE_TARGETS = [
  { file: "rise-01-arms", riseId: "rise-01", variant: "arms", movement: "3 slow stands, push off with your hands from rep 2.", expected: { rawStands: 3, armsUsed: true, armsFromRep: 2, asymmetryPct: null } },
  { file: "rise-02-asym", riseId: "rise-02", variant: "asym", movement: "6 stands, shift your weight onto your right leg.", expected: { rawStands: 6, armsUsed: false, armsFromRep: null, asymmetryPct: 15 } },
  { file: "rise-06-arms", riseId: "rise-06", variant: "arms", movement: "6 stands, push off with your hands on every rep.", expected: { rawStands: 6, armsUsed: true, armsFromRep: 1, asymmetryPct: null } },
] as const

/** Fetches the patient's recorded fixture if one is deployed; null otherwise. Client-only. */
export async function loadFixture(riseId: string): Promise<Fixture | null> {
  const target = FIXTURE_TARGETS.find((t) => t.riseId === riseId)
  if (!target) return null
  try {
    const res = await fetch(`/fixtures/${target.file}.json`)
    return res.ok ? ((await res.json()) as Fixture) : null
  } catch {
    return null
  }
}

/** Frames with t relative to the start of the 30 s test (negative = seated lead-in for calibration). */
export function seededFrames(patient: SeedPatient, fixture?: Fixture | null): { t: number; kp: Keypoints17 }[] {
  if (fixture) return fixture.frames.map((f) => ({ t: f.t_ms, kp: f.keypoints }))
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
