/**
 * Rex's live pose returns [x,y,confidence][]; Keep the Line uses {x,y,score}.
 * When the selfie video is CSS-mirrored, flip x so overlays stay locked to the body.
 */

import type { Keypoints17 as LiveKp } from "@/lib/types"
import type { Keypoint, Keypoints17 } from "@/lib/play/types"

export function toPlayKeypoints(live: LiveKp | null, mirrorX = false): Keypoints17 | null {
  if (!live || live.length !== 17) return null
  const pts = live.map(([x, y, c]) => ({ x: mirrorX ? 1 - x : x, y, score: c }) as Keypoint)
  return pts as Keypoints17
}
