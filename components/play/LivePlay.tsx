"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { Pause as PauseIcon, Square, Zap } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { FlowHeader } from "@/components/patient/FlowHeader"
import { CameraTrouble, type CameraTroubleState } from "@/components/play/CameraTrouble"
import { failureReason, isRealPlay, reportCouldNotComplete } from "@/components/play/couldNotComplete"
import { HitTimeline } from "@/components/play/HitTimeline"
import { PixiLiveField } from "@/components/play/PixiLiveField"
import { FrameSilhouette } from "@/components/play/FrameSilhouette"
import { usePlay } from "@/components/play/PlayProvider"
import { playBody, playDisplay, ptCta, ptLink, ptSecondary, ptStop } from "@/components/play/playTheme"
import { PoseTier } from "@/lib/types"
import lines from "@/content/patient-lines.json"
import ui from "@/content/play-ui.json"
import { weekHref } from "@/lib/play/crewView"
import { rulePack } from "@/lib/play/exerciseRules"
import { createFindingTracker, type LiveVisual } from "@/lib/play/findings"
import { createHitMissTracker, type HitMissEvent } from "@/lib/play/hitMiss"
import { coachLine, exerciseById } from "@/lib/play/programs"
import { createReplayBus, createSyntheticBus, type SyntheticBus } from "@/lib/play/poseBus"
import { frameAt, LOOP_MS, VIDEO_LOOPS, videoReplayFrames } from "@/lib/play/videoReplay"
import { DEMO_VIDEO_SRC, fromDemoVideo, loadFixture } from "@/lib/pose/seeded"
import { cancel, speak, speakLines } from "@/lib/play/speak"
import { playTone } from "@/lib/play/tones"
import { clientLog } from "@/lib/play/clientLog"
import { usePlayCamera } from "@/lib/play/usePlayCamera"
import { type SecondLookEvent, useCosmosSecondLook } from "@/lib/play/useCosmosSecondLook"
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

/** Keep the looping demo video in step with the replay clock (seek on drift, like the classic check-in). */
function syncLoopVideo(v: HTMLVideoElement | null, tMs: number) {
  if (!v || !v.src) return
  const target = (((tMs % LOOP_MS) + LOOP_MS) % LOOP_MS) / 1000
  if (Math.abs(v.currentTime - target) > 0.25) v.currentTime = target
  if (v.paused) void v.play().catch(() => {})
}

/** ?replay=1 forces demo replay even when a camera is available (recording a demo on a laptop). Ignored on a real invite. */
function replayForced(): boolean {
  return new URLSearchParams(window.location.search).get("replay") === "1"
}

/** Full-viewport RehabNinja stage. */
export function LivePlay() {
  const {
    session,
    dispatch,
    setElapsedMs,
    elapsedMs,
    hitCount,
    hitLog,
    pushHitLog,
    resetHits,
    addCosmosLook,
    resolveCosmosLook,
    recordRep,
    setSetSource,
    invited,
    demo,
    sessionId,
    inviteToken,
  } = usePlay()
  /** A console invite for the patient's own camera: the replay never stands in for them. */
  const real = isRealPlay(invited, demo)
  /** Real invite: the camera or tracker failed at set start (help, then "Tell my care team"). null otherwise. */
  const [trouble, setTrouble] = useState<CameraTroubleState | null>(null)
  /** Bumped by Try again on the help screen. */
  const [attempt, setAttempt] = useState(0)
  const troubleReason = useRef<"camera" | "tracker">("camera")
  const pack = rulePack(session.exerciseId)
  const ex = exerciseById(session.exerciseId)
  const [keypoints, setKeypoints] = useState<Keypoints17 | null>(null)
  const [visual, setVisual] = useState<LiveVisual>(idleVisual)
  const [fxEvents, setFxEvents] = useState<HitMissEvent[]>([])
  const [combo, setCombo] = useState(0)
  const [usingDemo, setUsingDemo] = useState(false)
  /** Demo replay is driven by the AI demo video's keypoints, shown picture-in-picture. */
  const [videoReplay, setVideoReplay] = useState(false)
  const demoVideoRef = useRef<HTMLVideoElement>(null)
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
  /** Cosmos second look on YOLO events; set once the camera hook below exists. */
  const secondLookRef = useRef<(e: SecondLookEvent) => void>(() => {})

  const inSet = session.phase === "live" || session.phase === "stepBack" || session.phase === "paused"
  const [wasInSet, setWasInSet] = useState(inSet)
  if (inSet !== wasInSet) {
    setWasInSet(inSet)
    if (inSet) {
      setCombo(0)
      setFxEvents([])
      setHoldMs(0)
      setUsingDemo(false)
      setVideoReplay(false)
      setCamHint(null)
      setShowCoach(true)
      setTrouble(null)
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
        if (lostFor.current === TRACKING_LOST_FRAMES) {
          dispatch({ type: "TRACKING_LOST" })
          if (phaseRef.current === "live") {
            secondLookRef.current({ trigger: "tracking_lost", severity: "hard", atMs: frame.t, hitCount: hitCountRef.current, trackingOk: false })
          }
        }
      } else {
        lostFor.current = 0
      }
      if (finding) {
        dispatch({ type: "FINDING", finding })
        // YOLO detects; Cosmos takes a second look at the last ~2 s (clinic strip only).
        if (phaseRef.current === "live") {
          secondLookRef.current({ trigger: finding.id, severity: finding.severity, atMs: frame.t, hitCount: hitCountRef.current, trackingOk: vis.trackingOk })
        }
      }

      if (phaseRef.current === "live") {
        const events = hitMissRef.current.push(vis, frame.keypoints, frame.t, session.exerciseId)
        const snap = hitMissRef.current.snapshot()
        setHoldMs(snap.holdCleanMs)
        // Every completed rep (clean or not) goes to the care team; the provider ignores repeats.
        recordRep(snap.repCount)
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
    [dispatch, setElapsedMs, pushHitLog, recordRep, session.exerciseId, maybeComplete],
  )

  const { videoRef: camVideoRef, start: camStart, stop: camStop, pause: camPause, resume: camResume, status: camStatus, error: camError, tier: camTier } =
    usePlayCamera(onPoseFrame)
  const camApi = useRef({ start: camStart, stop: camStop, pause: camPause, resume: camResume, status: camStatus, error: camError })
  useLayoutEffect(() => {
    camApi.current = { start: camStart, stop: camStop, pause: camPause, resume: camResume, status: camStatus, error: camError }
  }, [camStart, camStop, camPause, camResume, camStatus, camError])

  const triggerSecondLook = useCosmosSecondLook({
    videoRef: camVideoRef,
    cameraLive: camStatus === "live" && !usingDemo,
    inSet,
    demo: usingDemo,
    riseId: session.riseId,
    exerciseId: session.exerciseId,
    targetReps: pack.progressMode === "reps" ? pack.targetReps : undefined,
    tier: usingDemo ? "demo replay" : camTier,
    onLook: addCosmosLook,
    onResult: resolveCosmosLook,
  })
  useLayoutEffect(() => {
    secondLookRef.current = triggerSecondLook
  }, [triggerSecondLook])

  /** Real invite: note why the camera failed (before stopping it), then show help instead of a replay. */
  const showTrouble = useCallback(() => {
    troubleReason.current = failureReason(camVideoRef.current?.srcObject)
    camApi.current.stop()
    setUsingDemo(false)
    setTrouble("help")
    speak(lines.could_not_complete.spoken)
  }, [camVideoRef])

  // Tell the relay which pose source feeds this set (seeded replay -> Demo data on the card).
  useEffect(() => {
    if (!inSet) return
    if (usingDemo) setSetSource("seeded", true)
    else {
      const parsed = PoseTier.safeParse(camTier)
      if (parsed.success) setSetSource(parsed.data, false)
    }
  }, [inSet, usingDemo, camTier, setSetSource])

  useEffect(() => {
    if (!inSet) return
    let cancelled = false
    const demoVideo = demoVideoRef.current
    trackerRef.current.reset()
    hitMissRef.current.reset()
    resetHits()
    hitCountRef.current = 0
    completedRef.current = false
    const coachTimer = window.setTimeout(() => setShowCoach(false), 5000)
    speak(coachLine(session.exerciseId, ui.live))

    void (async () => {
      clientLog("info", "live set starting camera", { riseId: session.riseId, exerciseId: session.exerciseId })
      // If the framing step already failed, don't load the camera and body tracker a second time: on phones the
      // repeat load (plus the game's WebGL) can run the tab out of memory. Go straight to the replay.
      // A real invite never replays: ?replay=1 and an earlier framing failure don't apply.
      const result = !real && (replayForced() || session.cameraFailed) ? "forced" : await camApi.current.start("user")
      if (cancelled) return
      if (result === "live") {
        setUsingDemo(false)
        setCamHint(null)
        clientLog("info", "live camera path active")
        return
      }
      if (real) {
        clientLog("warn", "camera failed on a real invite: help, no replay", { result, err: camApi.current.error })
        showTrouble()
        return
      }
      // cancelled (Strict Mode) or error → synthetic so live is never blank
      clientLog("warn", "falling back to demo replay", { result, err: camApi.current.error })
      setUsingDemo(true)
      setCamHint(camApi.current.error ?? ui.live.demo_badge)
      const onDone = (durationMs: number) => () => {
        if (phaseRef.current === "live" || phaseRef.current === "stepBack") dispatch({ type: "SET_COMPLETE", durationMs })
      }
      busRef.current?.stop()
      // Sit to stand with a fixture recorded from the AI demo video: replay her movement and show the video.
      const fx = session.exerciseId === "sit_to_stand" ? await loadFixture(session.riseId) : null
      if (cancelled) return
      if (fx && fromDemoVideo(fx)) {
        const frames = videoReplayFrames(fx)
        const duration = LOOP_MS * VIDEO_LOOPS
        const bus = createReplayBus((t) => frameAt(frames, t).kp, duration, onDone(duration))
        bus.subscribe(onPoseFrame)
        bus.subscribe((f) => syncLoopVideo(demoVideo, f.t))
        if (demoVideo) {
          demoVideo.src = DEMO_VIDEO_SRC
          demoVideo.muted = true
        }
        setVideoReplay(true)
        bus.start()
        if (phaseRef.current === "paused" || phaseRef.current === "stepBack") bus.pause()
        busRef.current = bus
        return
      }
      busRef.current = startDemoBus(session.riseId, session.exerciseId, onPoseFrame, onDone(pack.maxDurationMs), phaseRef)
    })()

    return () => {
      cancelled = true
      window.clearTimeout(coachTimer)
      camApi.current.stop()
      busRef.current?.stop()
      busRef.current = null
      demoVideo?.pause()
      demoVideo?.removeAttribute("src")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inSet, session.riseId, session.exerciseId, dispatch, resetHits])

  // Try again on the help screen: restart the camera only (the set itself has not started counting).
  useEffect(() => {
    if (attempt === 0 || !real) return
    let cancelled = false
    void (async () => {
      const result = await camApi.current.start("user")
      if (cancelled) return
      if (result === "live") setCamHint(null)
      else showTrouble()
    })()
    return () => {
      cancelled = true
    }
  }, [attempt, real, showTrouble])

  const retryCamera = () => {
    setTrouble(null)
    setAttempt((n) => n + 1)
  }

  const tellCareTeam = async () => {
    if (trouble === "sending") return
    setTrouble("sending")
    const ok = await reportCouldNotComplete(sessionId, troubleReason.current)
    if (!ok) {
      setTrouble("failed")
      return
    }
    setTrouble("done")
    speak(lines.could_not_complete.done)
  }

  useEffect(() => {
    const bus = busRef.current
    const freeze = session.phase === "paused" || session.phase === "stepBack"
    if (bus) {
      if (freeze) bus.pause()
      else bus.resume()
    }
    // The bus drives the demo video forward; it only needs stopping here.
    if (freeze) demoVideoRef.current?.pause()
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
    <div className={`relative flex h-full min-h-0 flex-1 flex-col bg-black text-pt-ink ${playBody.className}`}>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video
          ref={camVideoRef}
          playsInline
          muted
          className={`absolute inset-0 h-full w-full object-cover -scale-x-100 ${usingDemo ? "opacity-0" : softTracking ? "opacity-60" : "opacity-100"}`}
        />
        {usingDemo ? (
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--pt-surface)_0%,var(--pt-bg)_70%)]" aria-hidden />
        ) : null}
        {/* The person the replay comes from: the AI demo video, in step with the avatar (labelled by the badge top right). */}
        <video
          ref={demoVideoRef}
          playsInline
          muted
          loop
          aria-hidden
          className={`absolute bottom-3 left-3 z-10 aspect-[9/16] h-[22%] max-h-80 w-auto rounded-xl border border-pt-ink/20 bg-black object-contain shadow-lg sm:h-[38%] ${videoReplay ? "" : "hidden"}`}
        />
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

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 bg-gradient-to-b from-black/80 to-transparent p-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="min-w-0">
            <p className={`${playDisplay.className} text-2xl font-bold text-pt-ink`}>{ex.name}</p>
            {showCoach ? (
              <p className="mt-1 max-w-md text-xl font-semibold leading-snug text-pt-ink" aria-live="polite">
                {coachLine(session.exerciseId, ui.live)}
              </p>
            ) : null}
            {/* Camera error only; the "Demo replay" pill on the right already says the replay is running. */}
            {camHint && usingDemo && camHint !== ui.live.demo_badge ? (
              <p className="mt-2 max-w-md rounded-md border border-pt-accent/40 bg-pt-bg/85 px-3 py-2 text-xl text-pt-ink">{camHint}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            {usingDemo ? (
              <span className="rounded-full border border-pt-accent/50 bg-pt-bg/85 px-3 py-0.5 text-xl text-pt-ink">
                {videoReplay ? ui.live.video_badge : ui.live.demo_badge}
              </span>
            ) : null}
            {/* Game progress toward the set target (not a test result). */}
            <div className={`${playDisplay.className} rounded-full bg-pt-bg/85 px-3 py-1.5 text-xl font-bold text-pt-ink`}>
              {pack.progressMode === "hold"
                ? `${ui.live.hold_label} ${Math.min(pack.holdSec, Math.floor(holdMs / 1000))}s / ${pack.holdSec}s`
                : `${ui.live.reps_label} ${hitCount} / ${pack.targetReps}`}
            </div>
            {combo > 1 ? (
              <div className="flex items-center gap-2 rounded-full bg-pt-bg/85 px-3 py-1.5 text-xl font-semibold text-pt-accent">
                <Zap className="size-5 fill-current" aria-hidden />x{combo}
              </div>
            ) : null}
          </div>
        </div>

        {softTracking ? (
          <div className="pointer-events-none absolute inset-x-0 top-32 flex justify-center px-4">
            <p className="rounded-lg bg-pt-bg/85 px-3 py-2 text-xl text-pt-ink" role="status">
              {ui.live.tracking_soft}
            </p>
          </div>
        ) : null}

        {loadingCam && !usingDemo ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-pt-bg/75 px-6 text-center" role="status">
            <div className="size-12 animate-pulse rounded-full border-4 border-pt-accent/40 border-t-pt-accent motion-reduce:animate-none" aria-hidden />
            <p className={`${playDisplay.className} text-2xl font-bold text-pt-ink`}>{ui.loading.camera}</p>
            <p className="text-xl text-pt-muted">{ui.loading.tip}</p>
          </div>
        ) : null}

        {paused ? (
          <div className="absolute inset-0 z-20 flex flex-col gap-3 bg-pt-bg/90 p-6 pt-[max(1rem,env(safe-area-inset-top))] sm:mx-auto sm:max-w-md">
            {/* Paused is the one live screen with Leave: the set is stopped, so nothing is duplicated over the game. */}
            <FlowHeader
              sheetClassName={playBody.className}
              leave={{
                kind: "confirm",
                body: lines.leave.confirm_body,
                onOpenChange: (open) => {
                  if (open) void speakLines([lines.leave.confirm_title, lines.leave.confirm_body])
                  else cancel()
                },
                onConfirm: () => {
                  cancel()
                  dispatch({ type: "LEAVE" })
                },
              }}
            />
            <div className="flex flex-1 flex-col justify-center gap-3">
            <h2 className={`${playDisplay.className} text-3xl font-bold leading-snug`}>{ui.paused.title}</h2>
            <Button type="button" className={ptCta} onClick={() => dispatch({ type: "RESUME" })}>
              {ui.paused.keep_going}
            </Button>
            <Button
              type="button"
              className={ptSecondary}
              onClick={() => dispatch({ type: "FINISH_HERE", durationMs: elapsed || 12_000 })}
            >
              {ui.paused.finish_here}
            </Button>
            </div>
          </div>
        ) : null}

        {stepBack ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-pt-bg/90 px-6">
            <FrameSilhouette />
            <p className={`${playDisplay.className} max-w-md text-center text-2xl font-bold text-pt-ink`}>
              {ui.live.step_back}
            </p>
            <p className="text-center text-xl text-pt-muted" role="status">
              {visual.trackingOk ? ui.live.step_back_ok : ui.live.step_back_wait}
            </p>
            <Button
              type="button"
              className={`${ptCta} max-w-sm`}
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

      {/* Real invite, camera failed: help in place of the stage (nothing is running, so no Stop or Pause). */}
      {trouble ? (
        <div className="absolute inset-0 z-30 overflow-y-auto bg-pt-bg">
          <div className="mx-auto flex min-h-full w-full max-w-md flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
            <CameraTrouble
              state={trouble}
              onRetry={retryCamera}
              onTell={() => void tellCareTeam()}
              onNotNow={() => dispatch({ type: "LEAVE", step: "help" })}
              headingClassName={playDisplay.className}
              doneExtra={
                <Link href={weekHref(inviteToken)} className={`${ptLink} inline-flex min-h-14 items-center self-start`}>
                  {ui.home.back_week}
                </Link>
              }
            />
          </div>
        </div>
      ) : null}

      <HitTimeline hitLog={hitLog} size="sm" className="shrink-0 bg-pt-bg px-3 pt-2" />

      <div className="grid shrink-0 grid-cols-2 gap-3 bg-pt-bg p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button
          type="button"
          className={`${ptStop} h-16 min-h-16 text-2xl sm:h-20`}
          onClick={() => {
            speak(ui.live.stop)
            playTone("stop")
            dispatch({ type: "STOP" })
          }}
        >
          <Square className="size-6 fill-current" aria-hidden />
          {ui.live.stop}
        </Button>
        <Button
          type="button"
          className={`${ptSecondary} h-16 min-h-16 text-2xl sm:h-20`}
          onClick={() => dispatch({ type: "PAUSE" })}
        >
          <PauseIcon className="size-7" aria-hidden />
          {ui.live.pause}
        </Button>
      </div>
    </div>
  )
}
