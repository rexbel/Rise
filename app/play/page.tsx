import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { CrewBoard } from "@/components/play/CrewBoard"
import { playBody, playDisplay, ptCta, ptLink } from "@/components/play/playTheme"
import ui from "@/content/play-ui.json"
import { DEFAULT_YOU_ID } from "@/lib/play/cohort"
import { missionDose, playerHome } from "@/lib/play/playerHome"
import { getPatient } from "@/lib/seed"
import { cn } from "@/lib/utils"

/**
 * Your week: the patient's own progress first (Continue stays the first action), then their crew. The crew shows
 * days active and cheers only: no ranks, places, scores, or counts from stands.
 */
export default function YourWeekPage() {
  const patient = getPatient(DEFAULT_YOU_ID)
  if (!patient) notFound()
  const home = playerHome(patient)

  return (
    <main className={cn("min-h-full flex-1 bg-pt-bg text-pt-ink", playBody.className)}>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
        <header className="flex flex-col gap-3 border-b border-pt-line pb-6">
          <p className="text-xl font-semibold text-pt-accent">{ui.brand}</p>
          <h1 className={`${playDisplay.className} text-4xl font-extrabold tracking-tight sm:text-5xl`}>{ui.week.title}</h1>
          <p className="max-w-xl text-xl leading-snug text-pt-muted">{ui.week.body}</p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <section aria-labelledby="you-heading" className="flex flex-col gap-5 rounded-2xl border border-pt-line bg-pt-surface p-5 sm:p-6">
            <div className="flex items-center gap-4">
              <div className="relative size-20 shrink-0 overflow-hidden rounded-full ring-2 ring-pt-accent sm:size-24">
                <Image src={home.avatarSrc} alt="" fill className="object-cover" sizes="96px" priority />
              </div>
              <div className="min-w-0">
                <h2 id="you-heading" className={`${playDisplay.className} text-3xl font-bold leading-tight`}>
                  {home.displayName}
                </h2>
                <p className="mt-1 text-xl text-pt-ink">{home.sinceSurgeryLabel}</p>
                <p className="text-xl text-pt-muted">{home.recoveryLabel}</p>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-pt-line bg-pt-bg/60 px-4 py-3">
                <dt className="text-xl text-pt-muted">{ui.week.checkins_label}</dt>
                <dd className={`${playDisplay.className} mt-1 text-3xl font-bold`}>{home.checkInsDone}</dd>
              </div>
              <div className="rounded-xl border border-pt-line bg-pt-bg/60 px-4 py-3">
                <dt className="text-xl text-pt-muted">{ui.week.next_label}</dt>
                <dd className={`${playDisplay.className} mt-1 text-2xl font-bold leading-tight`}>{home.nextSessionLabel}</dd>
              </div>
            </dl>

            <div>
              <p className="text-xl text-pt-muted">{ui.week.last_time_label}</p>
              <p className="mt-1 text-2xl font-semibold leading-snug">{home.trendLabel}</p>
            </div>
          </section>

          <section aria-labelledby="missions-heading" className="flex flex-col gap-4 rounded-2xl border border-pt-line bg-pt-surface p-5 sm:p-6">
            <h2 id="missions-heading" className={`${playDisplay.className} text-2xl font-bold sm:text-3xl`}>
              {ui.week.missions_label}
            </h2>
            <ul className="flex flex-col gap-3">
              {home.missions.map((m) => (
                <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-pt-line bg-pt-bg/60 px-4 py-4">
                  <span className={`${playDisplay.className} text-2xl font-bold`}>{m.name}</span>
                  <span className="text-xl text-pt-muted">{missionDose(m)}</span>
                </li>
              ))}
            </ul>
            <p className="text-xl leading-snug text-pt-muted">{ui.home.hint}</p>
            <Link href={`/play/${home.riseId}`} className={cn(ptCta, "mt-auto inline-flex h-16 min-h-16 items-center justify-center text-2xl", playDisplay.className)}>
              {ui.week.continue}
            </Link>
          </section>
        </div>

        <CrewBoard riseId={home.riseId} />

        <footer className="flex flex-col gap-2 border-t border-pt-line pt-5 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className={cn(ptLink, "inline-flex min-h-14 items-center self-start")}>
            {ui.week.back_lobby}
          </Link>
          <p className="text-xl text-pt-muted">
            {ui.synthetic} · Synthetic Hospital
          </p>
        </footer>
      </div>
    </main>
  )
}
