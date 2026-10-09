"use client"

/**
 * Live camera framing before countdown. Continue enabled when hips/knees visible.
 */

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { FrameSilhouette } from "@/components/play/FrameSilhouette"
import { playDisplay } from "@/components/play/playTheme"
import ui from "@/content/play-ui.json"
import { createFindingTracker } from "@/lib/play/findings"
import { usePlayCamera } from "@/lib/play/usePlayCamera"
import { speak } from "@/lib/play/speak"
import type { PoseFrame } from "@/lib/play/types"

export function FrameGate({
  demo,
  onOk,
}: {
  demo: boolean
  onOk: () => void
}) {
  const [bodyOk, setBodyOk] = useState(false)
  const [fallbackHint, setFallbackHint] = useState<string | null>(null)
  const tracker = useRef(createFindingTracker())
  const okStreak = useRef(0)
  const ready = demo || bodyOk || fallbackHint != null

  const onFrame = (frame: PoseFrame) => {
    if (demo) return
    const { visual } = tracker.current.push(frame)
    if (visual.trackingOk) {
      okStreak.current += 1
      if (okStreak.current >= 8) setBodyOk(true)
    } else {
      okStreak.current = 0
      setBodyOk(false)
    }
  }

  const { videoRef, start, stop, status } = usePlayCamera(onFrame)

  useEffect(() => {
    if (demo) return
    let cancelled = false
    void (async () => {
      const result = await start("user")
      if (cancelled) return
      if (result !== "live") {
        setFallbackHint(ui.live.demo_badge)
      }
    })()
    return () => {
      cancelled = true
      stop()
    }
  }, [demo, start, stop])

  return (
    <div className="flex flex-1 flex-col justify-center gap-4">
      <h2 className={`${playDisplay.className} text-2xl font-bold leading-snug text-zinc-50`}>
        {ui.frame.title}
      </h2>
      <p className="text-xl text-zinc-400">{ui.frame.body}</p>
      <div className="relative mx-auto aspect-[3/4] w-full max-w-[240px] overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900">
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover -scale-x-100"
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <FrameSilhouette />
        </div>
        {status === "loading" || status === "requesting" ? (
          <p className="absolute inset-x-0 bottom-2 text-center text-sm text-zinc-300">
            {ui.loading.camera}
          </p>
        ) : null}
      </div>
      {fallbackHint ? (
        <p className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-sm text-orange-200">
          {fallbackHint} — continue to play with demo replay.
        </p>
      ) : (
        <p className="text-sm text-zinc-500">
          {ready ? "Looking good." : "Step back until hips and knees are in the outline."}
        </p>
      )}
      <Button
        type="button"
        className="h-14 min-h-14 w-full text-lg"
        disabled={!ready}
        onClick={() => {
          speak(ui.frame.continue)
          stop()
          onOk()
        }}
      >
        {ui.frame.continue}
      </Button>
    </div>
  )
}
