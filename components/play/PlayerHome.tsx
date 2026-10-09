"use client"

import Image from "next/image"
import ui from "@/content/play-ui.json"
import { playDisplay } from "@/components/play/playTheme"
import { playerHome } from "@/lib/play/playerHome"
import type { ProgramExercise } from "@/lib/play/programs"
import type { SeedPatient } from "@/lib/types"

/** Pre-game player home — identity, safe progress, today’s missions. */
export function PlayerHome({
  patient,
  selectedId,
  onSelect,
  showDemoBadge = true,
}: {
  patient: SeedPatient
  selectedId?: string
  onSelect?: (id: ProgramExercise["id"]) => void
  showDemoBadge?: boolean
}) {
  const home = playerHome(patient)
  const trendLine = ui.home.trend[home.trend]

  return (
    <div className="rounded-2xl border border-zinc-700 bg-zinc-900/80 p-4 text-left">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xl font-semibold tracking-wide text-orange-400">{ui.home.eyebrow}</p>
        {showDemoBadge ? (
          <span className="rounded-full bg-orange-500/20 px-2.5 py-1 text-xl font-semibold text-orange-200">
            {ui.home.demo_chip}
          </span>
        ) : null}
      </div>

      <div className="rn-home-enter mt-4 flex items-center gap-3 motion-reduce:animate-none">
        <div className="relative size-16 shrink-0 overflow-hidden rounded-full ring-2 ring-orange-500 sm:size-[4.5rem]">
          <Image
            src={home.avatarSrc}
            alt={home.displayName}
            fill
            className="object-cover"
            sizes="72px"
            priority
          />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className={`${playDisplay.className} text-2xl font-bold text-zinc-50`}>
              {home.firstName}
            </h2>
            <span className="rounded-full bg-orange-500/20 px-2 py-0.5 text-xl font-semibold uppercase tracking-wide text-orange-300">
              {ui.home.you_badge}
            </span>
          </div>
          <p className="mt-0.5 text-xl text-zinc-300">
            {home.dayLabel} · {home.recoveryLabel}
          </p>
          <p className="mt-0.5 text-xl text-zinc-500">{home.trackLabel}</p>
        </div>
      </div>

      <ul className="mt-4 grid grid-cols-2 gap-2">
        <Chip label={ui.home.chips.rank} value={home.rankPlace} />
        <Chip label={ui.home.chips.hits} value={String(home.weekHits)} />
      </ul>

      <p className="mt-3 text-xl leading-snug text-zinc-400">
        {ui.home.meta_checkins.replace("{n}", String(home.checkInsDone))}
        <span className="mx-2 text-zinc-600" aria-hidden>
          ·
        </span>
        {ui.home.next_prefix} {home.nextSessionLabel}
      </p>

      <p className="mt-2 text-xl leading-snug text-zinc-400">{trendLine}</p>

      <p className="mt-5 text-xl font-semibold text-zinc-400">{ui.home.missions_label}</p>
      <ul className="mt-2 flex flex-col gap-2">
        {home.missions.map((w) => {
          const selected = selectedId === w.id
          const repsLabel =
            w.endRule === "hold"
              ? ui.program.hold.replace("{sec}", String(w.holdSec ?? 20))
              : ui.program.sets_reps
                  .replace("{sets}", String(w.sets))
                  .replace("{reps}", String(w.reps))
          return (
            <li key={w.id}>
              <button
                type="button"
                disabled={!onSelect}
                onClick={() => onSelect?.(w.id)}
                className={`w-full rounded-xl border px-4 py-4 text-left motion-safe:transition-[border-color,background-color,transform] motion-safe:duration-200 motion-reduce:transition-none ${
                  selected
                    ? "border-orange-500 bg-orange-500/15 motion-safe:scale-[1.01] motion-reduce:scale-100"
                    : "border-zinc-700 bg-zinc-950/60 hover:border-zinc-500"
                } ${onSelect ? "cursor-pointer" : "cursor-default"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className={`${playDisplay.className} text-xl font-bold text-zinc-50`}>
                    {w.name}
                  </span>
                  <span className="shrink-0 rounded-full bg-orange-500 px-2.5 py-1 text-xl font-semibold text-white">
                    {selected ? ui.home.mission_badge_selected : ui.home.mission_badge_today}
                  </span>
                </div>
                <p className="mt-1 text-xl text-zinc-400">{repsLabel}</p>
              </button>
            </li>
          )
        })}
      </ul>

      <p className="mt-3 text-xl leading-snug text-zinc-400">{ui.home.hint}</p>
    </div>
  )
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <li className="rounded-xl border border-zinc-700 bg-zinc-950/60 px-3 py-2.5">
      <p className="text-xl font-medium text-zinc-500">{label}</p>
      <p className={`${playDisplay.className} mt-0.5 text-xl font-bold leading-tight text-zinc-50`}>
        {value}
      </p>
    </li>
  )
}
