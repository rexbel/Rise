/**
 * RehabNinja session contracts. Phone column and clinic strip both read PlaySession.
 * Do not put STEADI or stand counts here. Seed schema is unchanged.
 */

import type { ExerciseId } from "@/lib/play/programs"

export type SessionState = "stable" | "compensating" | "overloaded" | "unsafe" | "recovery"

export type FindingId = "valgus" | "speed" | "arms" | "asymmetry"

export type FindingSeverity = "soft" | "hard"

export interface Finding {
  id: FindingId
  severity: FindingSeverity
  atMs: number
}

export interface PatientFeedback {
  what: string
  why: string
  action: string
}

/** COCO-17: nose, eyes, ears, shoulders, elbows, wrists, hips, knees, ankles. x/y normalized 0..1. */
export type Keypoint = { x: number; y: number; score: number }

export type Keypoints17 = [
  Keypoint,
  Keypoint,
  Keypoint,
  Keypoint,
  Keypoint,
  Keypoint,
  Keypoint,
  Keypoint,
  Keypoint,
  Keypoint,
  Keypoint,
  Keypoint,
  Keypoint,
  Keypoint,
  Keypoint,
  Keypoint,
  Keypoint,
]

export interface PoseFrame {
  t: number
  keypoints: Keypoints17 | null
}

export interface PoseBus {
  start(): void
  stop(): void
  subscribe(cb: (f: PoseFrame) => void): () => void
}

export type PlayPhase =
  | "home"
  | "howto"
  | "ready"
  | "frame"
  | "countdown"
  | "live"
  | "stepBack"
  | "paused"
  | "questions"
  | "emergencyConfirm"
  | "emergency"
  | "close"

export type QuestionId = "pain" | "dizzy" | "breath_chest" | "calf"

export type QuestionAnswers = Partial<Record<QuestionId, number | boolean>>

export interface FinishedSet {
  findings: Finding[]
  durationMs: number
  endedBy: "script" | "finish_here"
  exerciseId: ExerciseId
}

export interface PlaySession {
  riseId: string
  demo: boolean
  phase: PlayPhase
  sessionState: SessionState
  findings: Finding[]
  finishedSet: FinishedSet | null
  answers: QuestionAnswers
  exerciseId: ExerciseId
}

/** Clinic strip is this object — never hardcoded copy. */
export type ClinicStripView = PlaySession

export type PlayAction =
  | { type: "BEGIN" }
  | { type: "READY_OK" }
  | { type: "FRAME_OK" }
  | { type: "FRAME_LOST" }
  | { type: "COUNTDOWN_DONE" }
  | { type: "TRACKING_LOST" }
  | { type: "TRACKING_OK" }
  | { type: "STOP" }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "FINISH_HERE"; durationMs: number }
  | { type: "SET_COMPLETE"; durationMs: number }
  | { type: "FINDING"; finding: Finding }
  | { type: "ANSWER"; id: QuestionId; value: number | boolean }
  | { type: "CONFIRM_EMERGENCY" }
  | { type: "EMERGENCY_MISTAP" }
  | { type: "BACK_TO_QUESTIONS" }
  | { type: "SELECT_EXERCISE"; exerciseId: ExerciseId }
  | { type: "PRESENTER_SKIP_TO_LIVE" }
  | { type: "PRESENTER_JUMP_TO_QUESTIONS" }
