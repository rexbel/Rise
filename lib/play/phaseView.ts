import type { PlayPhase, QuestionAnswers, QuestionId } from "@/lib/play/types"

export const QUESTION_ORDER: QuestionId[] = ["pain", "dizzy", "breath_chest", "calf"]

export function nextQuestionId(answers: QuestionAnswers): QuestionId | null {
  for (const id of QUESTION_ORDER) {
    if (answers[id] === undefined) return id
  }
  return null
}

export function isLiveShell(phase: PlayPhase): boolean {
  return phase === "live" || phase === "stepBack"
}
