"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { CalendarClock, PauseCircle, Send, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { SessionSnapshot } from "@/lib/types"
import { cn } from "@/lib/utils"
import {
  finalRecommendation,
  latestByPatient,
  RECOMMENDATION_LABEL,
  statusText,
  type PatientSummary,
} from "./format"
import { nextCheckInView, seedNextCheckIn } from "./followup"
import { SendCheckInDialog } from "./send-dialog"
import { Eyebrow, RecommendationText, STATUS_ICON, StatusText, focusRing } from "./status"
import { useClinic, useNow } from "./store"

/** C1: the seven seed patients, their recovery day, and what their latest session is doing. */
export function PatientList() {
  const { patients, sessions, loaded } = useClinic()
  const [target, setTarget] = useState<PatientSummary | null>(null)
  const latest = useMemo(() => latestByPatient([...sessions.values()]), [sessions])

  return (
    <section aria-labelledby="patients-heading" className="min-w-0">
      <div className="mb-3 flex items-baseline justify-between gap-4 border-b border-cl-ink pb-2">
        <h2 id="patients-heading" className="font-[family-name:var(--font-cl-serif)] text-2xl font-semibold">
          Patients
        </h2>
        <p className="text-base text-cl-muted">{patients.length} in monitoring</p>
      </div>

      {/* Table from md up; stacked rows on phones so nothing scrolls sideways. */}
      <table className="hidden w-full border-collapse text-left text-base md:table">
        <thead>
          <tr className="border-b border-cl-line">
            <Th>Patient</Th>
            <Th className="text-right">Post-op day</Th>
            <Th>Episode</Th>
            <Th>Last check-in</Th>
            <Th>Next check-in</Th>
            <Th>Session</Th>
            <Th>
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {patients.map((p) => (
            <tr key={p.riseId} className="border-b border-cl-line align-top">
              <td className="py-3 pr-3">
                <p className="font-semibold">{p.name}</p>
                <p className="text-cl-muted">
                  {p.procedure}
                  <span className="whitespace-nowrap">
                    {" "}
                    · {p.age} {p.sex}
                  </span>
                </p>
              </td>
              <td className="py-3 pr-3 text-right font-[family-name:var(--font-cl-serif)] text-2xl leading-tight font-semibold tabular-nums">
                {p.postOpDay}
              </td>
              <td className="py-3 pr-3">
                <Episode p={p} />
              </td>
              <td className="py-3 pr-3">
                <LastCheckIn p={p} session={latest.get(p.riseId)} />
              </td>
              <td className="py-3 pr-3">
                <NextCheckInCell p={p} session={latest.get(p.riseId)} />
              </td>
              <td className="py-3 pr-3">
                <SessionCell session={latest.get(p.riseId)} loaded={loaded} />
              </td>
              <td className="py-3 text-right">
                <SendButton p={p} onClick={() => setTarget(p)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="grid gap-0 md:hidden">
        {patients.map((p) => (
          <li key={p.riseId} className="grid gap-2 border-b border-cl-line py-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-lg font-semibold">{p.name}</p>
              <p className="shrink-0 text-cl-muted">
                POD <span className="font-semibold text-cl-ink tabular-nums">{p.postOpDay}</span>
              </p>
            </div>
            <p className="text-cl-muted">
              {p.procedure} · {p.age} {p.sex}
            </p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt className="text-cl-muted">Episode</dt>
              <dd>
                <Episode p={p} />
              </dd>
              <dt className="text-cl-muted">Last</dt>
              <dd>
                <LastCheckIn p={p} session={latest.get(p.riseId)} />
              </dd>
              <dt className="text-cl-muted">Next</dt>
              <dd>
                <NextCheckInCell p={p} session={latest.get(p.riseId)} />
              </dd>
              <dt className="text-cl-muted">Session</dt>
              <dd>
                <SessionCell session={latest.get(p.riseId)} loaded={loaded} />
              </dd>
            </dl>
            <SendButton p={p} onClick={() => setTarget(p)} className="w-full" />
          </li>
        ))}
      </ul>

      <p className="mt-3 text-sm text-cl-muted">
        Next check-in follows the Rise default schedule (or the clinician-set cadence), not a clinical standard. A decided
        card or a recorded follow-up updates it.
      </p>

      <SendCheckInDialog patient={target} onClose={() => setTarget(null)} />
    </section>
  )
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th scope="col" className={cn("py-2 pr-3 align-bottom", className)}>
      <Eyebrow as="span">{children}</Eyebrow>
    </th>
  )
}

function Episode({ p }: { p: PatientSummary }) {
  return (
    <span className="whitespace-nowrap">
      Day <span className="font-semibold tabular-nums">{p.episodeDay}</span> of {p.episodeLength}
      {p.episodeType === "reactivated" && <span className="block text-cl-muted">Reactivated</span>}
    </span>
  )
}

function LastCheckIn({ p, session }: { p: PatientSummary; session: SessionSnapshot | undefined }) {
  if (session?.card) {
    return (
      <span>
        Today <span className="block text-cl-muted">this session</span>
      </span>
    )
  }
  return (
    <span>
      {p.lastCheckIn.label} <span className="block text-cl-muted">POD {p.lastCheckIn.postOpDay}</span>
    </span>
  )
}

/** The latest session's next check-in, else the seed's scheduled one. Icon + words; never color alone. */
function NextCheckInCell({ p, session }: { p: PatientSummary; session: SessionSnapshot | undefined }) {
  const now = useNow(60_000)
  const nc = session?.nextCheckIn ?? seedNextCheckIn(p.cadence)
  const v = nextCheckInView(nc, now)
  // Seed rows carry no due date, so "Scheduled" marks them as the plan rather than a session result.
  const detail = v.on ?? (nc.source === "seed" ? "Scheduled" : null)
  if (v.paused) {
    return (
      <span title={nc.reason}>
        <StatusText icon={PauseCircle} tone="confirm">
          Paused
        </StatusText>
        <span className="block text-cl-muted">until a clinician clears them</span>
      </span>
    )
  }
  return (
    <span title={`${nc.reason} · ${nc.phase}`}>
      <StatusText icon={v.overdue ? TriangleAlert : CalendarClock} tone={v.overdue ? "confirm" : "neutral"}>
        {v.when}
      </StatusText>
      {detail && <span className="block whitespace-nowrap text-cl-muted">{detail}</span>}
    </span>
  )
}

function SessionCell({ session, loaded }: { session: SessionSnapshot | undefined; loaded: boolean }) {
  if (!loaded) return <Skeleton className="h-5 w-28 bg-cl-line" aria-label="Loading session status" />
  if (!session) return <span className="text-cl-muted">No check-in sent</span>
  const final = finalRecommendation(session)
  return (
    <Link
      href={`/clinic/s/${session.sessionId}`}
      className={cn("group inline-grid gap-0.5 rounded-sm", focusRing)}
      aria-label={`Open session: ${statusText(session)}${final ? `, ${RECOMMENDATION_LABEL[final]}` : ""}`}
    >
      <StatusText icon={STATUS_ICON[session.status]} tone="neutral" className="group-hover:underline">
        {statusText(session)}
      </StatusText>
      {final && <RecommendationText rec={final}>{RECOMMENDATION_LABEL[final]}</RecommendationText>}
    </Link>
  )
}

function SendButton({ p, onClick, className }: { p: PatientSummary; onClick: () => void; className?: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      className={cn("h-11 border-cl-ink/30 bg-cl-surface px-3 text-base text-cl-ink hover:bg-cl-paper", focusRing, className)}
      aria-label={`Send check-in to ${p.name}`}
      title={`Send check-in to ${p.name}`}
    >
      <Send aria-hidden />
      {/* Icon-only on tablet widths so the table fits; the aria-label and title keep the name. */}
      <span className="md:max-lg:sr-only">Send check-in</span>
    </Button>
  )
}
