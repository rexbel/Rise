"use client"

import { useEffect, useRef, useState } from "react"
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
import type { Keypoints17, PlayPhase } from "@/lib/play/types"

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

export function LivePlay() {
  const { session, dispatch, setElapsedMs, elapsedMs, hitCount, hitLog, pushHitLog, resetHits } = usePlay()
  const [keypoints, setKeypoints] = useState<Keypoints17 | null>(null)
  const [visual, setVisual] = useState<LiveVisual>(idleVisual)
  const [fxEvents, setFxEvents] = useState<HitMissEvent[]>([])
  const [combo, setCombo] = useState(0)
  const busRef = useRef<SyntheticBus | null>(null)
  const trackerRef = useRef(createFindingTracker())
  const hitMissRef = useRef(createHitMissTracker())
  const lostFor = useRef(0)
  const phaseRef = useRef<PlayPhase>(session.phase)
  phaseRef.current = session.phase

  const inSet = session.phase === "live" || session.phase === "stepBack" || session.phase === "paused"
  const durationMs = scriptDurationMs(session.riseId)

  useEffect(() => {
    if (!inSet) return
    trackerRef.current.reset()
    hitMissRef.current.reset()
    resetHits()
    setCombo(0)
    setFxEvents([])
    const bus = createSyntheticBus(session.riseId, () => {
      if (phaseRef.current === "live" || phaseRef.current === "stepBack") {
        dispatch({ type: "SET_COMPLETE", durationMs: scriptDurationMs(session.riseId) })
      }
    })
    bus.subscribe((frame) => {
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
      }
    })
    bus.start()
    busRef.current = bus
    if (phaseRef.current === "paused" || phaseRef.current === "stepBack") bus.pause()
    return () => {
      bus.stop()
      busRef.current = null
    }
  }, [inSet, session.riseId, dispatch, setElapsedMs, pushHitLog, resetHits])

  useEffect(() => {
    const bus = busRef.current
    if (!bus) return
    if (session.phase === "paused" || session.phase === "stepBack") bus.pause()
    else bus.resume()
  }, [session.phase])

  useEffect(() => {
    if (session.phase === "stepBack") speak(ui.live.step_back)
  }, [session.phase])

  const stepBack = session.phase === "stepBack"
  const paused = session.phase === "paused"
  const elapsed = busRef.current?.tMs() ?? elapsedMs

  return (
    <div className="flex flex-1 flex-col gap-3 text-zinc-50">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium tracking-wide text-orange-400">Keep the Line</p>
          <p className="text-sm text-zinc-400">{ui.live.prompt}</p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-zinc-900 px-3 py-1.5 text-lg font-semibold text-orange-400">
          <Zap className="size-5 fill-orange-400" aria-hidden />
          x{Math.max(1, combo)}
        </div>
      </div>
      <button
        type="button"
        className="relative min-h-52 flex-1 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950"
        onClick={() => {
          if (!paused && !stepBack) dispatch({ type: "PAUSE" })
        }}
        aria-label={ui.live.pause}
      >
        <PixiLiveField
          keypoints={keypoints}
          visual={visual}
          events={fxEvents}
          hitCount={hitCount}
          elapsedMs={elapsed}
          durationMs={durationMs}
          frozen={visual.hard}
        />
        {paused ? (
          <div className="absolute inset-0 flex flex-col justify-center gap-3 bg-zinc-950/90 p-4">
            <h2 className="text-2xl font-semibold leading-snug">{ui.paused.title}</h2>
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
          <div className="absolute inset-x-0 bottom-0 bg-zinc-950/95 p-3">
            <p className="mb-2 text-center text-xl font-medium">{ui.live.step_back}</p>
            <Button type="button" className="h-14 w-full text-lg" onClick={() => dispatch({ type: "TRACKING_OK" })}>
              {ui.frame.continue}
            </Button>
          </div>
        ) : null}
      </button>

      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-zinc-900" aria-label="Hit timeline">
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

      <div className="grid grid-cols-2 gap-3">
        <Button
          type="button"
          variant="destructive"
          className="h-24 min-h-[96px] text-2xl"
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
          className="h-24 min-h-[96px] border-zinc-700 bg-zinc-900 text-2xl text-zinc-50 hover:bg-zinc-800"
          onClick={(e) => {
            e.stopPropagation()
            dispatch({ type: "PAUSE" })
          }}
        >
          <PauseIcon className="size-8" aria-hidden />
          {ui.live.pause}
        </Button>
      </div>
    </div>
  )
}
