"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { Pause as PauseIcon, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PixiLiveField } from "@/components/play/PixiLiveField"
import { FrameSilhouette } from "@/components/play/FrameSilhouette"
import { usePlay } from "@/components/play/PlayProvider"
import { playBody, playDisplay } from "@/components/play/playTheme"
import ui from "@/content/play-ui.json"
import { rulePack } from "@/lib/play/exerciseRules"
import { createFindingTracker, type LiveVisual } from "@/lib/play/findings"
import { createHitMissTracker, type HitMissEvent } from "@/lib/play/hitMiss"
import { coachLine, exerciseById } from "@/lib/play/programs"
import { createSyntheticBus, type SyntheticBus } from "@/lib/play/poseBus"
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
  standAmount: 0.2,
  sway: 0,
}

/** Soft tracking: step-back only after sustained loss (~2s at 15fps). */
const TRACKING_LOST_FRAMES = 30

function startDemoBus(
  riseId: string,
  exerciseId: Parameters<typeof createSyntheticBus>[2],
  onPoseFrame: (f: PoseFrame) => void,
  onComplete: () => void,
  phaseRef: React.MutableRefObject<PlayPhase>,
): SyntheticBus {
  const bus = createSyntheticBus(riseId, onComplete, exerciseId)
  bus.subscribe(onPoseFrame)
  bus.start()
  if (phaseRef.current === "paused" || phaseRef.current === "stepBack") bus.pause()
  return bus
}

/** Full-viewport RehabNinja stage. */
export function LivePlay() {
  const { session, dispatch, setElapsedMs, elapsedMs, hitCount, hitLog, pushHitLog, resetHits } = usePlay()
  const pack = rulePack(session.exerciseId)
  const ex = exerciseById(session.exerciseId)
  const [keypoints, setKeypoints] = useState<Keypoints17 | null>(null)
  const [visual, setVisual] = useState<LiveVisual>(idleVisual)
  const [fxEvents, setFxEvents] = useState<HitMissEvent[]>([])
  const [combo, setCombo] = useState(0)
  const [usingDemo, setUsingDemo] = useState(false)
  const [camHint, setCamHint] = useState<string | null>(null)
  const [holdMs, setHoldMs] = useState(0)
  const [showCoach, setShowCoach] = useState(true)
  const busRef = useRef<SyntheticBus | null>(null)
  const trackerRef = useRef(createFindingTracker())
  const hitMissRef = useRef(createHitMissTracker())
  const lostFor = useRef(0)
  const phaseRef = useRef<PlayPhase>(session.phase)
  useLayoutEffect(() => {
    phaseRef.current = session.phase
  }, [session.phase])
  const completedRef = useRef(false)
  const hitCountRef = useRef(0)

  const inSet = session.phase === "live" || session.phase === "stepBack" || session.phase === "paused"
  const [wasInSet, setWasInSet] = useState(inSet)
  if (inSet !== wasInSet) {
    setWasInSet(inSet)
    if (inSet) {
      setCombo(0)
      setFxEvents([])
      setHoldMs(0)
      setUsingDemo(false)
      setCamHint(null)
      setShowCoach(true)
    }
  }

  const maybeComplete = useCallback(
    (tMs: number, hits: number, holdCleanMs: number) => {
      if (completedRef.current || phaseRef.current !== "live") return
      const doneReps = pack.progressMode === "reps" && hits >= pack.targetReps
      const doneHold = pack.progressMode === "hold" && holdCleanMs >= pack.holdSec * 1000
      const timedOut = tMs >= pack.maxDurationMs
      if (doneReps || doneHold || timedOut) {
        completedRef.current = true
        dispatch({ type: "SET_COMPLETE", durationMs: tMs })
      }
    },
    [dispatch, pack],
  )

  const onPoseFrame = useCallback(
    (frame: PoseFrame) => {
      const { visual: vis, finding } = trackerRef.current.push(frame, session.exerciseId)
      setKeypoints(frame.keypoints)
      setVisual(vis)
      setElapsedMs(frame.t)

      if (!vis.trackingOk) {
        lostFor.current += 1
        if (lostFor.current === TRACKING_LOST_FRAMES) dispatch({ type: "TRACKING_LOST" })
      } else {
        lostFor.current = 0
      }
      if (finding) dispatch({ type: "FINDING", finding })

      if (phaseRef.current === "live") {
        const events = hitMissRef.current.push(vis, frame.keypoints, frame.t, session.exerciseId)
        const snap = hitMissRef.current.snapshot()
        setHoldMs(snap.holdCleanMs)
        if (events.length) {
          setFxEvents(events)
          for (const e of events) {
            playTone(e.kind === "hit" ? "hit" : "miss")
            pushHitLog(e.kind)
            if (e.kind === "hit") {
              hitCountRef.current += 1
              setCombo((c) => c + 1)
            } else {
              setCombo(0)
            }
          }
        }
        maybeComplete(frame.t, hitCountRef.current, snap.holdCleanMs)
      }
    },
    [dispatch, setElapsedMs, pushHitLog, session.exerciseId, maybeComplete],
  )

  const { videoRef: camVideoRef, start: camStart, stop: camStop, pause: camPause, resume: camResume, status: camStatus, error: camError } =
    usePlayCamera(onPoseFrame)
  const camApi = useRef({ start: camStart, stop: camStop, pause: camPause, resume: camResume, status: camStatus, error: camError })
  useLayoutEffect(() => {
    camApi.current = { start: camStart, stop: camStop, pause: camPause, resume: camResume, status: camStatus, error: camError }
  }, [camStart, camStop, camPause, camResume, camStatus, camError])

  useEffect(() => {
    if (!inSet) return
    let cancelled = false
    trackerRef.current.reset()
    hitMissRef.current.reset()
    resetHits()
    hitCountRef.current = 0
    completedRef.current = false
    const coachTimer = window.setTimeout(() => setShowCoach(false), 5000)
    speak(coachLine(session.exerciseId, ui.live))

    void (async () => {
      clientLog("info", "live set starting camera", { riseId: session.riseId, exerciseId: session.exerciseId })
      const result = await camApi.current.start("user")
      if (cancelled) return
      if (result === "live") {
        setUsingDemo(false)
        setCamHint(null)
        clientLog("info", "live camera path active")
        return
      }
      // cancelled (Strict Mode) or error → synthetic so live is never blank
      clientLog("warn", "falling back to demo replay", { result, err: camApi.current.error })
      setUsingDemo(true)
      setCamHint(camApi.current.error ?? ui.live.demo_badge)
      busRef.current?.stop()
      busRef.current = startDemoBus(
        session.riseId,
        session.exerciseId,
        onPoseFrame,
        () => {
          if (phaseRef.current === "live" || phaseRef.current === "stepBack") {
            dispatch({ type: "SET_COMPLETE", durationMs: pack.maxDurationMs })
          }
        },
        phaseRef,
      )
    })()

    return () => {
      cancelled = true
      window.clearTimeout(coachTimer)
      camApi.current.stop()
      busRef.current?.stop()
      busRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inSet, session.riseId, session.exerciseId, dispatch, resetHits])

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

  const stepBack = session.phase === "stepBack"
  const paused = session.phase === "paused"
  const elapsed = elapsedMs
  const loadingCam = camStatus === "requesting" || camStatus === "loading"
  const progress =
    pack.progressMode === "hold"
      ? Math.min(1, holdMs / (pack.holdSec * 1000))
      : Math.min(1, hitCount / pack.targetReps)
  const softTracking = !visual.trackingOk && !stepBack && !paused

  return (
    <div className={`relative flex h-full min-h-0 flex-1 flex-col bg-black text-zinc-50 ${playBody.className}`}>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video
          ref={camVideoRef}
          playsInline
          muted
          className={`absolute inset-0 h-full w-full object-cover -scale-x-100 ${usingDemo ? "opacity-0" : softTracking ? "opacity-60" : "opacity-100"}`}
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
          durationMs={pack.maxDurationMs}
          progress={progress}
          frozen={visual.hard}
          showGhost={usingDemo}
          exerciseId={session.exerciseId}
          dimmed={softTracking}
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 bg-gradient-to-b from-black/75 to-transparent p-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <div>
            <p className={`${playDisplay.className} text-lg font-bold text-zinc-50 sm:text-xl`}>{ex.name}</p>
            {showCoach ? (
              <p className="mt-1 max-w-md text-base font-medium text-amber-100" aria-live="polite">
                {coachLine(session.exerciseId, ui.live)}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col items-end gap-2">
            {usingDemo ? (
              <span className="rounded-full border border-orange-500/40 bg-zinc-950/80 px-2 py-0.5 text-xs text-orange-200">
                {ui.live.demo_badge}
              </span>
            ) : null}
            <div className={`${playDisplay.className} rounded-full bg-zinc-950/80 px-3 py-1.5 text-base font-bold text-zinc-100`}>
              {pack.progressMode === "hold"
                ? `${ui.live.hold_label} ${Math.min(pack.holdSec, Math.floor(holdMs / 1000))}s / ${pack.holdSec}s`
                : `${ui.live.reps_label} ${hitCount} / ${pack.targetReps}`}
            </div>
            {combo > 1 ? (
              <div className="flex items-center gap-2 rounded-full bg-zinc-950/80 px-3 py-1.5 text-lg font-semibold text-orange-400">
                <Zap className="size-5 fill-orange-400" aria-hidden />
                x{combo}
              </div>
            ) : null}
          </div>
        </div>

        {softTracking ? (
          <div className="pointer-events-none absolute inset-x-0 top-28 flex justify-center px-4">
            <p className="rounded-lg bg-zinc-950/80 px-3 py-2 text-sm text-amber-100">{ui.live.tracking_soft}</p>
          </div>
        ) : null}

        {loadingCam && !usingDemo ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-950/70 px-6 text-center">
            <div className="size-12 animate-pulse rounded-full border-4 border-orange-500/40 border-t-orange-500" />
            <p className={`${playDisplay.className} text-2xl font-bold text-zinc-50`}>{ui.loading.camera}</p>
            <p className="text-base text-zinc-300">{ui.loading.tip}</p>
          </div>
        ) : null}
        {camHint && usingDemo ? (
          <div className="absolute left-4 top-28 max-w-sm rounded-md border border-orange-500/30 bg-zinc-950/80 px-3 py-2 text-sm text-orange-100">
            {camHint}
          </div>
        ) : null}

        {paused ? (
          <div className="absolute inset-0 flex flex-col justify-center gap-3 bg-zinc-950/85 p-6 sm:mx-auto sm:max-w-md">
            <h2 className={`${playDisplay.className} text-2xl font-bold leading-snug sm:text-3xl`}>
              {ui.paused.title}
            </h2>
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

        {stepBack ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zinc-950/90 px-6">
            <FrameSilhouette />
            <p className={`${playDisplay.className} max-w-md text-center text-2xl font-bold text-amber-100`}>
              {ui.live.step_back}
            </p>
            <p className="text-center text-base text-zinc-400">
              {visual.trackingOk ? "Looking good — continue when ready." : "We need to see your hips and knees."}
            </p>
            <Button
              type="button"
              className="h-14 min-h-14 w-full max-w-sm text-lg"
              disabled={!visual.trackingOk}
              onClick={() => {
                if (!visual.trackingOk) return
                dispatch({ type: "TRACKING_OK" })
              }}
            >
              {ui.frame.continue}
            </Button>
          </div>
        ) : null}
      </div>

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

      <div className="grid shrink-0 grid-cols-2 gap-3 bg-zinc-950 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button
          type="button"
          variant="destructive"
          className="h-16 min-h-16 text-xl sm:h-20 sm:text-2xl"
          onClick={() => {
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
          onClick={() => dispatch({ type: "PAUSE" })}
        >
          <PauseIcon className="size-7" aria-hidden />
          {ui.live.pause}
        </Button>
      </div>
    </div>
  )
}
