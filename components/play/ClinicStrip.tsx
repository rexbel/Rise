"use client"

import { Badge } from "@/components/ui/badge"
import { Eye, TriangleAlert, Zap } from "lucide-react"
import { usePlay } from "@/components/play/PlayProvider"
import { playDisplay } from "@/components/play/playTheme"
import ui from "@/content/play-ui.json"
import { pickFinding } from "@/lib/play/formatPatient"
import { exerciseById } from "@/lib/play/programs"
import type { CosmosLook } from "@/lib/play/cosmosClient"
import type { CosmosTrigger, SeedPatient } from "@/lib/types"

/** Projector strip — same hit language as the phone. */
export function ClinicStrip({ patient }: { patient: SeedPatient }) {
  const { session, hitCount, hitLog, cosmosLooks } = usePlay()
  const findings = session.finishedSet?.findings ?? session.findings
  const finding = pickFinding(findings)
  const workout = exerciseById(session.finishedSet?.exerciseId ?? session.exerciseId)
  const lineLabel = finding
    ? finding.id === "arms"
      ? "Miss — hands"
      : finding.id === "valgus"
        ? "Miss — knees"
        : "Form miss"
    : session.phase === "live" || session.phase === "paused" || session.phase === "stepBack"
      ? "Playing…"
      : "Ready"

  return (
    <aside className="hidden h-full w-80 shrink-0 flex-col gap-5 overflow-y-auto border-l border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-100 lg:flex">
      <div className="flex flex-wrap items-center gap-2">
        <p className={`${playDisplay.className} text-lg font-bold`}>
          {patient.display_name.split(" ")[0]}
        </p>
        {session.demo ? (
          <Badge className="border-0 bg-orange-500/20 text-orange-200">{ui.live.demo_badge}</Badge>
        ) : null}
      </div>

      <div className="rounded-2xl border border-zinc-700 bg-zinc-900/80 p-4">
        <p className="text-xs tracking-wide text-zinc-500">{ui.close.workout_label}</p>
        <p className={`${playDisplay.className} mt-1 text-xl font-bold text-zinc-50`}>{workout.name}</p>
        <p className="mt-3 text-xs tracking-wide text-zinc-500">{ui.close.hits_label}</p>
        <p className="mt-1 flex items-center gap-2 text-4xl font-extrabold text-orange-400">
          <Zap className="size-8 fill-orange-400" aria-hidden />
          {hitCount}
        </p>
        <p className="mt-2 text-base text-zinc-300">{lineLabel}</p>
      </div>

      <div>
        <p className="mb-2 text-xs tracking-wide text-zinc-500">{ui.close.timeline_label}</p>
        <div className="flex h-10 gap-0.5 overflow-hidden rounded-xl bg-zinc-900">
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

      <CosmosPanel looks={cosmosLooks} demoBadge={ui.live.demo_badge} />

      <p className="mt-auto text-xs text-zinc-600">Same session as the phone</p>
    </aside>
  )
}

const TRIGGER_LABEL: Record<CosmosTrigger, string> = {
  valgus: "Miss — knees",
  speed: "Miss — speed",
  arms: "Miss — hands",
  asymmetry: "Miss — one side",
  tracking_lost: "Out of frame",
}

const VERDICT_LABEL = { confirms: "Confirms", disagrees: "Disagrees", unclear: "Unclear" } as const
const VERDICT_STYLE = {
  confirms: "bg-orange-500/20 text-orange-200",
  disagrees: "bg-emerald-500/20 text-emerald-200",
  unclear: "bg-zinc-700 text-zinc-200",
} as const

/** YOLO flags on-device; Cosmos verifies from the last ~2 s. Care-team only. */
function CosmosPanel({ looks, demoBadge }: { looks: CosmosLook[]; demoBadge: string }) {
  return (
    <section aria-label="Cosmos second look">
      <p className="mb-2 flex items-center gap-1.5 text-xs tracking-wide text-zinc-500">
        <Eye className="size-3.5" aria-hidden /> Cosmos second look
      </p>
      {looks.length === 0 ? (
        <p className="rounded-xl bg-zinc-900 p-3 text-zinc-600">Checks each miss YOLO flags</p>
      ) : (
        <ol className="flex flex-col gap-2" aria-live="polite">
          {[...looks].reverse().map((l) => (
            <li key={l.id} className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium text-zinc-100">{TRIGGER_LABEL[l.trigger]}</span>
                <span className="text-xs text-zinc-500">{(l.atMs / 1000).toFixed(1)} s</span>
                {l.result ? (
                  <Badge className={`border-0 ${VERDICT_STYLE[l.result.verdict]}`}>{VERDICT_LABEL[l.result.verdict]}</Badge>
                ) : (
                  <Badge className="border-0 bg-zinc-800 text-zinc-300">Looking…</Badge>
                )}
                {l.result?.demoData ? <Badge className="border-0 bg-orange-500/20 text-orange-200">{demoBadge}</Badge> : null}
              </div>
              {l.result ? (
                <>
                  {l.result.safetyConcern ? (
                    <p className="mt-2 flex items-center gap-1.5 font-medium text-amber-300">
                      <TriangleAlert className="size-4" aria-hidden /> Needs a human look
                    </p>
                  ) : null}
                  <p className="mt-1.5 text-zinc-300">{l.result.observation}</p>
                  {l.result.compensations.length ? (
                    <p className="mt-1 text-xs text-zinc-400">Seen: {l.result.compensations.join(", ")}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-zinc-600">
                    {l.result.demoData ? "Pose tracking only" : `${l.result.model} · ${(l.result.latencyMs / 1000).toFixed(1)} s`}
                  </p>
                </>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
