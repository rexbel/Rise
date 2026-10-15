"use client"

/**
 * "You left the check-in": the calm screen after a confirmed Leave. Blame-free, no score, no promise of a call.
 * When the patient left during the questions, the answers so far are sent; "went to your care team" shows only once
 * the server acknowledged them, with Try again if not. The caller supplies the way to start again (or back to the
 * week) and speaks the lines.
 */
import { useEffect, useRef, type ReactNode } from "react"
import { AlertTriangle, Check, DoorOpen, Loader2, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ptSecondary } from "@/components/play/ptClasses"
import lines from "@/content/patient-lines.json"
import { cn } from "@/lib/utils"

const copy = lines.leave

export type LeftDelivery = "sending" | "ok" | "failed" | null

export function LeftCheckIn({
  delivery = null,
  onRetry,
  finished = false,
  headingClassName,
  as: Heading = "h2",
  className,
  children,
}: {
  /** Answers sent on the way out (Leave during the questions). null = nothing to send. */
  delivery?: LeftDelivery
  onRetry?: () => void
  /** Done from the closing: the result is already in, so this reads "You're all done". */
  finished?: boolean
  headingClassName?: string
  as?: "h1" | "h2"
  className?: string
  /** The way on: Start again, or Back to your week. */
  children?: ReactNode
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])

  return (
    <section className={cn("flex flex-1 flex-col justify-center gap-5", className)} aria-labelledby="left-title">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-pt-surface-2 text-pt-accent">
        {finished ? <Check aria-hidden className="size-7" /> : <DoorOpen aria-hidden className="size-7" />}
      </span>
      <Heading
        id="left-title"
        ref={heading}
        tabIndex={-1}
        className={cn("text-3xl leading-snug font-bold text-pt-ink outline-none", headingClassName)}
      >
        {finished ? copy.done_title : copy.left_title}
      </Heading>
      <p className="text-xl leading-snug text-pt-muted">
        {finished ? lines.closure : delivery ? copy.left_body_sent : copy.left_body}
      </p>

      {delivery === "sending" ? (
        <p role="status" className="flex items-center gap-3 text-xl text-pt-ink">
          <Loader2 aria-hidden className="size-6 shrink-0 animate-spin motion-reduce:animate-none" />
          {copy.sending}
        </p>
      ) : delivery === "ok" ? (
        <p role="status" className="flex items-start gap-3 rounded-xl bg-pt-surface-2 px-4 py-3 text-xl text-pt-ink">
          <Check aria-hidden className="mt-0.5 size-6 shrink-0 text-pt-hit" />
          {copy.sent}
        </p>
      ) : delivery === "failed" ? (
        <div className="flex flex-col gap-3">
          <p role="alert" className="flex items-start gap-3 text-xl text-pt-danger">
            <AlertTriangle aria-hidden className="mt-0.5 size-6 shrink-0" />
            {copy.not_sent}
          </p>
          {onRetry ? (
            <Button type="button" className={ptSecondary} onClick={onRetry}>
              <RotateCcw aria-hidden className="size-6" />
              {copy.retry}
            </Button>
          ) : null}
        </div>
      ) : null}

      {children ? <div className="mt-2 flex flex-col gap-3">{children}</div> : null}
    </section>
  )
}
