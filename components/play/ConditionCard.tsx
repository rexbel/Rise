"use client"

import ui from "@/content/play-ui.json"
import { playDisplay } from "@/components/play/playTheme"
import { todaysProgram, type ProgramExercise } from "@/lib/play/programs"
import type { SeedPatient } from "@/lib/types"

/** Today’s move picker — game modes, not clinic chart. */
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
    <div className="rounded-2xl border border-zinc-700 bg-zinc-900/80 p-4 text-left">
      <p className="text-xs font-semibold tracking-wide text-orange-400">{ui.condition.eyebrow}</p>
      <p className={`${playDisplay.className} mt-1 text-2xl font-bold text-zinc-50`}>{first}</p>
      <p className="mt-1 text-sm text-zinc-500">
        {patient.episode.procedure} · day {patient.episode.post_op_day_today}
      </p>
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
                className={`w-full rounded-xl border px-4 py-4 text-left transition-colors ${
                  selected
                    ? "border-orange-500 bg-orange-500/15"
                    : "border-zinc-700 bg-zinc-950/60 hover:border-zinc-500"
                } ${onSelect ? "cursor-pointer" : "cursor-default"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className={`${playDisplay.className} text-lg font-bold text-zinc-50`}>
                    {w.name}
                  </span>
                  <span className="shrink-0 rounded-full bg-orange-500 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                    {ui.condition.playable_badge}
                  </span>
                </div>
                <p className="mt-1 text-sm text-zinc-400">{repsLabel}</p>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 text-base text-zinc-400">{ui.condition.game_why}</p>
    </div>
  )
}
