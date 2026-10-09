"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { createPlaySession, reducePlaySession } from "@/lib/play/sessionMachine"
import type { PlayAction, PlaySession } from "@/lib/play/types"
import { subscribeCaption, subscribeSpeaking, unlockPlayback } from "@/lib/play/speak"
import { setVoiceStopEnabled } from "@/lib/play/voiceStop"

export type HitLogKind = "hit" | "miss"

type PlayContextValue = {
  session: PlaySession
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
}

const PlayContext = createContext<PlayContextValue | null>(null)

export function PlayProvider({
  riseId,
  demo,
  children,
}: {
  riseId: string
  demo: boolean
  children: ReactNode
}) {
  const [session, setSession] = useState(() => createPlaySession(riseId, demo))
  const sessionRef = useRef(session)
  sessionRef.current = session
  const [caption, setCaption] = useState<string | null>(null)
  const [speaking, setSpeaking] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [voiceStopOn, setVoiceStopOn] = useState(false)
  const [hitCount, setHitCount] = useState(0)
  const [hitLog, setHitLog] = useState<HitLogKind[]>([])

  const pushHitLog = useCallback((kind: HitLogKind) => {
    setHitLog((prev) => [...prev.slice(-47), kind])
    if (kind === "hit") setHitCount((n) => n + 1)
  }, [])

  const resetHits = useCallback(() => {
    setHitCount(0)
    setHitLog([])
  }, [])

  const dispatch = useCallback((action: PlayAction) => {
    sessionRef.current = reducePlaySession(sessionRef.current, action)
    setSession(sessionRef.current)
  }, [])

  const dispatchMany = useCallback((actions: PlayAction[]) => {
    sessionRef.current = actions.reduce(reducePlaySession, sessionRef.current)
    setSession(sessionRef.current)
  }, [])

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
    }),
    [
      session,
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
    ],
  )

  return <PlayContext.Provider value={value}>{children}</PlayContext.Provider>
}

export function usePlay(): PlayContextValue {
  const ctx = useContext(PlayContext)
  if (!ctx) throw new Error("usePlay must be used inside PlayProvider")
  return ctx
}
