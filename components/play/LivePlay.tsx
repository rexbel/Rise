"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Pause as PauseIcon, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PixiLiveField } from "@/components/play/PixiLiveField"
import { usePlay } from "@/components/play/PlayProvider"
import ui from "@/content/play-ui.json"
import { createFindingTracker, type LiveVisual } from "@/lib/play/findings"
import { createHitMissTracker, type HitMissEvent } from "@/lib/play/hitMiss"
import { createSyntheticBus, type SyntheticBus } from "@/lib/play/poseBus"
import { scriptDurationMs } from "@/lib/play/syntheticPose"
import { speak } from "@/lib/play/speak"
import { playTone } from "@/lib/play/tones"
import { clientLog } from "@/lib/play/clientLog"
import { usePlayCamera } from "@/lib/play/usePlayCamera"
import type { Keypoints17, PlayPhase, PoseFrame } from "@/lib/play/types"

const idleVisual: LiveVisual = {
  trackingOk: true,
  kneeInward: 0,
  armsOut: false,
  fast: false,
  hipY: 0.62,
  standing: false,
  hard: false,
  asymmetry: false,
}

/** Full-viewport Fruit Ninja stage: camera + overlays + Stop always visible. */
export function LivePlay() {
  const { session, dispatch, setElapsedMs, elapsedMs, hitCount, hitLog, pushHitLog, resetHits } = usePlay()
  const [keypoints, setKeypoints] = useState<Keypoints17 | null>(null)
  const [visual, setVisual] = useState<LiveVisual>(idleVisual)
  const [fxEvents, setFxEvents] = useState<HitMissEvent[]>([])
  const [combo, setCombo] = useState(0)
  const [usingDemo, setUsingDemo] = useState(false)
  const [camHint, setCamHint] = useState<string | null>(null)
  const busRef = useRef<SyntheticBus | null>(null)
  const trackerRef = useRef(createFindingTracker())
  const hitMissRef = useRef(createHitMissTracker())
  const lostFor = useRef(0)
  const phaseRef = useRef<PlayPhase>(session.phase)
  phaseRef.current = session.phase
  const completedRef = useRef(false)

  const inSet = session.phase === "live" || session.phase === "stepBack" || session.phase === "paused"
  const durationMs = scriptDurationMs(session.riseId)

  const onPoseFrame = useCallback(
    (frame: PoseFrame) => {
      const { visual: vis, finding } = trackerRef.current.push(frame)
      setKeypoints(frame.keypoints)
      setVisual(vis)
      setElapsedMs(frame.t)

      if (!vis.trackingOk) {
        lostFor.current += 1
        if (lostFor.current === 9) dispatch({ type: "TRACKING_LOST" })
      } else {
        if (lostFor.current > 0 && phaseRef.current === "stepBack") {
          dispatch({ type: "TRACKING_OK" })
        }
        lostFor.current = 0
      }
      if (finding) dispatch({ type: "FINDING", finding })

      if (phaseRef.current === "live") {
        const events = hitMissRef.current.push(vis, frame.keypoints, frame.t)
        if (events.length) {
          setFxEvents(events)
          for (const e of events) {
            playTone(e.kind === "hit" ? "hit" : "miss")
            pushHitLog(e.kind)
            setCombo((c) => (e.kind === "hit" ? c + 1 : 0))
          }
        }
        if (!completedRef.current && frame.t >= durationMs) {
          completedRef.current = true
          dispatch({ type: "SET_COMPLETE", durationMs })
        }
      }
    },
    [dispatch, setElapsedMs, pushHitLog, durationMs],
  )

  const camera = usePlayCamera(onPoseFrame)
  const camApi = useRef(camera)
  camApi.current = camera

  useEffect(() => {
    if (!inSet) return
    let cancelled = false
    trackerRef.current.reset()
    hitMissRef.current.reset()
    resetHits()
    setCombo(0)
    setFxEvents([])
    completedRef.current = false
    setUsingDemo(false)
    setCamHint(null)

    void (async () => {
      clientLog("info", "live set starting camera", { riseId: session.riseId })
      const result = await camApi.current.start("user")
      if (cancelled || result === "cancelled") return
      if (result === "live") {
        setUsingDemo(false)
        setCamHint(null)
        clientLog("info", "live camera path active")
        return
      }
      clientLog("warn", "falling back to demo replay", camApi.current.error)
      setUsingDemo(true)
      setCamHint(camApi.current.error ?? ui.live.demo_badge)
      const bus = createSyntheticBus(session.riseId, () => {
        if (phaseRef.current === "live" || phaseRef.current === "stepBack") {
          dispatch({ type: "SET_COMPLETE", durationMs: scriptDurationMs(session.riseId) })
        }
      })
      bus.subscribe(onPoseFrame)
      bus.start()
      busRef.current = bus
      if (phaseRef.current === "paused" || phaseRef.current === "stepBack") bus.pause()
    })()

    return () => {
      cancelled = true
      camApi.current.stop()
      busRef.current?.stop()
      busRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inSet, session.riseId, dispatch, resetHits])

  useEffect(() => {
    const bus = busRef.current
    const freeze = session.phase === "paused" || session.phase === "stepBack"
    if (bus) {
      if (freeze) bus.pause()
      else bus.resume()
    }
    if (camApi.current.status === "live") {
      if (freeze) camApi.current.pause()
      else camApi.current.resume()
    }
  }, [session.phase])

  useEffect(() => {
    if (session.phase === "stepBack") speak(ui.live.step_back)
  }, [session.phase])

  useEffect(() => {
    const onErr = (ev: ErrorEvent) => {
      clientLog("error", "window error", { message: ev.message, source: ev.filename, line: ev.lineno })
    }
    const onRej = (ev: PromiseRejectionEvent) => {
      clientLog("error", "unhandled rejection", String(ev.reason))
    }
    window.addEventListener("error", onErr)
    window.addEventListener("unhandledrejection", onRej)
    return () => {
      window.removeEventListener("error", onErr)
      window.removeEventListener("unhandledrejection", onRej)
    }
  }, [])

  const stepBack = session.phase === "stepBack"
  const paused = session.phase === "paused"
  const elapsed = usingDemo ? (busRef.current?.tMs() ?? elapsedMs) : elapsedMs
  const loadingCam = camera.status === "requesting" || camera.status === "loading"

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col bg-black text-zinc-50">
      {/* Full-bleed camera stage */}
      <div
        className="relative min-h-0 flex-1 overflow-hidden"
        onClick={() => {
          if (!paused && !stepBack) dispatch({ type: "PAUSE" })
        }}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !paused && !stepBack) {
            e.preventDefault()
            dispatch({ type: "PAUSE" })
          }
        }}
        role="presentation"
      >
        <video
          ref={camera.videoRef}
          playsInline
          muted
          className={`absolute inset-0 h-full w-full object-cover -scale-x-100 ${usingDemo ? "opacity-0" : "opacity-100"}`}
        />
        {usingDemo ? (
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,#1c1917_0%,#0a0a0c_70%)]" aria-hidden />
        ) : null}
        <PixiLiveField
          keypoints={keypoints}
          visual={visual}
          events={fxEvents}
          hitCount={hitCount}
          combo={combo}
          elapsedMs={elapsed}
          durationMs={durationMs}
          frozen={visual.hard}
          showGhost={usingDemo}
        />

        {/* Top HUD */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 bg-gradient-to-b from-black/70 to-transparent p-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <div>
            <p className="text-xs font-medium tracking-wide text-orange-400">Rise · Fruit Ninja</p>
            <p className="text-lg font-semibold text-zinc-50 sm:text-xl">{ui.live.prompt}</p>
            <p className="mt-0.5 max-w-md text-sm text-zinc-300">{ui.live.how}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {usingDemo ? (
              <span className="rounded-full border border-zinc-600 bg-zinc-950/80 px-2 py-0.5 text-xs text-zinc-300">
                {ui.live.demo_badge}
              </span>
            ) : null}
            <div className="flex items-center gap-2 rounded-full bg-zinc-950/80 px-3 py-1.5 text-lg font-semibold text-orange-400">
              <Zap className="size-5 fill-orange-400" aria-hidden />
              x{Math.max(1, combo)}
            </div>
          </div>
        </div>

        {loadingCam ? (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/60 text-xl text-zinc-100">
            Opening camera…
          </div>
        ) : null}
        {camHint && usingDemo ? (
          <div className="absolute left-4 top-28 max-w-sm rounded-md bg-zinc-950/80 px-3 py-2 text-sm text-zinc-300">
            {camHint}
          </div>
        ) : null}

        {paused ? (
          <div
            className="absolute inset-0 flex flex-col justify-center gap-3 bg-zinc-950/85 p-6 sm:mx-auto sm:max-w-md"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold leading-snug sm:text-3xl">{ui.paused.title}</h2>
            <Button type="button" className="h-14 min-h-14 w-full text-lg" onClick={() => dispatch({ type: "RESUME" })}>
              {ui.paused.keep_going}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-14 min-h-14 w-full border-zinc-700 bg-transparent text-lg text-zinc-100"
              onClick={() => dispatch({ type: "FINISH_HERE", durationMs: elapsed || 12_000 })}
            >
              {ui.paused.finish_here}
            </Button>
          </div>
        ) : null}

        {/* Soft step-back banner — keeps camera visible */}
        {stepBack ? (
          <div
            className="absolute inset-x-0 bottom-28 mx-auto max-w-lg px-4"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <div className="rounded-xl border border-amber-500/40 bg-zinc-950/80 p-4 backdrop-blur-sm">
              <p className="mb-3 text-center text-xl font-medium text-amber-100">{ui.live.step_back}</p>
              <Button type="button" className="h-14 w-full text-lg" onClick={() => dispatch({ type: "TRACKING_OK" })}>
                {ui.frame.continue}
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Hit timeline */}
      <div className="flex h-2.5 shrink-0 gap-0.5 bg-zinc-950" aria-label="Hit timeline">
        {hitLog.length === 0 ? (
          <div className="h-full w-full bg-zinc-800" />
        ) : (
          hitLog.map((kind, i) => (
            <div
              key={`${kind}-${i}`}
              className={kind === "hit" ? "min-w-1 flex-1 bg-emerald-500" : "min-w-1 flex-1 bg-orange-500"}
            />
          ))
        )}
      </div>

      {/* Always-visible Stop / Pause */}
      <div className="grid shrink-0 grid-cols-2 gap-3 bg-zinc-950 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button
          type="button"
          variant="destructive"
          className="h-16 min-h-16 text-xl sm:h-20 sm:text-2xl"
          onClick={(e) => {
            e.stopPropagation()
            speak(ui.live.stop)
            playTone("stop")
            dispatch({ type: "STOP" })
          }}
        >
          {ui.live.stop}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-16 min-h-16 border-zinc-700 bg-zinc-900 text-xl text-zinc-50 hover:bg-zinc-800 sm:h-20 sm:text-2xl"
          onClick={(e) => {
            e.stopPropagation()
            dispatch({ type: "PAUSE" })
          }}
        >
          <PauseIcon className="size-7" aria-hidden />
          {ui.live.pause}
        </Button>
      </div>
    </div>
  )
}
