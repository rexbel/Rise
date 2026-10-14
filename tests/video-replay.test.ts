import { existsSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import type { Fixture } from "../lib/pose/seeded"
import { createFindingTracker } from "../lib/play/findings"
import { createHitMissTracker } from "../lib/play/hitMiss"
import { frameAt, LOOP_MS, VIDEO_LOOPS, videoReplayFrames } from "../lib/play/videoReplay"

const file = "public/fixtures/rise-01-arms.json"

/** The looped demo video plays RehabNinja like the scripted rise-01 set: clean first stand, then push-offs. */
describe.skipIf(!existsSync(file))("RehabNinja video replay", () => {
  it("two loops give 6 reps: fruit for each clean stand, a bomb for each push-off", () => {
    const frames = videoReplayFrames(JSON.parse(readFileSync(file, "utf8")) as Fixture)
    const tracker = createFindingTracker()
    const hm = createHitMissTracker()
    const kinds: string[] = []
    for (let t = 0; t <= LOOP_MS * VIDEO_LOOPS; t += 1000 / 15) {
      const { kp } = frameAt(frames, t)
      const { visual } = tracker.push({ t, keypoints: kp }, "sit_to_stand")
      expect(visual.trackingOk).toBe(true)
      for (const e of hm.push(visual, kp, t, "sit_to_stand")) kinds.push(e.kind)
    }
    expect(kinds).toEqual(["hit", "miss", "miss", "hit", "miss", "miss"])
    expect(hm.snapshot().repCount).toBe(6)
  })
})
