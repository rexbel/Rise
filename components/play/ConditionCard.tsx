"use client"

import ui from "@/content/play-ui.json"
import { todaysProgram, type ProgramExercise } from "@/lib/play/programs"
import type { SeedPatient } from "@/lib/types"

/** Journey step 2 — condition + today’s assigned RehabNinja workouts. */
export function ConditionCard({
  patient,
  selectedId,
  onSelect,
}: {
  patient: SeedPatient
  selectedId?: string
  onSelect?: (id: ProgramExercise["id"]) => void
}) {
  const first = patient.display_name.split(" ")[0]
  const workouts = todaysProgram(patient)

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
      </dl>
      <p className="mt-4 text-xs tracking-wide text-zinc-500">{ui.condition.workouts_label}</p>
      <ul className="mt-2 flex flex-col gap-2">
        {workouts.map((w) => {
          const selected = selectedId === w.id
          const repsLabel =
            w.endRule === "hold"
              ? ui.program.hold.replace("{sec}", String(w.holdSec ?? 20))
              : ui.program.sets_reps.replace("{sets}", String(w.sets)).replace("{reps}", String(w.reps))
          return (
            <li key={w.id}>
              <button
                type="button"
                disabled={!onSelect}
                onClick={() => onSelect?.(w.id)}
                className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                  selected
                    ? "border-orange-500 bg-orange-500/10"
                    : "border-zinc-700 bg-zinc-950/60 hover:border-zinc-500"
                } ${onSelect ? "cursor-pointer" : "cursor-default"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-zinc-50">{w.name}</span>
                  <span className="shrink-0 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-orange-300">
                    {ui.condition.playable_badge}
                  </span>
                </div>
                <p className="mt-1 text-sm text-zinc-400">{repsLabel}</p>
                <p className="mt-1 text-sm text-zinc-500">{w.notes}</p>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 text-sm text-zinc-500">{ui.condition.game_why}</p>
    </div>
  )
}
