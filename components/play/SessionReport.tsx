"use client"

import Link from "next/link"
import { useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { usePlay, type HitLogKind } from "@/components/play/PlayProvider"
import { playDisplay } from "@/components/play/playTheme"
import ui from "@/content/play-ui.json"
import { formatPlayClose } from "@/lib/play/formatPatient"
import { exerciseById } from "@/lib/play/programs"
import { speak } from "@/lib/play/speak"
import type { SeedPatient } from "@/lib/types"

/** Journey step 4 — game results (hits), not clinical chart. */
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
    <div className="flex flex-1 flex-col justify-center gap-5 overflow-y-auto">
      <div>
        <p className="text-xs font-semibold tracking-wide text-orange-400">{ui.close.title}</p>
        <h2 className={`${playDisplay.className} mt-1 text-3xl font-extrabold text-zinc-50`}>
          {workout.name}
        </h2>
      </div>

      <div className="rounded-2xl border border-orange-500/30 bg-orange-500/10 p-5 text-center">
        <p className="text-sm text-orange-200/80">{ui.close.hits_label}</p>
        <p className={`${playDisplay.className} text-6xl font-extrabold text-orange-400`}>{hitCount}</p>
        <p className="mt-3 text-xs text-zinc-500">{ui.close.timeline_label}</p>
        <HitTimeline hitLog={hitLog} />
      </div>

      <p className="text-xl leading-snug text-zinc-200">
        {out.correction?.what ?? out.closingLines[0]}
      </p>
      {out.correction ? (
        <>
          <p className="text-lg text-zinc-400">{out.correction.why}</p>
          <p className="text-lg text-zinc-300">{out.correction.action}</p>
        </>
      ) : null}

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
      <Button
        asChild
        className="h-14 min-h-14 w-full bg-orange-500 text-lg font-bold text-white hover:bg-orange-400"
      >
        <Link href="/play">{ui.close.change_profile}</Link>
      </Button>
    </div>
  )
}

function HitTimeline({ hitLog }: { hitLog: HitLogKind[] }) {
  return (
    <div className="mt-2 flex h-10 gap-0.5 overflow-hidden rounded-xl bg-zinc-950">
      {hitLog.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-xs text-zinc-600">No hits yet</div>
      ) : (
        hitLog.map((kind, i) => (
          <div
            key={`${kind}-${i}`}
            className={kind === "hit" ? "min-w-1.5 flex-1 bg-emerald-500" : "min-w-1.5 flex-1 bg-orange-500"}
            title={kind}
          />
        ))
      )}
    </div>
  )
}
