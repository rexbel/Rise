"use client"

import Link from "next/link"
import { useMemo } from "react"
import { ChevronRight, CircleCheck, PauseCircle, PhoneMissed, RotateCcw } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import type { Route } from "@/lib/types"
import { cn } from "@/lib/utils"
import { attemptsLabel, todayWorklist } from "./followup"
import { formatWhen, RECOMMENDATION_LABEL, RECOMMENDATION_TONE, ROUTE_LABEL } from "./format"
import { DemoBadge, RecommendationText, StatusText, TONE_RULE, focusRing } from "./status"
import { useClinic } from "./store"

const serif = "font-[family-name:var(--font-cl-serif)]"

/**
 * Today: decided cards that still need a person to follow up, most urgent first, oldest first within each.
 * A row leaves the list once someone records a closing outcome on the triage card.
 */
export function TodayList() {
  const { sessions, loaded, patient } = useClinic()
  const rows = useMemo(() => todayWorklist([...sessions.values()]), [sessions])

  return (
    <section aria-labelledby="today-heading" className="min-w-0">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-cl-ink pb-2">
        <h2 id="today-heading" className={cn(serif, "text-2xl font-semibold")}>
          Today
          {loaded && rows.length > 0 && (
            <span className="ml-2 font-[family-name:var(--font-cl-sans)] text-base font-normal text-cl-muted tabular-nums">
              {rows.length} {rows.length === 1 ? "follow-up" : "follow-ups"} open
            </span>
          )}
        </h2>
        <p className="text-base text-cl-muted">Most urgent first. Record how each call ended on its card.</p>
      </div>

      {!loaded ? (
        <ul className="grid gap-2" aria-label="Loading follow-ups">
          {[0, 1].map((i) => (
            <li key={i} className="flex flex-wrap items-center gap-4 rounded-md border border-cl-line bg-cl-surface px-4 py-3">
              <Skeleton className="h-6 w-40 bg-cl-line" />
              <Skeleton className="h-5 w-56 bg-cl-line" />
            </li>
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <p className="flex items-center gap-2 rounded-md border border-dashed border-cl-line px-4 py-4 text-lg text-cl-muted">
          <CircleCheck aria-hidden className="size-5 shrink-0" />
          No follow-ups waiting.
        </p>
      ) : (
        <ol className="grid gap-2">
          {rows.map((s) => {
            const f = s.followUp
            const name = patient(s.riseId)?.name ?? s.riseId
            const route = f.route ? (ROUTE_LABEL[f.route as Route] ?? f.route.replace(/_/g, " ")) : null
            const tries = attemptsLabel(f.attempts)
            // New patient input sent the card back to pending: the follow-up form waits until it is decided again.
            const reopened = s.card?.approval === "pending"
            return (
              <li key={s.sessionId} className="min-w-0">
                <Link
                  href={`/clinic/s/${s.sessionId}`}
                  aria-label={`${name}: ${f.kind === "could_not_complete" ? "Couldn't complete the check-in" : RECOMMENDATION_LABEL[f.recommendation]}${route ? ` to ${route}` : ""}. Opened ${formatWhen(f.openedAt)}.${tries ? ` ${tries}.` : ""}${f.awaitingClearance ? " Waiting for clinician clearance." : ""}${reopened ? " Card reopened: decide it first." : ""} Open triage card.`}
                  className={cn(
                    "group grid gap-x-6 gap-y-1 rounded-md border border-l-[6px] border-cl-line bg-cl-surface px-4 py-3 transition-colors hover:border-cl-ink/40",
                    "md:grid-cols-[minmax(10rem,14rem)_minmax(0,1fr)_auto_auto] md:items-center",
                    TONE_RULE[RECOMMENDATION_TONE[f.recommendation]],
                    focusRing,
                  )}
                >
                  <p className="truncate text-lg font-semibold group-hover:underline">{name}</p>
                  <RecommendationText rec={f.recommendation} className="text-base">
                    {f.kind === "could_not_complete"
                      ? `Couldn't complete${s.couldNotComplete ? `: ${s.couldNotComplete.reason} problem` : ""}`
                      : RECOMMENDATION_LABEL[f.recommendation]}
                    {route && (
                      <>
                        {" "}
                        <span aria-hidden>→</span> {route}
                      </>
                    )}
                  </RecommendationText>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base md:justify-end">
                    {reopened && (
                      <StatusText icon={RotateCcw} tone="escalate">
                        Card reopened: decide it first
                      </StatusText>
                    )}
                    {f.awaitingClearance && (
                      <StatusText icon={PauseCircle} tone="confirm">
                        Waiting for clinician clearance
                      </StatusText>
                    )}
                    {tries && (
                      <StatusText icon={PhoneMissed} tone="confirm">
                        {tries}
                      </StatusText>
                    )}
                    <span className="text-cl-muted tabular-nums">
                      Opened <time dateTime={new Date(f.openedAt).toISOString()}>{formatWhen(f.openedAt)}</time>
                    </span>
                    {s.demoData && <DemoBadge />}
                  </div>
                  <span className="hidden items-center gap-1 text-base font-medium text-cl-accent md:inline-flex">
                    Open card
                    <ChevronRight aria-hidden className="size-4" />
                  </span>
                </Link>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
