"use client"

/**
 * Live camera framing before countdown. Continue enabled when hips/knees visible.
 */

import { useEffect, useRef, useState } from "react"
import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FrameSilhouette } from "@/components/play/FrameSilhouette"
import { playDisplay, ptCta } from "@/components/play/playTheme"
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
      <h2 className={`${playDisplay.className} text-3xl font-bold leading-snug text-pt-ink`}>{ui.frame.title}</h2>
      <p className="text-xl text-pt-muted">{ui.frame.body}</p>
      <div className="relative mx-auto aspect-[3/4] w-full max-w-[240px] overflow-hidden rounded-2xl border border-pt-line bg-pt-bg">
        <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover -scale-x-100" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <FrameSilhouette />
        </div>
        {status === "loading" || status === "requesting" ? (
          <p className="absolute inset-x-0 bottom-0 bg-pt-bg/80 px-2 py-1 text-center text-xl text-pt-ink" role="status">
            {ui.loading.camera}
          </p>
        ) : null}
      </div>
      {fallbackHint ? (
        <p className="rounded-lg border border-pt-accent/40 bg-pt-surface-2 px-3 py-2 text-xl text-pt-ink" role="status">
          {ui.frame.fallback}
        </p>
      ) : (
        <p className="flex items-center gap-2 text-xl text-pt-muted" role="status">
          {ready ? <Check className="size-6 text-pt-hit" aria-hidden /> : null}
          {ready ? ui.frame.looking_good : ui.frame.step_back}
        </p>
      )}
      <Button
        type="button"
        className={ptCta}
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
