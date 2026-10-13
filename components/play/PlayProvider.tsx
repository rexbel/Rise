"use client"

import { createContext, type ReactNode, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { CosmosLook } from "@/lib/play/cosmosClient"
import { createPlaySession, reducePlaySession } from "@/lib/play/sessionMachine"
import type { PlayAction, PlaySession } from "@/lib/play/types"
import { subscribeCaption, subscribeSpeaking, unlockPlayback } from "@/lib/play/speak"
import { setVoiceStopEnabled } from "@/lib/play/voiceStop"

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
    ],
  )

  return <PlayContext.Provider value={value}>{children}</PlayContext.Provider>
}

export function usePlay(): PlayContextValue {
  const ctx = useContext(PlayContext)
  if (!ctx) throw new Error("usePlay must be used inside PlayProvider")
  return ctx
}
