"use client"

import { Badge } from "@/components/ui/badge"
import { Zap } from "lucide-react"
import { usePlay } from "@/components/play/PlayProvider"
import { pickFinding } from "@/lib/play/formatPatient"
import type { SeedPatient } from "@/lib/types"

/** Demo side panel — hit timeline + line state (not clinical debug labels). */
export function ClinicStrip({ patient }: { patient: SeedPatient }) {
  const { session, hitCount, hitLog } = usePlay()
  const findings = session.finishedSet?.findings ?? session.findings
  const finding = pickFinding(findings)
  const lineLabel = finding
    ? finding.id === "arms"
      ? "Line bent — hands"
      : finding.id === "valgus"
        ? "Line bent — knee"
        : "Form changed"
    : session.phase === "live" || session.phase === "paused" || session.phase === "stepBack"
      ? "Keeping the line…"
      : "Ready"

  return (
    <aside className="hidden w-80 shrink-0 flex-col gap-5 border-l border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-100 lg:flex">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium">{patient.display_name.split(" ")[0]}</p>
        {session.demo ? <Badge className="border-0 bg-zinc-800 text-zinc-300">Demo replay</Badge> : null}
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4">
        <p className="text-xs tracking-wide text-zinc-500">Combo</p>
        <p className="mt-1 flex items-center gap-2 text-3xl font-semibold text-orange-400">
          <Zap className="size-7 fill-orange-400" aria-hidden />
          {hitCount} hits
        </p>
        <p className="mt-2 text-base text-zinc-300">{lineLabel}</p>
      </div>

      <div>
        <p className="mb-2 text-xs tracking-wide text-zinc-500">Hit timeline</p>
        <div className="flex h-10 gap-0.5 overflow-hidden rounded-lg bg-zinc-900">
          {hitLog.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-zinc-600">Play to fill</div>
          ) : (
            hitLog.map((kind, i) => (
              <div
                key={`${kind}-${i}`}
                title={kind}
                className={kind === "hit" ? "min-w-1.5 flex-1 bg-emerald-500" : "min-w-1.5 flex-1 bg-orange-500"}
              />
            ))
          )}
        </div>
        <p className="mt-2 text-xs text-zinc-500">Green = hit · Orange = miss</p>
      </div>

      <p className="mt-auto text-xs text-zinc-600">Same session as the phone · synthetic data</p>
    </aside>
  )
}
