"use client"

/**
 * Closing steps after a RehabNinja set. The lines come from the same deterministic rules the server runs
 * (lib/rules.ts via lib/play/playResult.playClose) on the exact result that was sent, never the seed's
 * expected_triage. Shows no hit count, rep count, rank, or score. Everything shown is also spoken and captioned.
 */

import Link from "next/link"
import { useEffect, useId, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { usePlay } from "@/components/play/PlayProvider"
import { playDisplay, ptCta, ptFocus, ptSecondary } from "@/components/play/playTheme"
import lines from "@/content/patient-lines.json"
import ui from "@/content/play-ui.json"
import { playClose } from "@/lib/play/playResult"
import { exerciseById } from "@/lib/play/programs"
import { cancel, speakLines } from "@/lib/play/speak"
import type { SeedPatient } from "@/lib/types"
import { weekHref } from "@/lib/play/crewView"
import { cn } from "@/lib/utils"

type Step = "tip" | "today" | "nurse"

/**
 * Three short steps instead of one long page: the exercise tip, how today went (trend + next step), then the
 * note to the nurse. Each step speaks only its own lines; the closure line comes last, after the note.
 */
export function SessionReport({ patient }: { patient: SeedPatient }) {
  const { session, dispatch, result, clinicName, inviteToken } = usePlay()
  const finishedSet = session.finishedSet
  const workout = exerciseById(finishedSet?.exerciseId ?? session.exerciseId)
  const close = useMemo(
    () => (result && finishedSet ? playClose(result, patient, finishedSet, clinicName) : null),
    [result, finishedSet, patient, clinicName],
  )
  const steps: Step[] = close?.correction ? ["tip", "today", "nurse"] : ["today", "nurse"]
  const [stepIndex, setStepIndex] = useState(0)
  const step = steps[Math.min(stepIndex, steps.length - 1)]
  const [noteDone, setNoteDone] = useState<"sent" | "skipped" | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  const [trendLine, nextLine, closureLine] = close?.lines ?? []

  const spoken = useMemo(() => {
    if (!close) return []
    if (step === "tip" && close.correction) return [close.correction.what, close.correction.action]
    if (step === "today") return [trendLine, nextLine].filter(Boolean)
    if (noteDone) return [closureLine].filter(Boolean)
    return [lines.note_prompt]
  }, [close, step, trendLine, nextLine, closureLine, noteDone])
  const spokenKey = spoken.join("\n")

  useEffect(() => {
    if (!spokenKey) return
    void speakLines(spokenKey.split("\n"))
  }, [spokenKey])

  // Move focus to the new step's heading so screen readers follow the page change.
  useEffect(() => {
    if (stepIndex > 0) headingRef.current?.focus()
  }, [stepIndex])

  if (!close) {
    return (
      <p className="text-xl text-pt-muted" role="status">
        {lines.closure}
      </p>
    )
  }

  const label = step === "tip" ? ui.close.tip_label : step === "today" ? ui.close.today_label : ui.close.nurse_label
  const next = () => {
    cancel()
    setStepIndex((i) => Math.min(i + 1, steps.length - 1))
  }

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto">
      <div>
        <p className="text-xl text-pt-muted">
          {workout.name} ·{" "}
          {ui.close.step.replace("{n}", String(steps.indexOf(step) + 1)).replace("{total}", String(steps.length))}
        </p>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className={`${playDisplay.className} mt-1 text-3xl font-extrabold text-pt-accent outline-none`}
        >
          {label}
        </h2>
      </div>

      {/* No per-rep hit/miss record here: on the closing screen it reads as a pass/fail score. The clinic strip keeps it.
          Each step's last spoken line (correction action, next step, closure) is left to the caption bar under the
          card, so it is not printed twice. */}
      {step === "tip" && close.correction ? (
        <section className="flex flex-1 flex-col gap-3">
          <p className="text-2xl font-semibold leading-snug text-pt-ink">{close.correction.what}</p>
          <p className="text-xl leading-snug text-pt-muted">{close.correction.why}</p>
        </section>
      ) : null}

      {step === "today" ? (
        <section className="flex flex-1 flex-col gap-4">
          <p className={`${playDisplay.className} text-2xl font-bold leading-snug text-pt-ink`}>{trendLine}</p>
        </section>
      ) : null}

      {step === "nurse" ? (
        noteDone ? (
          <section className="flex flex-1 flex-col gap-4">
            <p className="rounded-2xl bg-pt-surface-2 px-4 py-3 text-xl text-pt-ink" role="status">
              {noteDone === "sent" ? ui.note.sent : ui.note.skipped}
            </p>
          </section>
        ) : (
          <NoteBox onDone={setNoteDone} />
        )
      ) : null}

      <div className="mt-auto flex flex-col gap-3">
        {step !== "nurse" ? (
          <Button type="button" className={ptCta} onClick={next}>
            {ui.close.next}
          </Button>
        ) : noteDone ? (
          <>
            <Button asChild className={ptCta}>
              <Link href={weekHref(inviteToken)}>{ui.close.change_profile}</Link>
            </Button>
            {session.demo ? (
              <Button type="button" className={ptSecondary} onClick={() => dispatch({ type: "BACK_TO_QUESTIONS" })}>
                {ui.close.back_to_questions}
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  )
}

/** Optional note to the nurse. Sending re-posts the same result with patientNote. */
function NoteBox({ onDone }: { onDone: (how: "sent" | "skipped") => void }) {
  const { sendNote } = usePlay()
  const [note, setNote] = useState("")
  const [state, setState] = useState<"open" | "sending">("open")
  const [failed, setFailed] = useState(false)
  const fieldId = useId()

  return (
    <div className="flex flex-1 flex-col gap-3">
      <label htmlFor={fieldId} className="text-xl leading-snug text-pt-ink">
        {lines.note_prompt}
      </label>
      {failed ? (
        <p className="text-xl leading-snug text-pt-ink" role="alert">
          {ui.note.not_sent}
        </p>
      ) : null}
      <textarea
        id={fieldId}
        rows={3}
        maxLength={2000}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={ui.note.placeholder}
        className={cn(
          ptFocus,
          "min-h-28 w-full rounded-xl border border-pt-line bg-pt-bg px-4 py-3 text-xl text-pt-ink placeholder:text-pt-muted",
        )}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Button
          type="button"
          className={ptCta}
          disabled={!note.trim() || state === "sending"}
          onClick={async () => {
            cancel()
            setState("sending")
            const ok = await sendNote(note)
            setFailed(!ok)
            setState("open")
            if (ok) onDone("sent")
          }}
        >
          {ui.note.send}
        </Button>
        <Button
          type="button"
          className={ptSecondary}
          onClick={() => {
            cancel()
            onDone("skipped")
          }}
        >
          {ui.note.skip}
        </Button>
      </div>
    </div>
  )
}
