"use client"

import { useState } from "react"
import { ClinicStrip } from "@/components/play/ClinicStrip"
import { PhoneColumn } from "@/components/play/PhoneColumn"
import { PlayProvider } from "@/components/play/PlayProvider"
import { PresenterBar } from "@/components/play/PresenterBar"
import type { SeedPatient } from "@/lib/types"

export function PlaySessionView({ patient, demo }: { patient: SeedPatient; demo: boolean }) {
  const [restartKey, setRestartKey] = useState(0)
  return (
    <PlayProvider key={restartKey} riseId={patient.rise_id} demo={demo}>
      <div className="flex min-h-full flex-1 flex-col bg-[#0a0a0c]">
        <div className="flex min-h-full flex-1 justify-center portrait-phone">
          <PhoneColumn patient={patient} />
          {demo ? <ClinicStrip patient={patient} /> : null}
        </div>
        {demo ? <PresenterBar onRestart={() => setRestartKey((k) => k + 1)} /> : null}
      </div>
    </PlayProvider>
  )
}
