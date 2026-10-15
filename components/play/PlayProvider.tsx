"use client"

/**
 * RehabNinja session state + the care-team relay. Every transition goes through `apply`, which reduces the
 * pure machine and sends the matching RepEvents (fire-and-forget, lib/session-client). Reaching close or
 * emergency builds the play_set SessionResult and sends it; re-answering resends it.
 */
import { createContext, type ReactNode, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { CosmosLook } from "@/lib/play/cosmosClient"
import { rulePack } from "@/lib/play/exerciseRules"
import { buildPlayResult, playStatusFor, unansweredQuestions } from "@/lib/play/playResult"
import { createPlaySession, reducePlaySession } from "@/lib/play/sessionMachine"
import type { PlayAction, PlaySession } from "@/lib/play/types"
import { subscribeCaption, subscribeSpeaking, unlockPlayback } from "@/lib/play/speak"
import { setVoiceStopEnabled } from "@/lib/play/voiceStop"
import { sendEvent, sendResult, setInviteToken } from "@/lib/session-client"
import type { PoseTier, QuestionKey, SeedPatient, SessionResult, SessionStatus } from "@/lib/types"

export type HitLogKind = "hit" | "miss"

type PlayContextValue = {
  session: PlaySession
  demo: boolean
  dispatch: (action: PlayAction) => void
  dispatchMany: (actions: PlayAction[]) => void
  begin: () => void
  caption: string | null
  speaking: boolean
  elapsedMs: number
  setElapsedMs: (ms: number) => void
  voiceStopOn: boolean
  setVoiceStopOn: (on: boolean) => void
  hitCount: number
  hitLog: HitLogKind[]
  pushHitLog: (kind: HitLogKind) => void
  resetHits: () => void
  /** Cosmos second looks for the clinic strip, newest last (care-team only). */
  cosmosLooks: CosmosLook[]
  addCosmosLook: (look: CosmosLook) => void
  resolveCosmosLook: (id: string, look: CosmosLook) => void
  sessionId: string
  /** True when sessionId came from a valid console invite (?i=, checked on the server). */
  invited: boolean
  /** The invite token: sent with every write (lib/session-client) and kept on the "Your week" link. null if uninvited. */
  inviteToken: string | null
  clinicName: string
  /** Last result sent to the care team (null until close or emergency). */
  result: SessionResult | null
  /** LivePlay: a rep finished (any form). `count` = completed reps so far. */
  recordRep: (count: number) => void
  /** LivePlay: which pose source feeds the set. */
  setSetSource: (tier: PoseTier, seeded: boolean) => void
  /** Re-send the result with the patient's note. Resolves true once the server acknowledged it. */
  sendNote: (note: string) => Promise<boolean>
  /** Delivery of the latest result: the emergency screen says "your care team is being told" only when "ok". */
  delivery: "idle" | "sending" | "ok" | "failed"
  /** Send the latest result again (Try again after it did not go through). Resolves true once acknowledged. */
  retryResult: () => Promise<boolean>
}

const PlayContext = createContext<PlayContextValue | null>(null)

export function PlayProvider({
  patient,
  sessionId,
  invited,
  inviteToken,
  clinicName,
  demo,
  children,
}: {
  patient: SeedPatient
  sessionId: string
  invited: boolean
  inviteToken: string | null
  clinicName: string
  demo: boolean
  children: ReactNode
}) {
  const [session, setSession] = useState(() => createPlaySession(patient.rise_id, demo))
  // Every write for this session carries the invite token (checked on the server).
  useLayoutEffect(() => setInviteToken(inviteToken), [inviteToken])
  const sessionRef = useRef(session)
  useLayoutEffect(() => {
    sessionRef.current = session
  }, [session])
  const [caption, setCaption] = useState<string | null>(null)
  const [speaking, setSpeaking] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [voiceStopOn, setVoiceStopOn] = useState(false)
  const [hitCount, setHitCount] = useState(0)
  const [hitLog, setHitLog] = useState<HitLogKind[]>([])
  const [cosmosLooks, setCosmosLooks] = useState<CosmosLook[]>([])
  const [result, setResult] = useState<SessionResult | null>(null)
  const resultRef = useRef<SessionResult | null>(null)
  const [delivery, setDelivery] = useState<"idle" | "sending" | "ok" | "failed">("idle")
  const deliverySeq = useRef(0)
  /** Send a result; only the newest send may update the delivery state. */
  const deliver = useCallback(async (out: SessionResult) => {
    const seq = ++deliverySeq.current
    setDelivery("sending")
    const ok = await sendResult(out)
    if (seq === deliverySeq.current) setDelivery(ok ? "ok" : "failed")
    return ok
  }, [])
  const relay = useRef({
    lastStatus: null as SessionStatus | null,
    reps: 0,
    armsFromRep: undefined as number | undefined,
    resumed: false,
    startedAt: 0,
    finishedAt: 0,
    tier: "seeded" as PoseTier,
    seeded: demo,
  })

  const addCosmosLook = useCallback((look: CosmosLook) => {
    setCosmosLooks((prev) => [...prev.filter((l) => l.id !== look.id), look].slice(-5))
  }, [])

  const resolveCosmosLook = useCallback((id: string, look: CosmosLook) => {
    setCosmosLooks((prev) => (prev.some((l) => l.id === id) ? prev.map((l) => (l.id === id ? look : l)) : [...prev, look].slice(-5)))
  }, [])

  const pushHitLog = useCallback((kind: HitLogKind) => {
    setHitLog((prev) => [...prev.slice(-47), kind])
    if (kind === "hit") setHitCount((n) => n + 1)
  }, [])

  const resetHits = useCallback(() => {
    setHitCount(0)
    setHitLog([])
    setCosmosLooks([])
    relay.current.reps = 0
    relay.current.armsFromRep = undefined
  }, [])

  /** Side effects of one transition: board events, then the result on close / emergency. */
  const observe = useCallback(
    (before: PlaySession, next: PlaySession, action: PlayAction) => {
      const r = relay.current
      const now = Date.now()
      if (next.phase === "live" && r.startedAt === 0) r.startedAt = now
      // Stop during the countdown only cancels it (nothing was testing); the board hears about a live Stop.
      if (action.type === "STOP" && before.phase !== next.phase && next.phase === "paused") {
        sendEvent({ type: "stop", sessionId, reason: "button", at: now })
      }
      if (action.type === "RESUME" && before.phase === "paused" && next.phase === "live") {
        r.resumed = true
        sendEvent({ type: "resume", sessionId, at: now })
      }
      if (!before.findings.some((f) => f.id === "arms") && next.findings.some((f) => f.id === "arms")) {
        r.armsFromRep = r.reps + 1
      }
      if (!before.finishedSet && next.finishedSet) {
        r.finishedAt = now
        if (next.finishedSet.endedBy === "finish_here") sendEvent({ type: "finished_early", sessionId, at: now })
      }
      const status = playStatusFor(next.phase)
      if (status && status !== r.lastStatus) {
        r.lastStatus = status
        sendEvent({ type: "status", sessionId, status, tier: r.startedAt ? r.tier : undefined, at: now })
      }
      const send = (questionsUnanswered?: QuestionKey[]) => {
        if (!next.finishedSet) return
        const out = buildPlayResult({
          sessionId,
          patient,
          finishedSet: next.finishedSet,
          answers: next.answers,
          reps: r.reps,
          targetReps: rulePack(next.finishedSet.exerciseId).targetReps,
          armsFromRep: r.armsFromRep,
          resumedAfterPause: r.resumed,
          tier: r.tier,
          demo,
          seeded: r.seeded,
          startedAt: r.startedAt,
          finishedAt: r.finishedAt || now,
          questionsUnanswered,
        })
        resultRef.current = out
        setResult(out)
        void deliver(out)
      }
      const closing = next.phase === "close" || next.phase === "emergency"
      if (closing && before.phase !== next.phase && next.finishedSet) send()
      // "I tapped Yes by mistake": re-send with the red-flag answer cleared (listed as not answered), so the card
      // never keeps a red flag the patient took back, and the server records the retraction.
      if (action.type === "EMERGENCY_MISTAP" && next.phase === "questions") send(unansweredQuestions(next.answers))
      if (action.type === "LEAVE" && next.phase === "left") {
        // Leaving the questions after a finished set sends the result with the questions not answered; anywhere
        // else (no result yet) the board shows "Left the check-in" with the step.
        if (before.phase === "questions" && next.finishedSet) send(unansweredQuestions(next.answers))
        else if (next.leftFrom) sendEvent({ type: "left_flow", sessionId, step: next.leftFrom, at: now })
      }
    },
    [sessionId, patient, demo, deliver],
  )

  const apply = useCallback(
    (actions: PlayAction[]) => {
      let state = sessionRef.current
      for (const action of actions) {
        const next = reducePlaySession(state, action)
        if (next !== state) observe(state, next, action)
        state = next
      }
      sessionRef.current = state
      setSession(state)
    },
    [observe],
  )

  const dispatch = useCallback((action: PlayAction) => apply([action]), [apply])
  const dispatchMany = useCallback((actions: PlayAction[]) => apply(actions), [apply])

  const recordRep = useCallback(
    (count: number) => {
      const r = relay.current
      if (count <= r.reps) return
      r.reps = count
      const armsUsed = sessionRef.current.findings.some((f) => f.id === "arms")
      sendEvent({ type: "rep", sessionId, count, armsUsed, at: Date.now() })
    },
    [sessionId],
  )

  const setSetSource = useCallback(
    (tier: PoseTier, seeded: boolean) => {
      relay.current.tier = tier
      relay.current.seeded = demo || seeded
    },
    [demo],
  )

  const sendNote = useCallback(
    async (note: string) => {
      const base = resultRef.current
      const text = note.trim()
      if (!base || !text) return false
      const out = { ...base, patientNote: text.slice(0, 2000) }
      resultRef.current = out
      setResult(out)
      return deliver(out)
    },
    [deliver],
  )

  const retryResult = useCallback(async () => {
    const base = resultRef.current
    return base ? deliver(base) : false
  }, [deliver])

  useEffect(() => subscribeCaption(setCaption), [])
  useEffect(() => subscribeSpeaking(setSpeaking), [])
  useEffect(() => {
    const on = voiceStopOn && !demo
    setVoiceStopEnabled(on, () => {
      if (sessionRef.current.phase === "live" || sessionRef.current.phase === "stepBack") {
        dispatch({ type: "STOP" })
      }
    })
    return () => setVoiceStopEnabled(false, null)
  }, [voiceStopOn, demo, dispatch])

  const begin = useCallback(() => {
    unlockPlayback()
    dispatch({ type: "BEGIN" })
  }, [dispatch])

  const value = useMemo(
    () => ({
      session,
      demo,
      dispatch,
      dispatchMany,
      begin,
      caption,
      speaking,
      elapsedMs,
      setElapsedMs,
      voiceStopOn,
      setVoiceStopOn,
      hitCount,
      hitLog,
      pushHitLog,
      resetHits,
      cosmosLooks,
      addCosmosLook,
      resolveCosmosLook,
      sessionId,
      invited,
      inviteToken,
      clinicName,
      result,
      delivery,
      recordRep,
      setSetSource,
      sendNote,
      retryResult,
    }),
    [
      session,
      demo,
      dispatch,
      dispatchMany,
      begin,
      caption,
      speaking,
      elapsedMs,
      voiceStopOn,
      hitCount,
      hitLog,
      pushHitLog,
      resetHits,
      cosmosLooks,
      addCosmosLook,
      resolveCosmosLook,
      sessionId,
      invited,
      inviteToken,
      clinicName,
      result,
      delivery,
      recordRep,
      setSetSource,
      sendNote,
      retryResult,
    ],
  )

  return <PlayContext.Provider value={value}>{children}</PlayContext.Provider>
}

export function usePlay(): PlayContextValue {
  const ctx = useContext(PlayContext)
  if (!ctx) throw new Error("usePlay must be used inside PlayProvider")
  return ctx
}
