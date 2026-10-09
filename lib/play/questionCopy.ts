import protocol from "@/config/protocol.default.json"
import type { QuestionId } from "@/lib/play/types"

const PROTOCOL_BY_PLAY: Record<QuestionId, string> = {
  pain: "pain_0_10",
  dizzy: "dizzy",
  breath_chest: "short_of_breath_or_chest_pain",
  calf: "calf_pain_or_swelling",
}

export function questionText(id: QuestionId): string {
  const protoId = PROTOCOL_BY_PLAY[id]
  const row = protocol.symptom_questions.find((q) => q.id === protoId)
  return row?.text ?? id
}

export function questionKind(id: QuestionId): "slider" | "yes_no" {
  return id === "pain" ? "slider" : "yes_no"
}
