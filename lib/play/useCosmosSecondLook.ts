"use client"

/**
 * Wires YOLO events to Cosmos second looks for one live set. Runs the frame ring while the camera is live,
 * throttles requests, and reports looks to the clinic strip through `onLook`. Demo replay has no camera frames,
 * so its looks are the template fallback (badged "Demo data"), never a Cosmos call.
 */
import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef } from "react"
import { fallbackSecondLook } from "@/lib/ai/cosmos"
import {
  type CosmosLook,
  FRAMES_PER_LOOK,
  initialThrottle,
  requestSecondLook,
  shouldSecondLook,
  type ThrottleState,
  WINDOW_MS,
} from "@/lib/play/cosmosClient"
import { FrameRing } from "@/lib/play/frameRing"
import type { CosmosTrigger } from "@/lib/types"

export interface SecondLookEvent {
  trigger: CosmosTrigger
  severity: "soft" | "hard"
  atMs: number
  hitCount: number
  trackingOk: boolean
}

export function useCosmosSecondLook(opts: {
  videoRef: RefObject<HTMLVideoElement | null>
  /** Set is live and frames come from the real camera (not demo replay). */
  cameraLive: boolean
  inSet: boolean
  demo: boolean
  riseId: string
  exerciseId: string
  targetReps?: number
  tier: string | null
  onLook: (look: CosmosLook) => void
  onResult: (id: string, look: CosmosLook) => void
}) {
  const ring = useRef<FrameRing | null>(null)
  const throttle = useRef<ThrottleState>(initialThrottle())
  const sessionId = useRef("")
  const latest = useRef(opts)
  useLayoutEffect(() => {
    latest.current = opts
  })

  // New set: fresh session id and budget.
  useEffect(() => {
    if (!opts.inSet) return
    throttle.current = initialThrottle()
    sessionId.current = `${opts.riseId}-${Date.now().toString(36)}`
  }, [opts.inSet, opts.riseId])

  // Frame ring only while the real camera is live in a set.
  useEffect(() => {
    const video = opts.videoRef.current
    if (!opts.inSet || !opts.cameraLive || !video) return
    ring.current ??= new FrameRing()
    ring.current.start(video)
    return () => ring.current?.stop()
  }, [opts.inSet, opts.cameraLive, opts.videoRef])

  return useCallback((e: SecondLookEvent) => {
    const o = latest.current
    const now = performance.now()
    if (!shouldSecondLook(throttle.current, now, e.severity)) return
    const id = `${e.trigger}-${Math.round(e.atMs)}`
    const yolo = { hitCount: e.hitCount, targetReps: o.targetReps, trackingOk: e.trackingOk, tier: o.tier }
    const pending: CosmosLook = { id, trigger: e.trigger, atMs: e.atMs, result: null }

    const picked = o.cameraLive && ring.current?.running ? ring.current.pick(FRAMES_PER_LOOK, WINDOW_MS) : { frames: [], spanMs: 0 }
    throttle.current = { ...throttle.current, lastSentAt: now, sentThisSet: throttle.current.sentThisSet + 1 }

    if (!picked.frames.length) {
      // Demo replay, or the camera hasn't produced frames yet: template only, clearly badged.
      o.onLook({ ...pending, result: fallbackSecondLook({ trigger: e.trigger, yolo, atMs: e.atMs }) })
      return
    }

    o.onLook(pending)
    throttle.current = { ...throttle.current, inFlight: true, inFlightSeverity: e.severity }
    void requestSecondLook({
      sessionId: sessionId.current,
      riseId: o.riseId,
      exerciseId: o.exerciseId,
      trigger: e.trigger,
      severity: e.severity,
      atMs: Math.round(e.atMs),
      yolo,
      frames: picked.frames,
      frameSpanMs: picked.spanMs,
    }).then((result) => {
      throttle.current = { ...throttle.current, inFlight: false, inFlightSeverity: null }
      latest.current.onResult(id, { ...pending, result: result ?? fallbackSecondLook({ trigger: e.trigger, yolo, atMs: e.atMs }) })
    })
  }, [])
}
