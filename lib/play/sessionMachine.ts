/**
 * Pure RehabNinja reducer. No timers, I/O, or React.
 * finishedSet is written once and never cleared.
 * A Yes to the breath/chest question goes straight to the emergency screen (no confirm step first);
 * EMERGENCY_MISTAP is the undo that returns to that question.
 * BACK goes one step back in the current flow and keeps every answer; LEAVE ends the flow on a calm screen.
 */

import type { ExerciseId } from "@/lib/play/programs"
import { QUESTION_ORDER } from "@/lib/play/phaseView"
import type {
  Finding,
  PlayAction,
  PlayPhase,
  PlaySession,
  QuestionAnswers,
  QuestionId,
  SessionState,
} from "@/lib/play/types"
import type { FlowStep } from "@/lib/types"

const QUESTION_IDS = ["pain", "dizzy", "breath_chest", "calf"] as const

/** Closing steps: tip (optional), how today went, note. SessionReport clamps to the steps it shows. */
const MAX_CLOSE_STEP = 2

export function createPlaySession(riseId: string, demo = false, exerciseId: ExerciseId = "sit_to_stand"): PlaySession {
  return {
    riseId,
    demo,
    phase: "howto",
    sessionState: "stable",
    findings: [],
    finishedSet: null,
    answers: {},
    exerciseId,
  }
}

export function reducePlaySession(state: PlaySession, action: PlayAction): PlaySession {
  switch (action.type) {
    case "SELECT_EXERCISE":
      if (state.finishedSet) return state
      if (state.phase === "howto" || state.phase === "home" || state.phase === "ready") {
        return { ...state, exerciseId: action.exerciseId }
      }
      return state
    case "BEGIN":
      if (state.phase === "home" || state.phase === "howto") {
        return { ...state, phase: state.demo ? "countdown" : "ready" }
      }
      return state
    case "READY_OK":
      return state.phase === "ready" ? { ...state, phase: "frame" } : state
    case "FRAME_OK":
      return state.phase === "frame" ? { ...state, phase: "countdown", cameraFailed: !!action.cameraFailed } : state
    case "FRAME_LOST":
      return state
    case "COUNTDOWN_DONE":
      return state.phase === "countdown" ? { ...state, phase: "live" } : state
    case "TRACKING_LOST":
      return state.phase === "live" ? { ...state, phase: "stepBack" } : state
    case "TRACKING_OK":
      return state.phase === "stepBack" ? { ...state, phase: "live" } : state
    case "STOP":
      // Stop during 3-2-1: the set must not start. Back to framing (a demo has no framing: back to the start).
      if (state.phase === "countdown") return { ...state, phase: state.demo ? "howto" : "frame" }
      return pause(state)
    case "PAUSE":
      return pause(state)
    case "RESUME":
      if (state.phase === "paused" && state.finishedSet === null) {
        return { ...state, phase: "live" }
      }
      return state
    case "FINISH_HERE":
      return endSet(state, action.durationMs, "finish_here")
    case "SET_COMPLETE":
      return endSet(state, action.durationMs, "script")
    case "FINDING":
      if (state.phase !== "live" && state.phase !== "stepBack") return state
      if (state.finishedSet) return state
      {
        const findings = [...state.findings, action.finding]
        return { ...state, findings, sessionState: sessionStateFromFindings(findings) }
      }
    case "ANSWER":
      return applyAnswer(state, action.id, action.value)
    case "EMERGENCY_MISTAP":
      if (state.phase === "emergency") {
        const rest = { ...state.answers }
        delete rest.breath_chest
        return { ...state, phase: "questions", answers: rest, question: "breath_chest" }
      }
      return state
    case "BACK_TO_QUESTIONS":
      if (!state.finishedSet) return state
      if (state.phase === "close" || state.phase === "emergency") {
        return { ...state, phase: "questions", answers: {}, question: undefined, closeStep: 0 }
      }
      return state
    case "PRESENTER_SKIP_TO_LIVE":
      if (LIVE_SKIP_FROM.has(state.phase)) {
        return { ...state, phase: "live" }
      }
      return state
    case "PRESENTER_JUMP_TO_QUESTIONS":
      if (!state.finishedSet) return state
      return { ...state, phase: "questions", answers: {}, question: undefined, closeStep: 0 }
    case "BACK":
      return back(state)
    case "CLOSE_NEXT":
      if (state.phase !== "close") return state
      return { ...state, closeStep: Math.min(MAX_CLOSE_STEP, (state.closeStep ?? 0) + 1) }
    case "LEAVE":
      if (!LEAVE_FROM.has(state.phase)) return state
      return { ...state, phase: "left", leftFrom: action.step ?? flowStepFor(state.phase) ?? "welcome" }
    default:
      return state
  }
}

const LIVE_SKIP_FROM = new Set<PlayPhase>(["home", "howto", "ready", "frame", "countdown"])

const END_SET_FROM = new Set<PlayPhase>(["live", "stepBack", "paused", "countdown"])

/**
 * Where Leave applies. Not the emergency screen (911 first; its way back is "I tapped Yes by mistake"), not the
 * closing (the result is in; its way out is Done), and not twice. live/stepBack only for the camera help screen.
 */
const LEAVE_FROM = new Set<PlayPhase>(["home", "howto", "ready", "frame", "countdown", "live", "stepBack", "paused", "questions"])

function pause(state: PlaySession): PlaySession {
  if (state.phase === "live" || state.phase === "stepBack") return { ...state, phase: "paused" }
  return state
}

function back(state: PlaySession): PlaySession {
  switch (state.phase) {
    case "ready":
      return { ...state, phase: "howto" }
    case "frame":
      return { ...state, phase: "ready" }
    case "questions": {
      // An answered red-flag Yes always stands until "I tapped Yes by mistake": Back can't step around it.
      if (hasRedFlag(state.answers)) return { ...state, phase: "emergency" }
      const prev = previousQuestion(currentQuestion(state))
      return prev ? { ...state, question: prev } : state
    }
    case "close": {
      const step = state.closeStep ?? 0
      return step > 0 ? { ...state, closeStep: step - 1 } : state
    }
    default:
      return state
  }
}

function endSet(state: PlaySession, durationMs: number, endedBy: "script" | "finish_here"): PlaySession {
  if (!END_SET_FROM.has(state.phase)) return state
  if (state.finishedSet) {
    return { ...state, phase: "questions" }
  }
  const finishedSet = {
    findings: state.findings,
    durationMs,
    endedBy,
    exerciseId: state.exerciseId,
  }
  return {
    ...state,
    finishedSet,
    sessionState: sessionStateFromFindings(finishedSet.findings),
    phase: "questions",
    question: undefined,
  }
}

function applyAnswer(state: PlaySession, id: QuestionId, value: number | boolean): PlaySession {
  if (!state.finishedSet) return state
  if (state.phase !== "questions") return state

  const answers: QuestionAnswers = { ...state.answers, [id]: value }
  if (id === "breath_chest" && value === true) {
    return { ...state, answers, phase: "emergency", question: id }
  }
  // Forward one question at a time, so going Back and changing an answer walks through the later ones again.
  const after = QUESTION_ORDER[QUESTION_ORDER.indexOf(id) + 1]
  if (after) return { ...state, answers, phase: "questions", question: after }
  if (allAnswered(answers)) return { ...state, answers, phase: "close", question: undefined, closeStep: 0 }
  return { ...state, answers, phase: "questions", question: undefined }
}

function allAnswered(answers: QuestionAnswers): boolean {
  return QUESTION_IDS.every((id) => answers[id] !== undefined)
}

/** The question on screen: the cursor Back moved, else the first one not answered yet. */
export function currentQuestion(state: Pick<PlaySession, "question" | "answers">): QuestionId {
  if (state.question) return state.question
  return QUESTION_ORDER.find((id) => state.answers[id] === undefined) ?? QUESTION_ORDER[QUESTION_ORDER.length - 1]
}

/** Exactly one question back, or null on the first. Never jumps further. */
export function previousQuestion(id: QuestionId): QuestionId | null {
  const i = QUESTION_ORDER.indexOf(id)
  return i > 0 ? QUESTION_ORDER[i - 1] : null
}

/** The flow step a phase reports when the patient leaves from it (the board shows "Left at <step>"). */
export function flowStepFor(phase: PlayPhase): FlowStep | null {
  switch (phase) {
    case "home":
    case "howto":
      return "welcome"
    case "ready":
      return "setup"
    case "frame":
      return "frame"
    case "countdown":
      return "countdown"
    case "live":
    case "stepBack":
    case "paused":
      return "test"
    case "questions":
    case "emergency":
      return "questions"
    case "close":
      return "closing"
    default:
      return null
  }
}

/**
 * The ways back or out on each phase, for the flow header and its tests. Every phase has at least one:
 * Leave (with a confirm), Done (closing), Stop (countdown and the live set), or "I tapped Yes by mistake" (emergency).
 */
export type PlayExits = {
  back: boolean
  leave: "confirm" | "done" | null
  stop: boolean
  mistap: boolean
}

export function playExits(state: PlaySession): PlayExits {
  const none: PlayExits = { back: false, leave: null, stop: false, mistap: false }
  switch (state.phase) {
    case "home":
    case "howto":
    case "paused":
      return { ...none, leave: "confirm" }
    case "ready":
    case "frame":
      return { ...none, back: true, leave: "confirm" }
    case "countdown":
      return { ...none, stop: true, leave: "confirm" }
    case "live":
    case "stepBack":
      // The set keeps its own Stop and Pause; nothing is duplicated over the game.
      return { ...none, stop: true }
    case "questions":
      return { ...none, back: hasRedFlag(state.answers) || previousQuestion(currentQuestion(state)) !== null, leave: "confirm" }
    case "emergency":
      return { ...none, mistap: true }
    case "close":
      return { ...none, back: (state.closeStep ?? 0) > 0, leave: "done" }
    case "left":
      return none
  }
}

export function sessionStateFromFindings(findings: Finding[]): SessionState {
  if (findings.some((f) => f.severity === "hard")) return "unsafe"
  if (findings.some((f) => f.id === "speed")) return "overloaded"
  if (findings.length > 0) return "compensating"
  return "stable"
}

export function hasRedFlag(answers: QuestionAnswers): boolean {
  return answers.breath_chest === true
}
