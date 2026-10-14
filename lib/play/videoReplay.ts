/**
 * RehabNinja demo replay from the AI demo video's keypoints (public/fixtures/rise-01-arms.json, recorded at
 * /dev/fixtures). The game's stand and arm checks read absolute positions tuned for a phone framed close, with the
 * seated hip near y 0.72. The video is a wide shot (seated hip ~0.57), so its frames are scaled evenly about the
 * seated hip until it lands there: shape, angles and ratios are kept, only the framing changes.
 * The video loops; one loop is the 30 s test (one clean stand, then two push-off stands).
 */
import type { Fixture } from "@/lib/pose/seeded"
import { toPlayKeypoints } from "@/lib/play/keypointsAdapt"
import type { Keypoints17 } from "@/lib/play/types"

export const LOOP_MS = 30_000
/** Two loops = 6 rises, the sit-to-stand set (1 x 6). */
export const VIDEO_LOOPS = 2

const SEATED_HIP_Y = 0.72
const STANDING_HIP_Y = 0.52

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

export type ReplayFrame = { t: number; kp: Keypoints17 }

/** Test frames (t >= 0) reframed for the game, sorted by t. */
export function videoReplayFrames(fx: Fixture): ReplayFrame[] {
  const hip = (kp: Fixture["frames"][number]["keypoints"]) => [(kp[11][0] + kp[12][0]) / 2, (kp[11][1] + kp[12][1]) / 2]
  const lead = fx.frames.filter((f) => f.t_ms < 0).map((f) => hip(f.keypoints))
  const test = fx.frames.filter((f) => f.t_ms >= 0)
  const seat = lead.length ? [median(lead.map((h) => h[0])), median(lead.map((h) => h[1]))] : hip(test[0].keypoints)
  const top = Math.min(...test.map((f) => hip(f.keypoints)[1]))
  const k = (SEATED_HIP_Y - STANDING_HIP_Y) / Math.max(0.05, seat[1] - top)
  return test.map((f) => ({
    t: f.t_ms,
    kp: toPlayKeypoints(
      f.keypoints.map(([x, y, c]) => [0.5 + (x - seat[0]) * k, SEATED_HIP_Y + (y - seat[1]) * k, c]) as Fixture["frames"][number]["keypoints"],
    )!,
  }))
}

/** Latest frame at or before t within the loop. */
export function frameAt(frames: ReplayFrame[], t: number): ReplayFrame {
  const lt = ((t % LOOP_MS) + LOOP_MS) % LOOP_MS
  let lo = 0, hi = frames.length - 1
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1
    if (frames[m].t <= lt) lo = m
    else hi = m - 1
  }
  return frames[lo]
}
