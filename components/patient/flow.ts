/**
 * Pure helpers for the patient flow header (Back and Leave), shared by the classic check-in and RehabNinja.
 * No React, so vitest covers them.
 */
import { QuestionKey } from "@/lib/types"

/** Questions not answered yet, in the order they are asked. Placeholders on the result, "Not answered" on the card. */
export function unansweredKeys(order: readonly string[], answers: Partial<Record<string, unknown>>): QuestionKey[] {
  return order.filter((id) => answers[id] === undefined).flatMap((id) => {
    const key = QuestionKey.safeParse(id)
    return key.success ? [key.data] : []
  })
}

/** "I tapped Yes by mistake": the red-flag answer is removed (not set to No), so it shows as not answered. */
export function withoutAnswer<T extends Record<string, unknown>>(answers: T, key: keyof T): T {
  const rest = { ...answers }
  delete rest[key]
  return rest
}
