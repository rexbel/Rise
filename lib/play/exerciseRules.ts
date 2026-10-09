/**
 * Per-exercise RehabNinja rule packs — thin descriptors for HUD + targets.
 */

import type { ExerciseId } from "@/lib/play/programs"
import { exerciseById } from "@/lib/play/programs"

export type ExerciseRulePack = {
  id: ExerciseId
  name: string
  targetJoints: string[]
  ninjaHint: string
  progressMode: "reps" | "hold"
  targetReps: number
  holdSec: number
  maxDurationMs: number
}

export function rulePack(exerciseId: ExerciseId): ExerciseRulePack {
  const ex = exerciseById(exerciseId)
  return {
    id: ex.id,
    name: ex.name,
    targetJoints: ex.targetJoints,
    ninjaHint: ex.ninjaHint,
    progressMode: ex.endRule === "hold" ? "hold" : "reps",
    targetReps: ex.endRule === "hold" ? 1 : Math.max(1, ex.sets * ex.reps),
    holdSec: ex.holdSec ?? 20,
    maxDurationMs: ex.maxDurationMs,
  }
}
