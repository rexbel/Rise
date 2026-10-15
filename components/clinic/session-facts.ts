/**
 * Console labels for how a check-in was run: a real invite or a demo, which safety checks the patient confirmed,
 * and why a real check-in couldn't be completed. Pure (no React), so vitest covers them.
 */
import type { SessionSnapshot, TriageCard } from "@/lib/types"

type Setup = NonNullable<SessionSnapshot["setup"]>
export type SetupCheck = Setup["confirmed"][number]
export type CouldNotCompleteReason = NonNullable<SessionSnapshot["couldNotComplete"]>["reason"]

/** "real" = a console invite for the patient's own camera; "demo" = an invite for the demo recording; "unlinked" = no invite. */
export function checkInKind(s: Pick<SessionSnapshot, "inviteDemo">): "real" | "demo" | "unlinked" {
  if (s.inviteDemo === false) return "real"
  if (s.inviteDemo === true) return "demo"
  return "unlinked"
}

export const CHECK_LABEL: Record<SetupCheck, string> = {
  chair: "chair",
  helper: "helper nearby",
  phone: "phone placed",
  ready: "ready card (chair, helper, feeling OK)",
}

/** The classic check-in asks these three, one screen each; RehabNinja asks one combined "ready" card. */
const CLASSIC_CHECKS: SetupCheck[] = ["chair", "helper", "phone"]

export type SetupSummary = {
  /** confirmed = every check for its surface; partial = some; skipped = a demo skipped them; none = nothing yet. */
  state: "confirmed" | "partial" | "skipped" | "none"
  label: string
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join("")
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`
}

/** One compact line for the session page's "Safety checks". Words carry the meaning; icons only reinforce. */
export function setupSummary(s: Pick<SessionSnapshot, "setup" | "surface">): SetupSummary {
  const setup = s.setup
  const confirmed = setup?.confirmed ?? []
  if (setup?.skipped) {
    return {
      state: "skipped",
      label: confirmed.length ? `Skipped (demo) after confirming ${list(confirmed.map((c) => CHECK_LABEL[c]))}` : "Skipped (demo)",
    }
  }
  if (confirmed.length === 0) return { state: "none", label: "Not confirmed yet" }
  const expected = confirmed.includes("ready") || s.surface === "play" ? (["ready"] as SetupCheck[]) : CLASSIC_CHECKS
  const missing = expected.filter((c) => !confirmed.includes(c))
  const done = `Confirmed ${list(confirmed.map((c) => CHECK_LABEL[c]))}`
  if (missing.length === 0) return { state: "confirmed", label: done }
  return { state: "partial", label: `${done}; not yet ${list(missing.map((c) => CHECK_LABEL[c]))}` }
}

export const COULD_NOT_COMPLETE_LABEL: Record<CouldNotCompleteReason, string> = {
  camera: "camera problem",
  tracker: "tracker problem",
}

/** "Couldn't complete: camera problem". */
export function couldNotCompleteText(reason: CouldNotCompleteReason): string {
  return `Couldn't complete: ${COULD_NOT_COMPLETE_LABEL[reason]}`
}

/**
 * The phone sends booleans for every symptom, but a red-flag Yes ends the questions before the calf question,
 * and incontinence is never asked on the phone (demo sessions carry the scripted value). Showing "No" for
 * those would read as a negative answer the patient never gave. A question the patient left without answering
 * (questionsUnanswered) is "Not answered": it was put to them, so neither "No" nor "Not asked".
 */
export function symptomAsked(
  card: Pick<TriageCard, "symptoms" | "scripted" | "questionsUnanswered">,
  key: keyof TriageCard["symptoms"],
): "asked" | "not_asked" | "not_answered" | "scripted" {
  if (key !== "new_incontinence" && card.questionsUnanswered?.includes(key)) return "not_answered"
  if (key === "pain_0_10") return "asked"
  if (key === "calf_pain_or_swelling" && card.symptoms.short_of_breath_or_chest_pain) return "not_asked"
  if (key === "new_incontinence") return card.scripted.includes("new_incontinence") ? "scripted" : "not_asked"
  return "asked"
}
