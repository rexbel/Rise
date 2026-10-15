/**
 * RehabNinja session contracts. Phone column and clinic strip both read PlaySession.
 * Do not put STEADI or stand counts here. Seed schema is unchanged.
 */

import type { ExerciseId } from "@/lib/play/programs"
import type { FlowStep } from "@/lib/types"

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
  | "emergency"
  | "close"
  /** The patient chose Leave (and confirmed). leftFrom says where; answers and finishedSet are kept. */
  | "left"

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
  /** The framing step could not use the camera or the body tracker, so the set goes straight to demo replay. */
  cameraFailed?: boolean
  /** The question on screen. Back moves it one question back and keeps every answer. Unset = first unanswered. */
  question?: QuestionId
  /** Index of the closing step on screen (SessionReport clamps it to its own steps). */
  closeStep?: number
  /** Where the patient left from (phase "left"). */
  leftFrom?: FlowStep
}

/** Clinic strip is this object — never hardcoded copy. */
export type ClinicStripView = PlaySession

export type PlayAction =
  | { type: "BEGIN" }
  | { type: "READY_OK" }
  | { type: "FRAME_OK"; cameraFailed?: boolean }
  | { type: "FRAME_LOST" }
  | { type: "COUNTDOWN_DONE" }
  | { type: "TRACKING_LOST" }
  | { type: "TRACKING_OK" }
  /** Live set: pause. Countdown: cancel back to framing (or the start screen in a demo). */
  | { type: "STOP" }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "FINISH_HERE"; durationMs: number }
  | { type: "SET_COMPLETE"; durationMs: number }
  | { type: "FINDING"; finding: Finding }
  | { type: "ANSWER"; id: QuestionId; value: number | boolean }
  | { type: "EMERGENCY_MISTAP" }
  | { type: "BACK_TO_QUESTIONS" }
  | { type: "SELECT_EXERCISE"; exerciseId: ExerciseId }
  | { type: "PRESENTER_SKIP_TO_LIVE" }
  | { type: "PRESENTER_JUMP_TO_QUESTIONS" }
  /** One step back in the current flow (ready, frame, questions, closing steps). Never past an answered red flag. */
  | { type: "BACK" }
  /** Next closing step. */
  | { type: "CLOSE_NEXT" }
  /** Leave (confirmed). step overrides the phase's own step, e.g. "help" from the camera help screen. */
  | { type: "LEAVE"; step?: FlowStep }
