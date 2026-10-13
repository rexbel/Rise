"use client"

import type { ReactNode } from "react"
import Image from "next/image"
import ui from "@/content/play-ui.json"
import { playDisplay } from "@/components/play/playTheme"
import { playerHome } from "@/lib/play/playerHome"
import type { ProgramExercise } from "@/lib/play/programs"
import type { SeedPatient } from "@/lib/types"

/** Pre-game player home — web-first layout, stacks on small screens. */
export function PlayerHome({
  patient,
  selectedId,
  onSelect,
  showDemoBadge = true,
  actions,
}: {
  patient: SeedPatient
  selectedId?: string
  onSelect?: (id: ProgramExercise["id"]) => void
  showDemoBadge?: boolean
  /** Begin / voice / back — sits under missions on mobile, in the right column on desktop. */
  actions?: ReactNode
}) {
  const home = playerHome(patient)
  const trendLine = ui.home.trend[home.trend]

  return (
    <div className="rn-home-enter grid gap-6 motion-reduce:animate-none lg:grid-cols-12 lg:gap-8">
      {/* Identity + progress */}
      <section className="rounded-2xl border border-zinc-700/80 bg-zinc-900/70 p-5 sm:p-6 lg:col-span-5 lg:p-8">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xl font-semibold tracking-wide text-orange-400">{ui.home.eyebrow}</p>
          {showDemoBadge ? (
            <span className="rounded-full bg-orange-500/20 px-3 py-1 text-xl font-semibold text-orange-200">
              {ui.home.demo_chip}
            </span>
          ) : null}
        </div>

        <div className="mt-6 flex items-center gap-4 sm:gap-5">
          <div className="relative size-20 shrink-0 overflow-hidden rounded-full ring-2 ring-orange-500 sm:size-24 lg:size-28">
            <Image
              src={home.avatarSrc}
              alt={home.displayName}
              fill
              className="object-cover"
              sizes="(min-width: 1024px) 112px, 96px"
              priority
            />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 className={`${playDisplay.className} text-3xl font-bold text-zinc-50 sm:text-4xl`}>
                {home.firstName}
              </h2>
              <span className="rounded-full bg-orange-500/20 px-2.5 py-0.5 text-xl font-semibold uppercase tracking-wide text-orange-300">
                {ui.home.you_badge}
              </span>
            </div>
            <p className="mt-1 text-xl text-zinc-300">
              {home.dayLabel} · {home.recoveryLabel}
            </p>
            <p className="mt-0.5 text-xl text-zinc-500">{home.trackLabel}</p>
          </div>
        </div>

        <ul className="mt-6 grid grid-cols-2 gap-3">
          <Chip label={ui.home.chips.rank} value={home.rankPlace} />
          <Chip label={ui.home.chips.hits} value={String(home.weekHits)} />
        </ul>

        <p className="mt-4 text-xl leading-snug text-zinc-400">
          {ui.home.meta_checkins.replace("{n}", String(home.checkInsDone))}
          <span className="mx-2 text-zinc-600" aria-hidden>
            ·
          </span>
          {ui.home.next_prefix} {home.nextSessionLabel}
        </p>
        <p className="mt-2 text-xl leading-snug text-zinc-400">{trendLine}</p>
      </section>

      {/* Missions + actions */}
      <section className="flex flex-col rounded-2xl border border-zinc-700/80 bg-zinc-900/70 p-5 sm:p-6 lg:col-span-7 lg:p-8">
        <p className={`${playDisplay.className} text-2xl font-bold text-zinc-50 sm:text-3xl`}>
          {ui.home.missions_label}
        </p>

        <ul className="mt-4 flex flex-1 flex-col gap-3">
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
                  className={`w-full rounded-2xl border px-5 py-5 text-left motion-safe:transition-[border-color,background-color,transform] motion-safe:duration-200 motion-reduce:transition-none ${
                    selected
                      ? "border-orange-500 bg-orange-500/15 motion-safe:scale-[1.01] motion-reduce:scale-100"
                      : "border-zinc-700 bg-zinc-950/50 hover:border-zinc-500"
                  } ${onSelect ? "cursor-pointer" : "cursor-default"}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <span className={`${playDisplay.className} text-2xl font-bold text-zinc-50`}>
                      {w.name}
                    </span>
                    <span className="shrink-0 rounded-full bg-orange-500 px-3 py-1 text-xl font-semibold text-white">
                      {selected ? ui.home.mission_badge_selected : ui.home.mission_badge_today}
                    </span>
                  </div>
                  <p className="mt-2 text-xl text-zinc-400">{repsLabel}</p>
                </button>
              </li>
            )
          })}
        </ul>

        <p className="mt-4 text-xl leading-snug text-zinc-400">{ui.home.hint}</p>

        {actions ? <div className="mt-6 flex flex-col gap-3">{actions}</div> : null}
      </section>
    </div>
  )
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <li className="rounded-2xl border border-zinc-700 bg-zinc-950/60 px-4 py-3">
      <p className="text-xl font-medium text-zinc-500">{label}</p>
      <p className={`${playDisplay.className} mt-1 text-2xl font-bold leading-tight text-zinc-50`}>
        {value}
      </p>
    </li>
  )
}
