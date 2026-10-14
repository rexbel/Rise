"use client"

/**
 * Live camera framing before countdown. Continue enabled when hips/knees visible.
 * On a real invite a camera or tracker failure shows help (Try again, Tell my care team) instead of the demo replay.
 */

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CameraTrouble, type CameraTroubleState } from "@/components/play/CameraTrouble"
import { failureReason, isRealPlay, reportCouldNotComplete } from "@/components/play/couldNotComplete"
import { FrameSilhouette } from "@/components/play/FrameSilhouette"
import { usePlay } from "@/components/play/PlayProvider"
import { playDisplay, ptCta, ptLink } from "@/components/play/playTheme"
import lines from "@/content/patient-lines.json"
import ui from "@/content/play-ui.json"
import { weekHref } from "@/lib/play/crewView"
import { createFindingTracker } from "@/lib/play/findings"
import { usePlayCamera } from "@/lib/play/usePlayCamera"
import { speak } from "@/lib/play/speak"
import type { PoseFrame } from "@/lib/play/types"
import { cn } from "@/lib/utils"

export function FrameGate({
  demo,
  onOk,
}: {
  demo: boolean
  /** cameraFailed: the camera or tracker did not start here, so the set should not try again. */
  onOk: (cameraFailed: boolean) => void
}) {
  const { invited, sessionId } = usePlay()
  const real = isRealPlay(invited, demo)
  const [bodyOk, setBodyOk] = useState(false)
  const [fallbackHint, setFallbackHint] = useState<string | null>(null)
  /** Real invite: the camera or tracker failed here. null while it is starting or working. */
  const [trouble, setTrouble] = useState<CameraTroubleState | null>(null)
  /** Bumped by Try again: restarts the camera once the framing view (and its video) is back on screen. */
  const [attempt, setAttempt] = useState(0)
  const reason = useRef<"camera" | "tracker">("camera")
  const tracker = useRef(createFindingTracker())
  const okStreak = useRef(0)
  const ready = demo || bodyOk || (!real && fallbackHint != null)

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

  /** Real invite: note why it failed (before stopping the camera), then show help and say so. */
  const showTrouble = useCallback(() => {
    reason.current = failureReason(videoRef.current?.srcObject)
    stop()
    setTrouble("help")
    speak(lines.could_not_complete.spoken)
  }, [stop, videoRef])

  useEffect(() => {
    if (demo) return
    let cancelled = false
    void (async () => {
      const result = await start("user")
      if (cancelled) return
      if (result === "live") return
      if (real) showTrouble()
      else setFallbackHint(ui.live.demo_badge)
    })()
    return () => {
      cancelled = true
      stop()
    }
  }, [demo, real, start, stop, showTrouble, attempt])

  const retry = () => {
    okStreak.current = 0
    setBodyOk(false)
    setTrouble(null)
    setAttempt((n) => n + 1)
  }

  const tell = async () => {
    if (trouble === "sending") return
    setTrouble("sending")
    const ok = await reportCouldNotComplete(sessionId, reason.current)
    if (!ok) {
      setTrouble("failed")
      return
    }
    setTrouble("done")
    speak(lines.could_not_complete.done)
  }

  if (real && trouble) {
    return (
      <CameraTrouble
        state={trouble}
        onRetry={retry}
        onTell={() => void tell()}
        headingClassName={playDisplay.className}
        doneExtra={<DoneLink />}
      />
    )
  }

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
      {fallbackHint && !real ? (
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
          onOk(!real && fallbackHint != null)
        }}
      >
        {ui.frame.continue}
      </Button>
    </div>
  )
}

/** After telling the care team: back to the patient's week (keeps the invite token), nothing else to do. */
function DoneLink() {
  const { inviteToken } = usePlay()
  return (
    <Link href={weekHref(inviteToken)} className={cn(ptLink, "inline-flex min-h-14 items-center self-start")}>
      {ui.home.back_week}
    </Link>
  )
}
