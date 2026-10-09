"use client"

import { useState } from "react"
import { ClinicStrip } from "@/components/play/ClinicStrip"
import { LivePlay } from "@/components/play/LivePlay"
import { PhoneColumn } from "@/components/play/PhoneColumn"
import { PlayProvider, usePlay } from "@/components/play/PlayProvider"
import { PresenterBar } from "@/components/play/PresenterBar"
import { isLiveShell } from "@/lib/play/phaseView"
import type { SeedPatient } from "@/lib/types"

export function PlaySessionView({ patient, demo }: { patient: SeedPatient; demo: boolean }) {
  const [restartKey, setRestartKey] = useState(0)
  return (
    <PlayProvider key={restartKey} riseId={patient.rise_id} demo={demo}>
      <PlayShell patient={patient} demo={demo} onRestart={() => setRestartKey((k) => k + 1)} />
    </PlayProvider>
  )
}

function PlayShell({
  patient,
  demo,
  onRestart,
}: {
  patient: SeedPatient
  demo: boolean
  onRestart: () => void
}) {
  const { session } = usePlay()
  const fullscreen = isLiveShell(session.phase) || session.phase === "paused"

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-20 flex bg-black">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <LivePlay />
        </div>
        {demo ? (
          <div className="hidden h-full shrink-0 lg:flex [&_aside]:flex [&_aside]:w-72">
            <ClinicStrip patient={patient} />
          </div>
        ) : null}
        {demo ? <PresenterBar onRestart={onRestart} /> : null}
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-[#0a0a0c]">
      <div className="flex min-h-full flex-1 justify-center portrait-phone">
        <PhoneColumn patient={patient} />
        {demo ? <ClinicStrip patient={patient} /> : null}
      </div>
      {demo ? <PresenterBar onRestart={onRestart} /> : null}
    </div>
  )
}
