"use client"

/**
 * The patient's crew: who showed up this week, a shared goal, and fixed-phrase cheers. Engagement, not
 * performance: rows keep the API order (days active, then name) with no rank numbers, places, podium colors,
 * streaks, or missed days. Loads client-side and never blocks play; a failure shows one line and Try again.
 */

import Image from "next/image"
import { useCallback, useEffect, useId, useRef, useState } from "react"
import { CalendarCheck, Check, HandHeart, Heart, RotateCcw, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { playDisplay, ptButton, ptFocus, ptSecondary } from "@/components/play/playTheme"
import ui from "@/content/play-ui.json"
import {
  activeDaysLabel,
  CHEER_IDS,
  cheerForYouLine,
  cheerPhrase,
  cheersCountLabel,
  fetchCrewBoard,
  goalView,
  postCheer,
  relativeTime,
  replaceMember,
  withName,
} from "@/lib/play/crewView"
import type { CheerId, CrewBoard as CrewBoardData, CrewMember } from "@/lib/types"
import { cn } from "@/lib/utils"

const C = ui.crew

export type CrewState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; board: CrewBoardData; loadedAt: number }

/** Loads the crew board for one patient. Shared by the crew section and the player-home chips. */
export function useCrewBoard(riseId: string) {
  const [state, setState] = useState<CrewState>({ status: "loading" })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const ctrl = new AbortController()
    fetchCrewBoard(riseId, { signal: ctrl.signal })
      .then((board) => setState({ status: "ready", board, loadedAt: Date.now() }))
      .catch(() => {
        if (!ctrl.signal.aborted) setState({ status: "error" })
      })
    return () => ctrl.abort()
  }, [riseId, attempt])

  const retry = useCallback(() => {
    setState({ status: "loading" })
    setAttempt((n) => n + 1)
  }, [])

  const updateBoard = useCallback((fn: (b: CrewBoardData) => CrewBoardData) => {
    setState((s) => (s.status === "ready" ? { ...s, board: fn(s.board) } : s))
  }, [])

  return { state, retry, updateBoard }
}

export function CrewBoard({ riseId, className }: { riseId: string; className?: string }) {
  const { state, retry, updateBoard } = useCrewBoard(riseId)
  const [announcement, setAnnouncement] = useState("")

  return (
    <section
      id="crew"
      aria-labelledby="crew-heading"
      aria-busy={state.status === "loading"}
      className={cn("flex scroll-mt-6 flex-col gap-6 rounded-2xl border border-pt-line bg-pt-surface p-5 sm:p-6", className)}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-xl">
          <h2 id="crew-heading" className={`${playDisplay.className} text-3xl font-bold leading-tight sm:text-4xl`}>
            {C.heading}
          </h2>
          <p className="mt-2 text-xl leading-snug text-pt-muted">{C.intro}</p>
        </div>
        {state.status === "ready" && state.board.demoData ? (
          <span className="rounded-full border border-pt-accent/50 px-3 py-1 text-xl font-semibold text-pt-ink">{C.demo}</span>
        ) : null}
      </header>

      {/* Polite confirmation for cheers; the visible row also changes to "Cheered today". */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {state.status === "loading" ? <CrewSkeleton /> : null}
      {state.status === "error" ? <CrewError onRetry={retry} /> : null}
      {state.status === "ready" ? (
        <CrewReady board={state.board} loadedAt={state.loadedAt} onMember={(m) => updateBoard((b) => replaceMember(b, m))} announce={setAnnouncement} />
      ) : null}
    </section>
  )
}

function CrewSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xl text-pt-muted">{C.loading}</p>
      <div aria-hidden className="flex flex-col gap-3 motion-safe:animate-pulse">
        <div className="h-4 w-full rounded-full bg-pt-surface-2" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-4 rounded-xl border border-pt-line bg-pt-bg/60 p-4">
            <div className="size-14 shrink-0 rounded-full bg-pt-surface-2" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="h-6 w-2/5 rounded bg-pt-surface-2" />
              <div className="h-5 w-3/5 rounded bg-pt-surface-2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CrewError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-pt-line bg-pt-bg/60 p-4 sm:flex-row sm:items-center sm:justify-between">
      <p role="status" className="text-xl leading-snug text-pt-ink">
        {C.error}
      </p>
      <Button type="button" className={cn(ptSecondary, "sm:w-auto sm:shrink-0")} onClick={onRetry}>
        <RotateCcw className="size-5" aria-hidden />
        {C.retry}
      </Button>
    </div>
  )
}

function CrewReady({
  board,
  loadedAt,
  onMember,
  announce,
}: {
  board: CrewBoardData
  loadedAt: number
  onMember: (m: CrewMember) => void
  announce: (text: string) => void
}) {
  const goal = goalView(board.goal)
  const others = board.members.filter((m) => !m.isYou)

  return (
    <>
      <div className="flex flex-col gap-3">
        <p className="text-xl text-pt-muted">{C.goal_label}</p>
        <p className={`${playDisplay.className} text-2xl font-bold leading-snug text-pt-ink`}>{goal.label}</p>
        <div
          role="progressbar"
          aria-label={C.goal_label}
          aria-valuemin={0}
          aria-valuemax={goal.max}
          aria-valuenow={goal.value}
          aria-valuetext={goal.label}
          className="h-4 w-full overflow-hidden rounded-full border border-pt-line bg-pt-bg"
        >
          <div className="h-full rounded-full bg-pt-accent motion-safe:transition-[width] motion-safe:duration-500" style={{ width: `${goal.percent}%` }} />
        </div>
        {goal.reached ? (
          <p className="flex items-center gap-2 text-xl text-pt-ink">
            <Sparkles className="size-6 shrink-0 text-pt-accent" aria-hidden />
            {C.goal_reached}
          </p>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="flex flex-col gap-3">
          <ul aria-label={C.heading} className="flex flex-col gap-3">
            {board.members.map((m) => (
              <MemberRow key={m.id} member={m} viewer={board.riseId} onMember={onMember} announce={announce} />
            ))}
          </ul>
          {others.length === 0 ? <p className="text-xl leading-snug text-pt-muted">{C.empty}</p> : null}
        </div>

        <section aria-labelledby="cheers-for-you-heading" className="flex flex-col gap-3">
          <h3 id="cheers-for-you-heading" className={`${playDisplay.className} text-2xl font-bold`}>
            {C.for_you_heading}
          </h3>
          {board.cheersForYou.length === 0 ? (
            <p className="text-xl leading-snug text-pt-muted">{C.for_you_empty}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {board.cheersForYou.map((c, i) => (
                <li key={`${c.fromName}-${c.at}-${i}`} className="flex items-start gap-3 rounded-xl border border-pt-line bg-pt-bg/60 px-4 py-3">
                  <Heart className="mt-1 size-6 shrink-0 text-pt-accent" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-xl font-semibold leading-snug text-pt-ink">{cheerForYouLine(c.fromName, c.cheerId)}</p>
                    <p className="text-xl text-pt-muted">{relativeTime(c.at, loadedAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}

function Avatar({ member }: { member: CrewMember }) {
  return (
    <div
      className={cn(
        "relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pt-surface-2 sm:size-16",
        member.isYou ? "ring-2 ring-pt-accent" : "ring-1 ring-pt-line",
      )}
    >
      {member.avatarSrc ? (
        <Image src={member.avatarSrc} alt="" fill className="object-cover" sizes="64px" />
      ) : (
        <span aria-hidden className={`${playDisplay.className} text-xl font-bold text-pt-ink`}>
          {member.initials}
        </span>
      )}
    </div>
  )
}

type CheerUi = "idle" | "open" | "sending"

function MemberRow({
  member,
  viewer,
  onMember,
  announce,
}: {
  member: CrewMember
  viewer: string
  onMember: (m: CrewMember) => void
  announce: (text: string) => void
}) {
  const [mode, setMode] = useState<CheerUi>("idle")
  const [picked, setPicked] = useState<CheerId | null>(null)
  const [problem, setProblem] = useState<"limit" | "failed" | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const firstPhraseRef = useRef<HTMLButtonElement>(null)
  const doneRef = useRef<HTMLParagraphElement>(null)
  const focusDone = useRef(false)
  const pickerId = useId()
  const pickerTitleId = useId()
  const cheers = cheersCountLabel(member.cheersReceived)

  useEffect(() => {
    if (mode === "open") firstPhraseRef.current?.focus()
  }, [mode])

  // After a cheer lands the button is replaced, so move focus to the confirmation instead of losing it.
  useEffect(() => {
    if (member.cheeredByYouToday && focusDone.current) {
      focusDone.current = false
      doneRef.current?.focus()
    }
  }, [member.cheeredByYouToday])

  const close = () => {
    setMode("idle")
    triggerRef.current?.focus()
  }

  const send = async (cheerId: CheerId) => {
    setPicked(cheerId)
    setMode("sending")
    setProblem(null)
    const out = await postCheer({ from: viewer, to: member.id, cheerId })
    if (out.kind === "ok") {
      focusDone.current = true
      setMode("idle")
      onMember(out.member)
      announce(out.recorded ? withName(C.cheer_sent, member.name) : C.cheered)
      return
    }
    if (out.kind === "limit") {
      setProblem("limit")
      setMode("idle")
      announce(C.cheer_limit)
      return
    }
    setProblem("failed")
    setMode("open")
    announce(C.cheer_failed)
  }

  return (
    <li
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-pt-bg/60 p-4",
        member.isYou ? "border-pt-accent/60" : "border-pt-line",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <Avatar member={member} />
          <div className="min-w-0">
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className={`${playDisplay.className} text-2xl font-bold leading-tight text-pt-ink`}>{member.name}</span>
              {member.isYou ? (
                <span className="rounded-full bg-pt-surface-2 px-2.5 py-0.5 text-xl font-semibold text-pt-ink">{C.you}</span>
              ) : null}
            </p>
            <p className="mt-1 text-xl text-pt-ink">{activeDaysLabel(member.activeDays)}</p>
            {member.activeToday || cheers ? (
              <p className="mt-2 flex flex-wrap gap-2">
                {member.activeToday ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-pt-line px-3 py-0.5 text-xl font-semibold text-pt-ink">
                    <CalendarCheck className="size-5 text-pt-hit" aria-hidden />
                    {C.today}
                  </span>
                ) : null}
                {cheers ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-pt-line px-3 py-0.5 text-xl font-semibold text-pt-ink">
                    <Heart className="size-5 text-pt-accent" aria-hidden />
                    {cheers}
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
        </div>

        {member.isYou ? null : member.cheeredByYouToday ? (
          <p
            ref={doneRef}
            tabIndex={-1}
            className={cn(ptFocus, "inline-flex min-h-14 items-center gap-2 self-start rounded-xl px-1 text-xl font-semibold text-pt-ink sm:self-center")}
          >
            <Check className="size-6 text-pt-hit" aria-hidden />
            {C.cheered}
          </p>
        ) : (
          <Button
            ref={triggerRef}
            type="button"
            aria-expanded={mode !== "idle"}
            aria-controls={pickerId}
            aria-label={withName(C.cheer_button_label, member.name)}
            disabled={mode === "sending"}
            onClick={() => (mode === "idle" ? setMode("open") : close())}
            className={cn(ptSecondary, "sm:w-auto sm:min-w-36 sm:shrink-0")}
          >
            <HandHeart className="size-6" aria-hidden />
            {C.cheer_button}
          </Button>
        )}
      </div>

      {mode !== "idle" && !member.cheeredByYouToday ? (
        <div
          id={pickerId}
          role="group"
          aria-labelledby={pickerTitleId}
          onKeyDown={(e) => {
            if (e.key === "Escape" && mode === "open") {
              e.stopPropagation()
              close()
            }
          }}
          className="flex flex-col gap-3 rounded-xl border border-pt-line bg-pt-surface-2 p-4"
        >
          <p id={pickerTitleId} className="text-xl font-semibold text-pt-ink">
            {mode === "sending" ? C.cheer_sending : withName(C.cheer_pick, member.name)}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {CHEER_IDS.map((id, i) => (
              <Button
                key={id}
                ref={i === 0 ? firstPhraseRef : undefined}
                type="button"
                disabled={mode === "sending"}
                aria-pressed={mode === "sending" ? picked === id : undefined}
                onClick={() => void send(id)}
                className={cn(
                  ptFocus,
                  ptButton,
                  "border bg-pt-bg text-pt-ink hover:bg-pt-surface",
                  mode === "sending" && picked === id ? "border-pt-accent disabled:opacity-100" : "border-pt-line disabled:opacity-60",
                )}
              >
                {cheerPhrase(id)}
              </Button>
            ))}
          </div>
          {mode === "open" ? (
            <Button type="button" onClick={close} className={cn(ptSecondary, "bg-transparent sm:w-auto sm:self-start")}>
              {C.cheer_cancel}
            </Button>
          ) : null}
        </div>
      ) : null}

      {problem ? (
        <p className="text-xl leading-snug text-pt-ink">
          {problem === "limit" ? C.cheer_limit : C.cheer_failed}
        </p>
      ) : null}
    </li>
  )
}
