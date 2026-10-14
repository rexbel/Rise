"use client"

import { useEffect, useState, type ReactNode } from "react"
import Image from "next/image"
import { Check } from "lucide-react"
import ui from "@/content/play-ui.json"
import { useCrewBoard } from "@/components/play/CrewBoard"
import { playDisplay, ptFocus } from "@/components/play/playTheme"
import { homeChipsRow } from "@/lib/play/crewView"
import {
  crewChips,
  fetchNextCheckIn,
  missionDose,
  NEXT_PAUSED_LABEL,
  patientNextCheckInLabel,
  playerHome,
} from "@/lib/play/playerHome"
import type { ProgramExercise } from "@/lib/play/programs"
import type { SeedPatient } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * Pre-game player home: the patient's own progress, plus their own crew chips (days active, cheers) once the crew
 * loads. The chips never block Begin and simply stay hidden if the crew is unavailable. Web-first, stacks on mobile.
 */
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
  const { state: crew } = useCrewBoard(patient.rise_id)
  // Chips only while the patient is on the crew: never when paused or not joined.
  const chips = crewChips(homeChipsRow(crew.status === "ready" ? crew.board : undefined))
  // Never the scripted seed date: until the care team's schedule loads, a placeholder; if it can't load, the neutral line.
  const nextLabel = useNextCheckInLabel(patient.rise_id) ?? "…"

  return (
    <div className="rn-home-enter grid gap-6 motion-reduce:animate-none lg:grid-cols-12 lg:gap-8">
      {/* Identity + own progress */}
      <section className="rounded-2xl border border-pt-line bg-pt-surface p-5 sm:p-6 lg:col-span-5 lg:p-8">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xl font-semibold tracking-wide text-pt-accent">{ui.home.eyebrow}</p>
          {showDemoBadge ? (
            <span className="rounded-full border border-pt-accent/50 px-3 py-1 text-xl font-semibold text-pt-ink">
              {ui.home.demo_chip}
            </span>
          ) : null}
        </div>

        <div className="mt-6 flex items-center gap-4 sm:gap-5">
          <div className="relative size-20 shrink-0 overflow-hidden rounded-full ring-2 ring-pt-accent sm:size-24 lg:size-28">
            <Image src={home.avatarSrc} alt="" fill className="object-cover" sizes="(min-width: 1024px) 112px, 96px" priority />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 className={`${playDisplay.className} text-3xl font-bold text-pt-ink sm:text-4xl`}>{home.firstName}</h2>
              <span className="rounded-full bg-pt-surface-2 px-2.5 py-0.5 text-xl font-semibold text-pt-ink">
                {ui.home.you_badge}
              </span>
            </div>
            <p className="mt-1 text-xl text-pt-ink">
              {home.sinceSurgeryLabel} · {home.recoveryLabel}
            </p>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-3">
          <Fact label={ui.week.checkins_label} value={String(home.checkInsDone)} />
          <Fact label={ui.week.next_label} value={nextLabel} compact={nextLabel === NEXT_PAUSED_LABEL} />
          {chips.map((c) => (
            <Fact key={c.key} label={c.label} value={c.value} />
          ))}
        </dl>

        <div className="mt-4">
          <p className="text-xl text-pt-muted">{ui.week.last_time_label}</p>
          <p className="mt-1 text-xl font-semibold leading-snug text-pt-ink">{home.trendLabel}</p>
        </div>
      </section>

      {/* Missions + actions */}
      <section className="flex flex-col rounded-2xl border border-pt-line bg-pt-surface p-5 sm:p-6 lg:col-span-7 lg:p-8">
        <h3 className={`${playDisplay.className} text-2xl font-bold text-pt-ink sm:text-3xl`}>{ui.home.missions_label}</h3>

        <ul className="mt-4 flex flex-1 flex-col gap-3">
          {home.missions.map((w) => {
            const selected = selectedId === w.id
            return (
              <li key={w.id}>
                <button
                  type="button"
                  disabled={!onSelect}
                  aria-pressed={onSelect ? selected : undefined}
                  onClick={() => onSelect?.(w.id)}
                  className={cn(
                    ptFocus,
                    "w-full rounded-2xl border px-5 py-5 text-left motion-safe:transition-[border-color,background-color] motion-safe:duration-200",
                    selected ? "border-pt-accent bg-pt-surface-2" : "border-pt-line bg-pt-bg/60 hover:border-pt-muted",
                    onSelect ? "cursor-pointer" : "cursor-default",
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <span className={`${playDisplay.className} text-2xl font-bold text-pt-ink`}>{w.name}</span>
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xl font-semibold",
                        selected ? "bg-pt-cta text-pt-cta-ink" : "border border-pt-line text-pt-ink",
                      )}
                    >
                      {selected ? <Check className="size-5" aria-hidden /> : null}
                      {selected ? ui.home.mission_badge_selected : ui.home.mission_badge_today}
                    </span>
                  </div>
                  <p className="mt-2 text-xl text-pt-muted">{missionDose(w)}</p>
                </button>
              </li>
            )
          })}
        </ul>

        <p className="mt-4 text-xl leading-snug text-pt-muted">{ui.home.hint}</p>

        {actions ? <div className="mt-6 flex flex-col gap-3">{actions}</div> : null}
      </section>
    </div>
  )
}

/**
 * The care team's next check-in for this patient, in words. null while loading. On any failure, the neutral "your care
 * team will let you know" line rather than a date nobody set (and no error shown to the patient).
 */
function useNextCheckInLabel(riseId: string): string | null {
  const [label, setLabel] = useState<string | null>(null)
  useEffect(() => {
    const ctrl = new AbortController()
    fetchNextCheckIn(riseId, { signal: ctrl.signal })
      .then((nc) => setLabel(patientNextCheckInLabel(nc, Date.now())))
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted || (e instanceof Error && e.name === "TimeoutError")) setLabel(NEXT_PAUSED_LABEL)
      })
    return () => ctrl.abort()
  }, [riseId])
  return label
}

function Fact({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className="rounded-2xl border border-pt-line bg-pt-bg/60 px-4 py-3">
      <dt className="text-xl text-pt-muted">{label}</dt>
      <dd className={cn(playDisplay.className, "mt-1 font-bold leading-tight text-pt-ink", compact ? "text-xl" : "text-2xl")}>
        {value}
      </dd>
    </div>
  )
}
