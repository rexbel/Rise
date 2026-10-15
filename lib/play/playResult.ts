/**
 * RehabNinja -> care team. Pure mapping from a finished set + the four answers to the shared SessionResult,
 * and the patient's closing lines from the same deterministic rules the server runs (lib/rules.ts).
 *
 * rawStands = every completed rep in the set (clean hits and arm-assisted or knees-in reps alike), counted by
 * lib/play/hitMiss.ts snapshot().repCount. It is care-team data only and never rendered on the phone.
 * The phone does not measure asymmetry percent, post-stand pauses, tandem hold, or gait; those stay at
 * "not measured" values, and demo sessions carry the scripted gait/tandem/incontinence the way /p does.
 */

import { closingLines } from "@/lib/feedback"
import { formatCorrection, pickFinding } from "@/lib/play/formatPatient"
import { QUESTION_ORDER } from "@/lib/play/phaseView"
import type { FinishedSet, PatientFeedback, PlayPhase, QuestionAnswers, QuestionId } from "@/lib/play/types"
import { triage } from "@/lib/rules"
import { steadiScore } from "@/lib/steadi"
import {
  SESSION_ID,
  type CheckIn,
  type PoseTier,
  type QuestionKey,
  type Recommendation,
  type SeedPatient,
  type SessionResult,
  type SessionStatus,
  type Symptoms,
  type TriageDecision,
  type Trend,
} from "@/lib/types"

/** `?s=` from an invite link when it is a valid id for this patient; otherwise a fresh `<riseId>-<base36 time>`. */
export function resolvePlaySessionId(riseId: string, param: string | undefined, now: number): string {
  if (param && SESSION_ID.test(param) && param.startsWith(`${riseId}-`)) return param
  return `${riseId}-${now.toString(36)}`
}

/** Board status for a phone phase, or null when the phone has not started (home / how-to). */
export function playStatusFor(phase: PlayPhase): SessionStatus | null {
  switch (phase) {
    case "ready":
    case "frame":
    case "countdown":
      return "setting_up"
    case "live":
    case "stepBack":
      return "testing"
    case "paused":
      return "paused"
    case "questions":
      return "questions"
    case "close":
    case "emergency":
      return "scoring"
    default:
      return null
  }
}

export function lastCheckIn(patient: SeedPatient): CheckIn | undefined {
  return patient.checkins[patient.checkins.length - 1]
}

/** The phone's question ids, as the shared result names them. */
export const QUESTION_KEY: Record<QuestionId, QuestionKey> = {
  pain: "pain_0_10",
  dizzy: "dizzy",
  breath_chest: "short_of_breath_or_chest_pain",
  calf: "calf_pain_or_swelling",
}

/**
 * Questions the patient has not answered, in question order (Leave during the questions, or after "I tapped Yes by
 * mistake" cleared the red-flag answer). Their symptom values are placeholders; the card shows "Not answered".
 */
export function unansweredQuestions(answers: QuestionAnswers): QuestionKey[] {
  return QUESTION_ORDER.filter((id) => answers[id] === undefined).map((id) => QUESTION_KEY[id])
}

/** Unanswered yes/no questions fill as "no" (pain 0) to fit the schema; the result also lists them in questionsUnanswered. */
export function playSymptoms(answers: QuestionAnswers, patient: SeedPatient, demo: boolean): Symptoms {
  return {
    pain_0_10: typeof answers.pain === "number" ? Math.max(0, Math.min(10, Math.round(answers.pain))) : 0,
    dizzy: answers.dizzy === true,
    short_of_breath_or_chest_pain: answers.breath_chest === true,
    calf_pain_or_swelling: answers.calf === true,
    // Not asked on the phone; demo sessions carry the scripted value like the classic flow.
    new_incontinence: demo ? patient.scripted_today.symptoms.new_incontinence : false,
  }
}

export type PlayResultInput = {
  sessionId: string
  patient: SeedPatient
  finishedSet: FinishedSet
  answers: QuestionAnswers
  /** Completed reps (hitMiss repCount), including arm-assisted ones. */
  reps: number
  /** Target from the rule pack (hold exercises = 1). */
  targetReps: number
  /** 1-based rep in progress when the arms finding first fired. */
  armsFromRep?: number
  resumedAfterPause: boolean
  tier: PoseTier
  /** ?demo=1 pitch session. */
  demo: boolean
  /** Any part came from the seeded replay (demo, or the camera fell back). */
  seeded: boolean
  startedAt: number
  finishedAt: number
  patientNote?: string
  /** Leave during the questions: the ones not answered (omitted when every question was answered). */
  questionsUnanswered?: QuestionKey[]
}

export function buildPlayResult(input: PlayResultInput): SessionResult {
  const { patient, finishedSet, demo } = input
  const scripted = patient.scripted_today
  const armsUsed = finishedSet.findings.some((f) => f.id === "arms")
  const rawStands = Math.max(0, Math.floor(input.reps))
  const startedAt = Math.max(0, Math.floor(input.startedAt || input.finishedAt))
  return {
    sessionId: input.sessionId,
    riseId: patient.rise_id,
    protocol: "play_set",
    exerciseId: finishedSet.exerciseId,
    targetReps: Math.max(0, Math.floor(input.targetReps)),
    rawStands,
    armsUsed,
    armsFromRep: armsUsed && input.armsFromRep && input.armsFromRep >= 1 ? input.armsFromRep : undefined,
    steadiScore: steadiScore(rawStands, armsUsed),
    asymmetryPct: 0,
    favoring: null,
    pausesOver3s: 0,
    stoppedEarly: finishedSet.endedBy === "finish_here",
    resumedAfterPause: input.resumedAfterPause,
    tandemHoldS: demo ? scripted.balance_tandem_hold_s : undefined,
    gaitObservations: demo ? (scripted.gait_observations ?? []) : [],
    symptoms: playSymptoms(input.answers, patient, demo),
    patientNote: input.patientNote,
    ...(input.questionsUnanswered?.length ? { questionsUnanswered: input.questionsUnanswered } : {}),
    tier: input.tier,
    demoData: demo || input.seeded || input.tier === "seeded",
    // Only a ?demo=1 run copies scripted fields; a camera fallback replays movement but scripts no answers.
    scripted: demo ? ["new_incontinence", "gait", "tandem"] : [],
    startedAt,
    finishedAt: Math.max(startedAt, Math.floor(input.finishedAt)),
  }
}

export type PlayTrend = Extract<Trend, "same" | "harder"> | "first" | "finished_early"

/**
 * Patient trend for a game set. Rep counts are not comparable to a 30 s test, so a set is never "better":
 * finished early -> finished_early; new arm use vs the last check-in -> harder; otherwise same.
 */
export function playTrend(result: Pick<SessionResult, "stoppedEarly" | "armsUsed">, previous: CheckIn | undefined): PlayTrend {
  if (result.stoppedEarly) return "finished_early"
  if (!previous) return "first"
  if (result.armsUsed && !previous.arms_used) return "harder"
  return "same"
}

export type PlayClose = {
  decision: TriageDecision
  emergency: boolean
  trend: PlayTrend
  recommendation: Recommendation | "finished_early"
  /** One form correction from the set's findings, if any. */
  correction: PatientFeedback | null
  /** trend + next step + closure (or the emergency line alone). */
  lines: string[]
}

/** Same rules as the server card, run on the phone for the closing screen. Never uses the seed's expected_triage. */
export function playClose(result: SessionResult, patient: SeedPatient, finishedSet: FinishedSet, clinicName: string): PlayClose {
  const previous = lastCheckIn(patient)
  const decision = triage(result, previous, patient.episode.post_op_day_today)
  const trend = playTrend(result, previous)
  const recommendation: Recommendation | "finished_early" = result.stoppedEarly ? "finished_early" : decision.recommendation
  const correction = decision.emergency ? null : formatCorrection(pickFinding(finishedSet.findings), finishedSet.exerciseId)
  return {
    decision,
    emergency: decision.emergency,
    trend,
    recommendation,
    correction,
    lines: closingLines({ trend, recommendation, redFlag: decision.emergency, clinicName }),
  }
}

/** 1-based position of a question for "Question N of 4". */
export function questionNumber(id: (typeof QUESTION_ORDER)[number]): number {
  return QUESTION_ORDER.indexOf(id) + 1
}
