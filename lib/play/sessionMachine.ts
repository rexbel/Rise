/**
 * Pure Keep the Line reducer. No timers, I/O, or React.
 * finishedSet is written once and never cleared.
 */

import type {
  Finding,
  PlayAction,
  PlayPhase,
  PlaySession,
  QuestionAnswers,
  QuestionId,
  SessionState,
} from "@/lib/play/types"

const QUESTION_IDS = ["pain", "dizzy", "breath_chest", "calf"] as const

export function createPlaySession(riseId: string, demo = false): PlaySession {
  return {
    riseId,
    demo,
    phase: "howto",
    sessionState: "stable",
    findings: [],
    finishedSet: null,
    answers: {},
  }
}

export function reducePlaySession(state: PlaySession, action: PlayAction): PlaySession {
  switch (action.type) {
    case "BEGIN":
      if (state.phase === "home" || state.phase === "howto") {
        return { ...state, phase: state.demo ? "countdown" : "ready" }
      }
      return state
    case "READY_OK":
      return state.phase === "ready" ? { ...state, phase: "frame" } : state
    case "FRAME_OK":
      return state.phase === "frame" ? { ...state, phase: "countdown" } : state
    case "FRAME_LOST":
      return state
    case "COUNTDOWN_DONE":
      return state.phase === "countdown" ? { ...state, phase: "live" } : state
    case "TRACKING_LOST":
      return state.phase === "live" ? { ...state, phase: "stepBack" } : state
    case "TRACKING_OK":
      return state.phase === "stepBack" ? { ...state, phase: "live" } : state
    case "STOP":
    case "PAUSE":
      if (state.phase === "live" || state.phase === "stepBack") {
        return { ...state, phase: "paused" }
      }
      return state
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
    case "CONFIRM_EMERGENCY":
      return state.phase === "emergencyConfirm" ? { ...state, phase: "emergency" } : state
    case "EMERGENCY_MISTAP":
      if (state.phase === "emergencyConfirm" || state.phase === "emergency") {
        const { breath_chest: _drop, ...rest } = state.answers
        return { ...state, phase: "questions", answers: rest }
      }
      return state
    case "BACK_TO_QUESTIONS":
      if (!state.finishedSet) return state
      if (state.phase === "close" || state.phase === "emergency" || state.phase === "emergencyConfirm") {
        return { ...state, phase: "questions" }
      }
      return state
    case "PRESENTER_SKIP_TO_LIVE":
      if (LIVE_SKIP_FROM.has(state.phase)) {
        return { ...state, phase: "live" }
      }
      return state
    case "PRESENTER_JUMP_TO_QUESTIONS":
      if (!state.finishedSet) return state
      return { ...state, phase: "questions" }
    default:
      return state
  }
}

const LIVE_SKIP_FROM = new Set<PlayPhase>(["home", "howto", "ready", "frame", "countdown"])

const END_SET_FROM = new Set<PlayPhase>(["live", "stepBack", "paused", "countdown"])

function endSet(state: PlaySession, durationMs: number, endedBy: "script" | "finish_here"): PlaySession {
  if (!END_SET_FROM.has(state.phase)) return state
  if (state.finishedSet) {
    return { ...state, phase: "questions" }
  }
  const finishedSet = {
    findings: state.findings,
    durationMs,
    endedBy,
  }
  return {
    ...state,
    finishedSet,
    sessionState: sessionStateFromFindings(finishedSet.findings),
    phase: "questions",
  }
}

function applyAnswer(state: PlaySession, id: QuestionId, value: number | boolean): PlaySession {
  if (!state.finishedSet) return state
  const onQuestions =
    state.phase === "questions" ||
    state.phase === "close" ||
    state.phase === "emergencyConfirm" ||
    state.phase === "emergency"
  if (!onQuestions) return state

  const answers: QuestionAnswers = { ...state.answers, [id]: value }
  if (id === "breath_chest" && value === true) {
    return { ...state, answers, phase: "emergencyConfirm" }
  }
  if (id === "breath_chest" && value === false && allAnswered(answers) && answers.breath_chest !== true) {
    return { ...state, answers, phase: "close" }
  }
  if (allAnswered(answers) && answers.breath_chest !== true) {
    return { ...state, answers, phase: "close" }
  }
  return { ...state, answers, phase: "questions" }
}

function allAnswered(answers: QuestionAnswers): boolean {
  return QUESTION_IDS.every((id) => answers[id] !== undefined)
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
