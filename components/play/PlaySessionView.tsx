"use client"

import { useState } from "react"
import { ClinicStrip } from "@/components/play/ClinicStrip"
import { LivePlay } from "@/components/play/LivePlay"
import { PhoneColumn } from "@/components/play/PhoneColumn"
import { PlayProvider, usePlay } from "@/components/play/PlayProvider"
import { PresenterBar } from "@/components/play/PresenterBar"
import { isLiveShell } from "@/lib/play/phaseView"
import { resolvePlaySessionId } from "@/lib/play/playResult"
import type { PatientInvite, SeedPatient } from "@/lib/types"

export function PlaySessionView({
  patient,
  demo,
  invite,
  clinicName,
}: {
  patient: SeedPatient
  /** Demo for an unlinked visit (?demo=1). With an invite, the server's invite.demo decides instead. */
  demo: boolean
  /** The console invite behind this link's ?i= token, resolved on the server; null for an unlinked visit. */
  invite: PatientInvite | null
  clinicName: string
}) {
  const isDemo = invite ? invite.demo : demo
  const [restartKey, setRestartKey] = useState(0)
  // One id per page load: an invite's id when valid, else `<riseId>-<base36 time>`. Restart keeps it.
  const [sessionId] = useState(() => invite?.sessionId ?? resolvePlaySessionId(patient.rise_id, undefined, Date.now()))
  return (
    <PlayProvider
      key={restartKey}
      patient={patient}
      sessionId={sessionId}
      invited={!!invite}
      inviteToken={invite?.token ?? null}
      clinicName={clinicName}
      demo={isDemo}
    >
      <PlayShell patient={patient} demo={isDemo} onRestart={() => setRestartKey((k) => k + 1)} />
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
    <div className="flex min-h-full flex-1 flex-col bg-pt-bg">
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:flex-row lg:items-stretch lg:gap-6 lg:px-8 lg:py-8">
        <div className="min-w-0 flex-1">
          <PhoneColumn patient={patient} />
        </div>
        {demo ? (
          <div className="hidden shrink-0 lg:flex lg:w-72">
            <ClinicStrip patient={patient} />
          </div>
        ) : null}
      </div>
      {demo ? <PresenterBar onRestart={onRestart} /> : null}
    </div>
  )
}
