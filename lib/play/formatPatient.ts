/**
 * One patient correction from findings. Copy is locked JSON only.
 * Emergency (breath) beats a stable pose. HARD first, then valgus > arms > asymmetry > speed.
 */

import corrections from "@/content/form-corrections.json"
import lines from "@/content/patient-lines.json"
import { closingLines, type ClosingInput } from "@/lib/feedback"
import { hasRedFlag } from "@/lib/play/sessionMachine"
import type { Finding, FindingId, PatientFeedback, QuestionAnswers } from "@/lib/play/types"

const SOFT_ORDER: FindingId[] = ["valgus", "arms", "asymmetry", "speed"]

export function pickFinding(findings: Finding[], suppress: FindingId[] = []): Finding | null {
  const usable = findings.filter((f) => !suppress.includes(f.id))
  const hard = usable.filter((f) => f.severity === "hard")
  if (hard.length > 0) {
    return SOFT_ORDER.map((id) => hard.find((f) => f.id === id)).find((f) => f != null) ?? hard[0]
  }
  for (const id of SOFT_ORDER) {
    const hit = usable.find((f) => f.id === id)
    if (hit) return hit
  }
  return null
}

export function formatCorrection(finding: Finding | null): PatientFeedback | null {
  if (!finding) return null
  const row = corrections[finding.id]
  return { what: row.what, why: row.why, action: row.action }
}

export function formatPlayClose(
  findings: Finding[],
  answers: QuestionAnswers,
  closing: ClosingInput,
  suppress: FindingId[] = [],
): { emergency: boolean; correction: PatientFeedback | null; closingLines: string[] } {
  if (hasRedFlag(answers) || closing.redFlag) {
    return {
      emergency: true,
      correction: null,
      closingLines: [lines.emergency.line, lines.emergency.care_team_told, lines.emergency.follow_up],
    }
  }
  const finding = pickFinding(findings, suppress)
  return {
    emergency: false,
    correction: formatCorrection(finding),
    closingLines: closingLines({ ...closing, redFlag: false }),
  }
}
