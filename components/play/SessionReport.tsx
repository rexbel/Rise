"use client"

/**
 * Closing screen after a RehabNinja set. The lines come from the same deterministic rules the server runs
 * (lib/rules.ts via lib/play/playResult.playClose) on the exact result that was sent, never the seed's
 * expected_triage. Shows no hit count, rep count, rank, or score. Everything shown is also spoken and captioned.
 */

import Link from "next/link"
import { useEffect, useId, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { usePlay } from "@/components/play/PlayProvider"
import { playDisplay, ptCta, ptFocus, ptSecondary } from "@/components/play/playTheme"
import lines from "@/content/patient-lines.json"
import ui from "@/content/play-ui.json"
import { playClose } from "@/lib/play/playResult"
import { exerciseById } from "@/lib/play/programs"
import { cancel, speakLines } from "@/lib/play/speak"
import type { SeedPatient } from "@/lib/types"
import { cn } from "@/lib/utils"

export function SessionReport({ patient }: { patient: SeedPatient }) {
  const { session, dispatch, result, clinicName } = usePlay()
  const finishedSet = session.finishedSet
  const workout = exerciseById(finishedSet?.exerciseId ?? session.exerciseId)
  const close = useMemo(
    () => (result && finishedSet ? playClose(result, patient, finishedSet, clinicName) : null),
    [result, finishedSet, patient, clinicName],
  )

  const spoken = useMemo(() => {
    if (!close) return []
    const c = close.correction
    return [...(c ? [c.what, c.action] : []), ...close.lines, lines.note_prompt]
  }, [close])
  const spokenKey = spoken.join("\n")

  useEffect(() => {
    if (!spokenKey) return
    void speakLines(spokenKey.split("\n"))
  }, [spokenKey])

  if (!close) {
    return (
      <p className="text-xl text-pt-muted" role="status">
        {lines.closure}
      </p>
    )
  }

  const [trendLine, nextLine, closureLine] = close.lines

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto">
      <div>
        <p className="text-xl font-semibold text-pt-accent">{ui.close.title}</p>
        <h2 className={`${playDisplay.className} mt-1 text-3xl font-extrabold text-pt-ink`}>{workout.name}</h2>
      </div>

      {/* No per-rep hit/miss record here: on the closing screen it reads as a pass/fail score. The clinic strip keeps it. */}
      {close.correction ? (
        <section aria-labelledby="tip-heading" className="rounded-2xl border border-pt-line bg-pt-surface-2 p-5">
          <h3 id="tip-heading" className="text-xl font-semibold text-pt-accent">
            {ui.close.tip_label}
          </h3>
          <p className="mt-2 text-2xl font-semibold leading-snug text-pt-ink">{close.correction.what}</p>
          <p className="mt-2 text-xl leading-snug text-pt-muted">{close.correction.why}</p>
          <p className="mt-2 text-xl leading-snug text-pt-ink">{close.correction.action}</p>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <p className={`${playDisplay.className} text-2xl font-bold leading-snug text-pt-ink`}>{trendLine}</p>
        {nextLine ? <p className="text-xl leading-snug text-pt-ink">{nextLine}</p> : null}
        {closureLine ? <p className="text-xl leading-snug text-pt-muted">{closureLine}</p> : null}
      </section>

      <NoteBox />

      <div className="flex flex-col gap-3">
        {session.demo ? (
          <Button type="button" className={ptSecondary} onClick={() => dispatch({ type: "BACK_TO_QUESTIONS" })}>
            {ui.close.back_to_questions}
          </Button>
        ) : null}
        <Button asChild className={ptSecondary}>
          <Link href="/play">{ui.close.change_profile}</Link>
        </Button>
      </div>
    </div>
  )
}

/** Optional note to the nurse. Sending re-posts the same result with patientNote. */
function NoteBox() {
  const { sendNote } = usePlay()
  const [note, setNote] = useState("")
  const [state, setState] = useState<"open" | "sending" | "sent" | "skipped">("open")
  const [failed, setFailed] = useState(false)
  const fieldId = useId()

  if (state === "sent" || state === "skipped") {
    return (
      <p className="rounded-2xl bg-pt-surface-2 px-4 py-3 text-xl text-pt-ink" role="status">
        {state === "sent" ? ui.note.sent : ui.note.skipped}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-pt-line p-4">
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
            setState(ok ? "sent" : "open")
          }}
        >
          {ui.note.send}
        </Button>
        <Button
          type="button"
          className={ptSecondary}
          onClick={() => {
            cancel()
            setState("skipped")
          }}
        >
          {ui.note.skip}
        </Button>
      </div>
    </div>
  )
}
