"use client"

/**
 * "We couldn't start your camera": shown on a real (non-demo) check-in when the camera or body tracker fails, in place
 * of the demo replay. Help first (tips, Try again), then "Tell my care team I couldn't do it today", then a calm
 * closing with no questions and no score. Copy comes from content/patient-lines.json; callers speak the lines.
 */
import { useEffect, useRef, type ReactNode } from "react"
import { AlertTriangle, CameraOff, Check, Loader2, RotateCcw, SwitchCamera } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ptCta, ptSecondary } from "@/components/play/ptClasses"
import lines from "@/content/patient-lines.json"
import { cn } from "@/lib/utils"

const copy = lines.could_not_complete

export type CameraTroubleState = "help" | "sending" | "failed" | "done"

export function CameraTrouble({
  state,
  onRetry,
  onTell,
  retrying = false,
  switchCamera,
  headingClassName,
  doneExtra,
  className,
  as: Heading = "h2",
}: {
  state: CameraTroubleState
  onRetry: () => void
  onTell: () => void
  /** The camera is restarting after Try again. */
  retrying?: boolean
  /** Offer the other camera (classic check-in only; RehabNinja uses the front camera). */
  switchCamera?: { label: string; onClick: () => void }
  headingClassName?: string
  /** Shown under the closing, e.g. a link back to the patient's week. */
  doneExtra?: ReactNode
  className?: string
  /** h1 on the classic check-in, where each step's heading is the page's h1. */
  as?: "h1" | "h2"
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  const done = state === "done"
  // Move focus to the heading when the screen opens and when it turns into the closing.
  useEffect(() => heading.current?.focus(), [done])

  if (done) {
    return (
      <section className={cn("flex flex-1 flex-col justify-center gap-5", className)} aria-labelledby="cnc-done">
        <div className="flex items-center gap-3 text-pt-hit">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-pt-surface-2">
            <Check aria-hidden className="size-7" />
          </span>
        </div>
        <Heading id="cnc-done" ref={heading} tabIndex={-1} className={cn("text-3xl font-bold leading-snug text-pt-ink outline-none", headingClassName)}>
          {copy.done_title}
        </Heading>
        <p className="text-2xl font-semibold leading-snug" aria-live="polite">{copy.done}</p>
        <p className="text-xl leading-snug text-pt-muted">{lines.closure}</p>
        {doneExtra}
      </section>
    )
  }

  const sending = state === "sending"
  return (
    <section className={cn("flex flex-1 flex-col gap-5", className)} aria-labelledby="cnc-title" aria-describedby="cnc-body">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-pt-surface-2 text-pt-accent">
        <CameraOff aria-hidden className="size-7" />
      </span>
      <Heading id="cnc-title" ref={heading} tabIndex={-1} className={cn("text-3xl font-bold leading-snug text-pt-ink outline-none", headingClassName)}>
        {copy.title}
      </Heading>
      <p id="cnc-body" className="text-xl leading-snug text-pt-muted">{copy.body}</p>
      <ul className="flex flex-col gap-3 text-xl leading-snug">
        <Tip>{copy.tips.permission}</Tip>
        {switchCamera && <Tip>{copy.tips.other_camera}</Tip>}
        <Tip>{copy.tips.other_apps}</Tip>
      </ul>

      <div className="mt-auto flex flex-col gap-3">
        <Button type="button" size="lg" className={ptCta} onClick={onRetry} disabled={retrying || sending}>
          {retrying ? <Loader2 aria-hidden className="size-6 animate-spin motion-reduce:animate-none" /> : <RotateCcw aria-hidden className="size-6" />}
          {copy.retry}
        </Button>
        {switchCamera && (
          <Button type="button" size="lg" className={ptSecondary} onClick={switchCamera.onClick} disabled={retrying || sending}>
            <SwitchCamera aria-hidden className="size-6" />
            {switchCamera.label}
          </Button>
        )}
        {state === "failed" && (
          <p role="alert" className="flex items-start gap-2 text-xl text-pt-danger">
            <AlertTriangle aria-hidden className="mt-1 size-5 shrink-0" /> {copy.send_failed}
          </p>
        )}
        <Button type="button" size="lg" className={cn(ptSecondary, "h-auto py-3")} onClick={onTell} disabled={sending || retrying}>
          {sending ? (
            <>
              <Loader2 aria-hidden className="size-6 animate-spin motion-reduce:animate-none" />
              <span role="status">{copy.sending}</span>
            </>
          ) : (
            copy.tell
          )}
        </Button>
      </div>
    </section>
  )
}

function Tip({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 rounded-lg bg-pt-surface px-4 py-3">
      <span aria-hidden className="mt-2.5 size-2 shrink-0 rounded-full bg-pt-accent" />
      <span>{children}</span>
    </li>
  )
}
