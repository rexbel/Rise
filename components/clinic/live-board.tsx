"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronRight, RefreshCw, WifiOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { SessionSnapshot } from "@/lib/types"
import { cn } from "@/lib/utils"
import {
  APPROVAL_LABEL,
  boardOrder,
  finalRecommendation,
  formatAgo,
  RECOMMENDATION_LABEL,
  ROUTE_LABEL,
  sessionTone,
  statusText,
  SURFACE_LABEL,
  TIER_LABEL,
} from "./format"
import { DemoBadge, NeedsReview, RecommendationText, RedFlag, STATUS_ICON, StatusText, TONE_RULE, focusRing } from "./status"
import { useClinic, useNow } from "./store"

/** C2: one tile per session, live from the SSE stream. */
export function LiveBoard() {
  const { sessions, loaded } = useClinic()
  const ordered = useMemo(() => boardOrder([...sessions.values()]), [sessions])

  return (
    <section aria-labelledby="board-heading" className="min-w-0">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-cl-ink pb-2">
        <h2 id="board-heading" className="font-[family-name:var(--font-cl-serif)] text-2xl font-semibold">
          Live board
        </h2>
        <p className="text-base text-cl-muted">Nothing escalates until a person decides the card.</p>
      </div>
      <ConnectionBanner />
      <Announcer sessions={ordered} />
      {!loaded ? (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Loading sessions">
          {[0, 1, 2].map((i) => (
            <li key={i} className="grid gap-3 rounded-md border border-cl-line bg-cl-surface p-4">
              <Skeleton className="h-6 w-40 bg-cl-line" />
              <Skeleton className="h-5 w-28 bg-cl-line" />
              <Skeleton className="h-5 w-52 bg-cl-line" />
            </li>
          ))}
        </ul>
      ) : ordered.length === 0 ? (
        <p className="rounded-md border border-dashed border-cl-line px-4 py-6 text-lg text-cl-muted">
          No check-ins yet. Send one from the patient list.
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ordered.map((s) => (
            <li key={s.sessionId} className="min-w-0">
              <Tile s={s} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ConnectionBanner() {
  const { connection, retryNow, loaded } = useClinic()
  const now = useNow(1000)
  if (connection.state === "open") return null
  if (connection.state === "connecting") {
    return loaded ? (
      <p className="mb-3 text-base text-cl-muted" role="status">
        Reconnecting to live updates…
      </p>
    ) : null
  }
  const secs = now ? Math.max(0, Math.ceil((connection.retryAt - now) / 1000)) : 0
  return (
    <div
      role="alert"
      className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-status-confirm/60 bg-status-confirm/12 px-4 py-3"
    >
      <WifiOff aria-hidden className="size-5 shrink-0 text-status-confirm" />
      <p className="min-w-0 flex-1 text-base">
        <span className="font-semibold">Live updates paused, reconnecting</span>
        <span className="text-cl-muted">
          {" "}
          {secs > 0 ? `in ${secs} s.` : "now."} The board may be out of date; tiles resync when the connection returns.
        </span>
      </p>
      <Button type="button" variant="outline" onClick={retryNow} className={cn("h-11 bg-cl-surface text-base", focusRing)}>
        <RefreshCw aria-hidden />
        Retry
      </Button>
    </div>
  )
}

function Tile({ s }: { s: SessionSnapshot }) {
  const { patient } = useClinic()
  const now = useNow(15_000)
  const p = patient(s.riseId)
  const card = s.card
  const final = finalRecommendation(s)
  const tone = sessionTone(s)
  const redFlag = card?.ruleFired === "red_flag" || card?.emergency
  const downgraded = card && final && final !== card.recommendation

  return (
    <Link
      href={`/clinic/s/${s.sessionId}`}
      className={cn(
        "group grid h-full gap-2 rounded-md border border-l-[6px] border-cl-line bg-cl-surface p-4 transition-colors hover:border-cl-ink/40",
        TONE_RULE[tone],
        focusRing,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold group-hover:underline">{p?.name ?? s.riseId}</p>
          <p className="text-base text-cl-muted">{s.surface ? SURFACE_LABEL[s.surface] : "Opened without an invite"}</p>
        </div>
        <ChevronRight aria-hidden className="mt-1 size-5 shrink-0 text-cl-muted" />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <StatusText icon={STATUS_ICON[s.status]} tone={tone === "neutral" ? "neutral" : tone} className="text-base">
          {statusText(s)}
        </StatusText>
        {s.status === "testing" && s.armsUsed && <span className="text-base text-cl-muted">· arms used</span>}
      </div>

      {card && final && (
        <div className="grid gap-1">
          {redFlag && (
            <div>
              <RedFlag />
            </div>
          )}
          <RecommendationText rec={final} className="text-lg font-semibold">
            {RECOMMENDATION_LABEL[final]}
            {!downgraded && card.route && (
              <>
                {" "}
                <span aria-hidden>→</span>
                <span className="sr-only">to</span> {ROUTE_LABEL[card.route]}
              </>
            )}
          </RecommendationText>
          {downgraded && (
            <p className="text-base text-cl-muted">Rules said {RECOMMENDATION_LABEL[card.recommendation]}</p>
          )}
          {card.noteNeedsReview && (
            <div>
              <NeedsReview />
            </div>
          )}
          <p className="text-base">
            <span className={card.approval === "pending" ? "font-semibold" : "text-cl-muted"}>{APPROVAL_LABEL[card.approval]}</span>
          </p>
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-sm text-cl-muted">
        {s.tier && <span>{TIER_LABEL[s.tier]}</span>}
        <span>Updated {formatAgo(s.updatedAt, now)}</span>
        {s.demoData && <DemoBadge />}
      </div>
    </Link>
  )
}

/** Screen-reader announcements for status changes (not every rep, which would be noise). */
function Announcer({ sessions }: { sessions: SessionSnapshot[] }) {
  const { patient } = useClinic()
  const prev = useRef<Map<string, string>>(new Map())
  const [message, setMessage] = useState("")
  useEffect(() => {
    const changes: string[] = []
    const next = new Map<string, string>()
    for (const s of sessions) {
      const key = `${s.status}|${s.card?.approval ?? ""}`
      next.set(s.sessionId, key)
      const before = prev.current.get(s.sessionId)
      if (before !== undefined && before !== key) {
        changes.push(`${patient(s.riseId)?.name ?? s.riseId}: ${statusText({ ...s, status: s.status })}`)
      }
    }
    prev.current = next
    // Announcing is a side effect of new stream data, not derived render state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (changes.length) setMessage(changes.join(". "))
  }, [sessions, patient])
  return (
    <p className="sr-only" aria-live="polite">
      {message}
    </p>
  )
}
