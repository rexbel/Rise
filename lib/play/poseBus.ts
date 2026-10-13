import { poseAtExercise, exerciseDurationMs, HZ } from "@/lib/play/syntheticPose"
import type { ExerciseId } from "@/lib/play/programs"
import type { Keypoints17, PoseBus, PoseFrame } from "@/lib/play/types"

/** Same frame contract live camera fills. Demo replay uses synthetic keypoints. */
export function estimate(keypoints: Keypoints17 | null, t: number): PoseFrame {
  return { t, keypoints }
}

const STEP = 1000 / HZ

export type SyntheticBus = PoseBus & {
  pause: () => void
  resume: () => void
  tMs: () => number
}

export function createSyntheticBus(
  riseId: string,
  onComplete?: () => void,
  exerciseId: ExerciseId = "sit_to_stand",
): SyntheticBus {
  const listeners = new Set<(f: PoseFrame) => void>()
  let timer: ReturnType<typeof setInterval> | null = null
  let t = 0
  let paused = false
  let started = false
  const duration = exerciseDurationMs(exerciseId, riseId)

  function tick() {
    if (paused) return
    const frame = estimate(poseAtExercise(exerciseId, riseId, t), t)
    for (const cb of listeners) cb(frame)
    t += STEP
    if (t > duration) {
      stop()
      onComplete?.()
    }
  }

  function start() {
    started = true
    paused = false
    if (!timer) timer = setInterval(tick, STEP)
  }

  function stop() {
    if (timer) clearInterval(timer)
    timer = null
    started = false
    paused = false
  }

  return {
    start,
    stop,
    pause: () => {
      paused = true
    },
    resume: () => {
      if (!started) {
        start()
        return
      }
      paused = false
      if (!timer) timer = setInterval(tick, STEP)
    },
    tMs: () => t,
    subscribe(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
  }
}
