"use client"

import ui from "@/content/play-ui.json"
import type { SeedPatient } from "@/lib/types"

/** Journey step 2 — condition + today’s program before Begin. */
export function ConditionCard({ patient }: { patient: SeedPatient }) {
  const first = patient.display_name.split(" ")[0]
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4 text-left">
      <p className="text-xs font-medium tracking-wide text-orange-400">{ui.condition.eyebrow}</p>
      <p className="mt-1 text-xl font-semibold text-zinc-50">{first}</p>
      <dl className="mt-3 space-y-2 text-base text-zinc-300">
        <div>
          <dt className="text-xs text-zinc-500">{ui.condition.procedure_label}</dt>
          <dd>{patient.episode.procedure}</dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500">{ui.condition.pod_label}</dt>
          <dd>Day {patient.episode.post_op_day_today}</dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500">{ui.condition.game_label}</dt>
          <dd className="font-medium text-zinc-100">{ui.condition.game_name}</dd>
          <dd className="mt-1 text-sm text-zinc-400">{ui.condition.game_why}</dd>
        </div>
      </dl>
    </div>
  )
}
