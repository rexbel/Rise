/**
 * Patient 911 vs clinic route. Mirrors BUILD-PLAN §6 / lib/rules.ts comments.
 * Do not invent extra 911 thresholds. Pain is captured only.
 */

import type { Recommendation } from "@/lib/types"
import type { QuestionAnswers } from "@/lib/play/types"

export type ClinicPlayRoute = Recommendation

export function isPatientEmergency(answers: QuestionAnswers): boolean {
  return answers.breath_chest === true
}

/** Clinic recommendation from answers + whether they finished the set early. Pose decline stays in lib/rules.ts. */
export function clinicRouteFromAnswers(answers: QuestionAnswers, finishedEarly: boolean): ClinicPlayRoute {
  if (answers.breath_chest === true) return "escalate_urgent"
  if (finishedEarly) return "human_confirm"
  if (answers.calf === true) return "escalate_urgent"
  if (answers.dizzy === true) return "nurse_callback"
  return "continue_plan"
}
