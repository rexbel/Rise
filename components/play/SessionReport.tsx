"use client"

import Link from "next/link"
import { useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { usePlay, type HitLogKind } from "@/components/play/PlayProvider"
import ui from "@/content/play-ui.json"
import { formatPlayClose } from "@/lib/play/formatPatient"
import { exerciseById } from "@/lib/play/programs"
import { speak } from "@/lib/play/speak"
import type { SeedPatient } from "@/lib/types"

/** Journey step 4 — patient-facing session report (no STEADI / stand counts). */
export function SessionReport({ patient }: { patient: SeedPatient }) {
  const { session, dispatch, hitCount, hitLog } = usePlay()
  const spokenRef = useRef(false)
  const exerciseId = session.finishedSet?.exerciseId ?? session.exerciseId
  const workout = exerciseById(exerciseId)
  const out = formatPlayClose(
    session.finishedSet?.findings ?? session.findings,
    session.answers,
    {
      trend: patient.patient_feedback.trend_vs_previous,
      recommendation: patient.expected_triage.recommendation,
      redFlag: false,
      clinicName: "Riverside Ortho",
    },
    [],
    exerciseId,
  )
  const firstLine = out.correction?.what ?? out.closingLines[0]

  useEffect(() => {
    if (session.phase !== "close") {
      spokenRef.current = false
      return
    }
    if (spokenRef.current || !firstLine) return
    spokenRef.current = true
    speak(firstLine)
  }, [session.phase, firstLine])

  return (
    <div className="flex flex-1 flex-col justify-center gap-4 overflow-y-auto">
      <p className="text-xs font-medium tracking-wide text-orange-400">{ui.close.title}</p>
      <h2 className="text-2xl font-semibold leading-snug text-zinc-50">
        {out.correction?.what ?? out.closingLines[0]}
      </h2>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4">
        <p className="text-xs text-zinc-500">{ui.close.workout_label}</p>
        <p className="text-lg font-medium text-zinc-100">
          {workout.name} · RehabNinja
        </p>
        <p className="mt-3 text-xs text-zinc-500">{ui.close.hits_label}</p>
        <p className="text-3xl font-semibold text-orange-400">{hitCount}</p>
        <p className="mt-3 text-xs text-zinc-500">{ui.close.timeline_label}</p>
        <HitTimeline hitLog={hitLog} />
      </div>

      {out.correction ? (
        <>
          <p className="text-xl text-zinc-300">{out.correction.why}</p>
          <p className="text-xl text-zinc-300">{out.correction.action}</p>
        </>
      ) : null}
      {out.closingLines.map((line) => (
        <p key={line} className="text-xl text-zinc-200">
          {line}
        </p>
      ))}
      <p className="text-base text-zinc-400">{ui.close.care_team}</p>

      {session.demo ? (
        <Button
          type="button"
          variant="outline"
          className="h-14 min-h-14 w-full border-zinc-700 bg-transparent text-lg text-zinc-100"
          onClick={() => dispatch({ type: "BACK_TO_QUESTIONS" })}
        >
          {ui.close.back_to_questions}
        </Button>
      ) : null}
      <Button asChild variant="outline" className="h-14 min-h-14 w-full border-zinc-700 bg-transparent text-lg">
        <Link href="/play">{ui.close.change_profile}</Link>
      </Button>
      <p className="text-lg text-zinc-500">{ui.close.done}</p>
    </div>
  )
}

function HitTimeline({ hitLog }: { hitLog: HitLogKind[] }) {
  return (
    <div className="mt-2 flex h-8 gap-0.5 overflow-hidden rounded-lg bg-zinc-950">
      {hitLog.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-xs text-zinc-600">No hits yet</div>
      ) : (
        hitLog.map((kind, i) => (
          <div
            key={`${kind}-${i}`}
            className={kind === "hit" ? "min-w-1 flex-1 bg-emerald-500" : "min-w-1 flex-1 bg-orange-500"}
          />
        ))
      )}
    </div>
  )
}
