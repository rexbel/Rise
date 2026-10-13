/**
 * RehabNinja program catalog. Rise defaults — not clinical standards.
 */

import programs from "@/content/programs.json"
import type { SeedPatient } from "@/lib/types"

export type ExerciseId = "sit_to_stand" | "mini_squat" | "single_leg_balance"

export type EndRule = "reps" | "hold"

export type ProgramExercise = {
  id: ExerciseId
  name: string
  sets: number
  reps: number
  holdSec?: number
  tempo?: string
  notes: string
  ninjaHint: string
  targetJoints: string[]
  endRule: EndRule
  maxDurationMs: number
}

export type ProcedureFamily = "tka" | "tha" | "hip_fracture"
export type PodBand = "0_3" | "4_7" | "8_14" | "15_30"

const EXERCISES = programs.exercises as ProgramExercise[]
const TRACKS = programs.tracks as Record<ProcedureFamily, Record<PodBand, ExerciseId[]>>

export function exerciseById(id: string): ProgramExercise {
  const ex = EXERCISES.find((e) => e.id === id)
  return ex ?? EXERCISES[0]
}

export function procedureFamily(patient: SeedPatient): ProcedureFamily {
  const p = patient.episode.procedure.toLowerCase()
  if (p.includes("hip fracture") || p.includes("femoral neck")) return "hip_fracture"
  if (p.includes("hip")) return "tha"
  return "tka"
}

export function podBand(pod: number): PodBand {
  if (pod <= 3) return "0_3"
  if (pod <= 7) return "4_7"
  if (pod <= 14) return "8_14"
  return "15_30"
}

export function todaysProgram(patient: SeedPatient): ProgramExercise[] {
  const family = procedureFamily(patient)
  const band = podBand(patient.episode.post_op_day_today)
  const ids = TRACKS[family]?.[band] ?? ["sit_to_stand"]
  return ids.map((id) => exerciseById(id))
}

export function targetReps(ex: ProgramExercise): number {
  if (ex.endRule === "hold") return 1
  return Math.max(1, ex.sets * ex.reps)
}

export function coachLine(exerciseId: ExerciseId, live: { coach: Record<string, string> }): string {
  return live.coach[exerciseId] ?? live.coach.sit_to_stand
}
