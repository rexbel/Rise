"use client"

import { Badge } from "@/components/ui/badge"
import { Check, Eye, TriangleAlert, X, Zap } from "lucide-react"
import { HitTimeline } from "@/components/play/HitTimeline"
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
    <aside className="hidden h-full w-80 shrink-0 flex-col gap-5 overflow-y-auto border-l border-pt-line bg-pt-bg p-4 pb-40 text-base text-pt-ink lg:flex">
      <div className="flex flex-wrap items-center gap-2">
        <p className={`${playDisplay.className} text-lg font-bold`}>{patient.display_name.split(" ")[0]}</p>
        <span className="rounded-full bg-pt-surface-2 px-2 py-0.5 text-sm text-pt-muted">Care team view</span>
        {session.demo ? (
          <Badge className="border border-pt-accent/50 bg-transparent text-pt-ink">{ui.live.demo_badge}</Badge>
        ) : null}
      </div>

      <div className="rounded-2xl border border-pt-line bg-pt-surface p-4">
        <p className="text-sm tracking-wide text-pt-muted">{ui.close.workout_label}</p>
        <p className={`${playDisplay.className} mt-1 text-xl font-bold text-pt-ink`}>{workout.name}</p>
        <p className="mt-3 text-sm tracking-wide text-pt-muted">{ui.close.hits_label}</p>
        <p className="mt-1 flex items-center gap-2 text-4xl font-extrabold text-pt-accent">
          <Zap className="size-8 fill-current" aria-hidden />
          {hitCount}
        </p>
        <p className="mt-2 flex items-center gap-1.5 text-base text-pt-ink">
          {finding ? <X className="size-4 text-pt-miss" strokeWidth={3} aria-hidden /> : null}
          {lineLabel}
        </p>
      </div>

      <div>
        <HitTimeline hitLog={hitLog} label={ui.close.timeline_label} emptyText="Play to fill" />
        <p className="mt-2 flex items-center gap-3 text-sm text-pt-muted" aria-hidden>
          <span className="inline-flex items-center gap-1">
            <Check className="size-4 text-pt-hit" strokeWidth={3} /> hit
          </span>
          <span className="inline-flex items-center gap-1">
            <X className="size-4 text-pt-miss" strokeWidth={3} /> miss
          </span>
        </p>
      </div>

      <CosmosPanel looks={cosmosLooks} demoBadge={ui.live.demo_badge} />

      <p className="mt-auto text-sm text-pt-muted">Same session as the phone</p>
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
  confirms: "bg-pt-miss/20 text-pt-ink",
  disagrees: "bg-pt-hit/20 text-pt-ink",
  unclear: "bg-pt-surface-2 text-pt-ink",
} as const

/** YOLO flags on-device; Cosmos verifies from the last ~2 s. Care-team only. */
function CosmosPanel({ looks, demoBadge }: { looks: CosmosLook[]; demoBadge: string }) {
  return (
    <section aria-label="Cosmos second look">
      <p className="mb-2 flex items-center gap-1.5 text-sm tracking-wide text-pt-muted">
        <Eye className="size-4" aria-hidden /> Cosmos second look
      </p>
      {looks.length === 0 ? (
        <p className="rounded-xl bg-pt-surface p-3 text-pt-muted">Checks each miss YOLO flags</p>
      ) : (
        <ol className="flex flex-col gap-2" aria-live="polite">
          {[...looks].reverse().map((l) => (
            <li key={l.id} className="rounded-xl border border-pt-line bg-pt-surface p-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium text-pt-ink">{TRIGGER_LABEL[l.trigger]}</span>
                <span className="text-sm text-pt-muted">{(l.atMs / 1000).toFixed(1)} s</span>
                {l.result ? (
                  <Badge className={`border-0 ${VERDICT_STYLE[l.result.verdict]}`}>{VERDICT_LABEL[l.result.verdict]}</Badge>
                ) : (
                  <Badge className="border-0 bg-pt-surface-2 text-pt-muted">Looking…</Badge>
                )}
                {l.result?.demoData ? <Badge className="border border-pt-accent/50 bg-transparent text-pt-ink">{demoBadge}</Badge> : null}
              </div>
              {l.result ? (
                <>
                  {l.result.safetyConcern ? (
                    <p className="mt-2 flex items-center gap-1.5 font-medium text-pt-focus">
                      <TriangleAlert className="size-4" aria-hidden /> Needs a human look
                    </p>
                  ) : null}
                  <p className="mt-1.5 text-pt-ink">{l.result.observation}</p>
                  {l.result.compensations.length ? (
                    <p className="mt-1 text-sm text-pt-muted">Seen: {l.result.compensations.join(", ")}</p>
                  ) : null}
                  <p className="mt-1 text-sm text-pt-muted">
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
