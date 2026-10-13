"use client"

/**
 * The patient's crew: opt-in, under a neutral crew name. Not joined: a join card that says what is and is never
 * shared, with the crew listed read-only below. Joined: who showed up this week, a shared goal, fixed-phrase
 * cheers, and Show-my-photo / Leave. Paused (care team checking in): one calm note and nothing else.
 *
 * Engagement, not performance: rows keep the API order (days active, then name) with no rank numbers, places,
 * podium colors, streaks, or missed days. Loads client-side and never blocks play; a failure shows one line and
 * Try again. Which panels render for each status comes from crewPanels() in lib/play/crewView.
 */

import Image from "next/image"
import { useCallback, useEffect, useId, useRef, useState } from "react"
import { CalendarCheck, Check, EyeOff, HandHeart, Heart, Info, Leaf, RotateCcw, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { playDisplay, ptButton, ptCta, ptFocus, ptSecondary } from "@/components/play/playTheme"
import ui from "@/content/play-ui.json"
import {
  activeDaysLabel,
  asNotJoined,
  CHEER_IDS,
  cheerForYouLine,
  cheerPhrase,
  cheersCountLabel,
  crewPanels,
  fetchCrewBoard,
  goalView,
  joinCrewCall,
  leaveCrewCall,
  postCheer,
  relativeTime,
  replaceMember,
  setCrewPhotoCall,
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

  const setBoard = useCallback((board: CrewBoardData) => {
    setState({ status: "ready", board, loadedAt: Date.now() })
  }, [])

  /** Refetch without the loading skeleton. On failure the current board stays. */
  const refresh = useCallback(async () => {
    try {
      setBoard(await fetchCrewBoard(riseId))
    } catch {
      // Keep what is on screen; the next load or Try again recovers.
    }
  }, [riseId, setBoard])

  return { state, retry, updateBoard, setBoard, refresh }
}

export function CrewBoard({ riseId, className }: { riseId: string; className?: string }) {
  const { state, retry, updateBoard, setBoard, refresh } = useCrewBoard(riseId)
  const [announcement, setAnnouncement] = useState("")
  const [notice, setNotice] = useState<string | null>(null)
  const [focusHeading, setFocusHeading] = useState(0)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const board = state.status === "ready" ? state.board : null
  const panels = board ? crewPanels(board.status) : null

  useEffect(() => {
    if (focusHeading > 0) headingRef.current?.focus()
  }, [focusHeading])

  return (
    <section
      id="crew"
      aria-labelledby="crew-heading"
      aria-busy={state.status === "loading"}
      className={cn("flex min-w-0 scroll-mt-6 flex-col gap-6 rounded-2xl border border-pt-line bg-pt-surface p-5 sm:p-6", className)}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-xl">
          <h2
            id="crew-heading"
            ref={headingRef}
            tabIndex={-1}
            className={cn(ptFocus, `${playDisplay.className} rounded-md text-3xl font-bold leading-tight sm:text-4xl`)}
          >
            {board ? board.crewName : C.heading}
          </h2>
          {panels?.intro ? <p className="mt-2 text-xl leading-snug text-pt-muted">{C.intro}</p> : null}
        </div>
        {board?.demoData ? (
          <span className="rounded-full border border-pt-accent/50 px-3 py-1 text-xl font-semibold text-pt-ink">{C.demo}</span>
        ) : null}
      </header>

      {/* Polite confirmation for join, leave, photo, and cheers; the visible UI changes too. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {state.status === "loading" ? <CrewSkeleton /> : null}
      {state.status === "error" ? <CrewError onRetry={retry} /> : null}
      {state.status === "ready" ? (
        <CrewReady
          key={state.board.status}
          board={state.board}
          loadedAt={state.loadedAt}
          setBoard={setBoard}
          refresh={refresh}
          onMember={(m) => updateBoard((b) => replaceMember(b, m))}
          announce={setAnnouncement}
          notice={notice}
          setNotice={setNotice}
          onJoinedFocus={() => setFocusHeading((n) => n + 1)}
        />
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

/**
 * One crew view per membership state (keyed by status in the parent, so moving between states remounts and
 * focus lands on the new state's heading when the patient caused the change).
 */
function CrewReady({
  board,
  loadedAt,
  setBoard,
  refresh,
  onMember,
  announce,
  notice,
  setNotice,
  onJoinedFocus,
}: {
  board: CrewBoardData
  loadedAt: number
  setBoard: (b: CrewBoardData) => void
  refresh: () => Promise<void>
  onMember: (m: CrewMember) => void
  announce: (text: string) => void
  /** Line on the join card after leaving, a changed card, a failed join, or a missing token on this phone. */
  notice: string | null
  setNotice: (line: string | null) => void
  onJoinedFocus: () => void
}) {
  const panels = crewPanels(board.status)

  /** This phone has no token (or the patient just left): show the join card again and re-sync quietly. */
  const toJoinCard = useCallback(
    (line: string) => {
      setNotice(line)
      announce(line)
      setBoard(asNotJoined(board))
      void refresh()
    },
    [announce, board, refresh, setBoard, setNotice],
  )

  if (panels.pauseNote) return <PauseNote />

  return (
    <>
      {panels.joinCard ? (
        <JoinCard
          riseId={board.riseId}
          notice={notice}
          onJoined={(next) => {
            setNotice(null)
            setBoard(next)
            announce(C.join_done)
            // The join card (and its focused button) unmounts: move focus to the crew name.
            onJoinedFocus()
          }}
          onChanged={async () => {
            await refresh()
            setNotice(C.join_changed)
            announce(C.join_changed)
          }}
          onPaused={() => void refresh()}
          onFailed={() => {
            setNotice(C.join_failed)
            announce(C.join_failed)
          }}
        />
      ) : null}

      {panels.goal ? <CrewGoal board={board} /> : null}

      {panels.members === "readonly" ? (
        <section aria-labelledby="crew-preview-heading" className="flex flex-col gap-3">
          <h3 id="crew-preview-heading" className={`${playDisplay.className} text-2xl font-bold`}>
            {C.join_members_label}
          </h3>
          <MemberList board={board} canCheer={false} onMember={onMember} announce={announce} />
        </section>
      ) : null}

      {panels.members === "cheer" ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <MemberList
            board={board}
            canCheer
            onMember={onMember}
            announce={announce}
            onSignedOut={() => toJoinCard(C.join_again)}
            onRefresh={() => void refresh()}
          />
          {panels.cheersForYou ? <CheersForYou board={board} loadedAt={loadedAt} /> : null}
        </div>
      ) : null}

      {panels.settings ? (
        <CrewSettings
          board={board}
          setBoard={setBoard}
          refresh={refresh}
          announce={announce}
          onLeft={() => toJoinCard(C.leave_done)}
          onSignedOut={() => toJoinCard(C.join_again)}
        />
      ) : null}
    </>
  )
}

function PauseNote() {
  return (
    <div className="flex items-start gap-4 rounded-xl border border-pt-line bg-pt-bg/60 p-5">
      <Leaf className="mt-1 size-7 shrink-0 text-pt-hit" aria-hidden />
      <div className="min-w-0">
        <h3 className={`${playDisplay.className} text-2xl font-bold leading-snug text-pt-ink`}>{C.paused_heading}</h3>
        <p className="mt-2 text-xl leading-snug text-pt-ink">{C.paused_body}</p>
      </div>
    </div>
  )
}

/* ---------- Join card ---------- */

function JoinCard({
  riseId,
  notice,
  onJoined,
  onChanged,
  onPaused,
  onFailed,
}: {
  riseId: string
  notice: string | null
  onJoined: (b: CrewBoardData) => void
  onChanged: () => Promise<void>
  onPaused: () => void
  onFailed: () => void
}) {
  const [showPhoto, setShowPhoto] = useState(false)
  const [sending, setSending] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)

  // Arriving here after Leave or a missing token: put focus on the card so the next step is clear.
  useEffect(() => {
    if (notice) headingRef.current?.focus()
    // Only on mount: later notices are announced by the live region.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const join = async () => {
    setSending(true)
    const out = await joinCrewCall({ riseId, showPhoto })
    if (out.kind === "ok") return onJoined(out.board)
    setSending(false)
    if (out.kind === "changed") await onChanged()
    else if (out.kind === "refresh") onPaused()
    else onFailed()
  }

  return (
    <section
      aria-labelledby="crew-join-heading"
      aria-busy={sending}
      className="flex flex-col gap-5 rounded-xl border-2 border-pt-accent/60 bg-pt-bg/60 p-4 sm:p-5"
    >
      <div>
        <h3
          id="crew-join-heading"
          ref={headingRef}
          tabIndex={-1}
          className={cn(ptFocus, `${playDisplay.className} rounded-md text-2xl font-bold leading-snug text-pt-ink sm:text-3xl`)}
        >
          {C.join_heading}
        </h3>
        <p className="mt-2 text-xl leading-snug text-pt-ink">{C.join_body}</p>
      </div>

      {notice ? (
        <p className="flex items-start gap-3 rounded-xl border border-pt-line bg-pt-surface-2 px-4 py-3 text-xl leading-snug text-pt-ink">
          <Info className="mt-0.5 size-6 shrink-0 text-pt-accent" aria-hidden />
          {notice}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <ShareList label={C.join_shared_label} items={C.join_shared} icon="shared" />
        <ShareList label={C.join_private_label} items={C.join_private} icon="private" />
      </div>

      <PhotoSwitch checked={showPhoto} disabled={sending} onChange={setShowPhoto} />

      <div className="flex flex-col gap-3">
        <Button type="button" disabled={sending} onClick={() => void join()} className={cn(ptCta, playDisplay.className, "text-2xl disabled:opacity-70")}>
          {sending ? C.join_sending : C.join_button}
        </Button>
        <p className="text-xl leading-snug text-pt-muted">{C.join_note}</p>
      </div>
    </section>
  )
}

function ShareList({ label, items, icon }: { label: string; items: string[]; icon: "shared" | "private" }) {
  const id = useId()
  const Icon = icon === "shared" ? Check : EyeOff
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-pt-line bg-pt-surface p-4">
      <p id={id} className="text-xl font-bold text-pt-ink">
        {label}
      </p>
      <ul aria-labelledby={id} className="flex flex-col gap-2">
        {items.map((text) => (
          <li key={text} className="flex items-start gap-2 text-xl leading-snug text-pt-ink">
            <Icon className={cn("mt-1 size-5 shrink-0", icon === "shared" ? "text-pt-hit" : "text-pt-muted")} aria-hidden />
            {text}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Labeled switch on a full-width 56px+ row. State is spoken (role="switch", aria-checked) and written ("On" /
 * "Off" plus a hint), never shown by the track color alone.
 */
function PhotoSwitch({
  checked,
  disabled,
  busyLabel,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  busyLabel?: string | null
  onChange: (next: boolean) => void
}) {
  const hintId = useId()
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={hintId}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          ptFocus,
          "flex min-h-14 w-full items-center justify-between gap-4 rounded-xl border border-pt-line bg-pt-surface px-4 py-2 text-left hover:bg-pt-surface-2 disabled:cursor-not-allowed disabled:opacity-70",
        )}
      >
        <span className="text-xl font-bold text-pt-ink">{C.photo_label}</span>
        <span className="flex shrink-0 items-center gap-3">
          <span aria-hidden className="w-9 text-right text-xl font-semibold text-pt-ink">
            {checked ? C.photo_on : C.photo_off}
          </span>
          <span
            aria-hidden
            className={cn(
              "relative inline-flex h-8 w-14 items-center rounded-full border-2 transition-colors motion-reduce:transition-none",
              checked ? "border-pt-cta bg-pt-cta" : "border-pt-muted bg-pt-bg",
            )}
          >
            <span
              className={cn(
                "absolute size-6 rounded-full bg-pt-ink transition-transform motion-reduce:transition-none",
                checked ? "translate-x-6" : "translate-x-0.5",
              )}
            />
          </span>
        </span>
      </button>
      <p id={hintId} className="px-1 text-xl leading-snug text-pt-muted">
        {busyLabel ?? (checked ? C.photo_hint_on : C.photo_hint_off)}
      </p>
    </div>
  )
}

/* ---------- Joined: goal, members, cheers for you, settings ---------- */

function CrewGoal({ board }: { board: CrewBoardData }) {
  const goal = goalView(board.goal)
  return (
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
  )
}

function MemberList({
  board,
  canCheer,
  onMember,
  announce,
  onSignedOut,
  onRefresh,
}: {
  board: CrewBoardData
  canCheer: boolean
  onMember: (m: CrewMember) => void
  announce: (text: string) => void
  onSignedOut?: () => void
  onRefresh?: () => void
}) {
  const others = board.members.filter((m) => !m.isYou)
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {board.members.length > 0 ? (
        <ul aria-label={canCheer ? board.crewName : C.join_members_label} className="flex flex-col gap-3">
          {board.members.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              viewer={board.riseId}
              canCheer={canCheer}
              onMember={onMember}
              announce={announce}
              onSignedOut={onSignedOut}
              onRefresh={onRefresh}
            />
          ))}
        </ul>
      ) : null}
      {others.length === 0 ? <p className="text-xl leading-snug text-pt-muted">{C.empty}</p> : null}
    </div>
  )
}

function CheersForYou({ board, loadedAt }: { board: CrewBoardData; loadedAt: number }) {
  return (
    <section aria-labelledby="cheers-for-you-heading" className="flex min-w-0 flex-col gap-3">
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
  )
}

function CrewSettings({
  board,
  setBoard,
  refresh,
  announce,
  onLeft,
  onSignedOut,
}: {
  board: CrewBoardData
  setBoard: (b: CrewBoardData) => void
  refresh: () => Promise<void>
  announce: (text: string) => void
  onLeft: () => void
  onSignedOut: () => void
}) {
  const [photoSaving, setPhotoSaving] = useState(false)
  const [photoProblem, setPhotoProblem] = useState(false)
  const [leave, setLeave] = useState<"idle" | "confirm" | "sending">("idle")
  const [leaveProblem, setLeaveProblem] = useState(false)
  const leaveRef = useRef<HTMLButtonElement>(null)
  const stayRef = useRef<HTMLButtonElement>(null)
  const confirmId = useId()

  useEffect(() => {
    // Stay is the safe default when the question opens.
    if (leave === "confirm") stayRef.current?.focus()
  }, [leave])

  const setPhoto = async (next: boolean) => {
    setPhotoSaving(true)
    setPhotoProblem(false)
    const out = await setCrewPhotoCall({ riseId: board.riseId, showPhoto: next })
    setPhotoSaving(false)
    if (out.kind === "ok") {
      setBoard(out.board)
      announce(out.board.showPhoto ? C.photo_saved_on : C.photo_saved_off)
    } else if (out.kind === "signed_out") onSignedOut()
    else if (out.kind === "refresh") void refresh()
    else {
      setPhotoProblem(true)
      announce(C.photo_failed)
    }
  }

  const stay = () => {
    setLeave("idle")
    requestAnimationFrame(() => leaveRef.current?.focus())
  }

  const doLeave = async () => {
    setLeave("sending")
    setLeaveProblem(false)
    const out = await leaveCrewCall(board.riseId)
    if (out.kind === "ok") return onLeft()
    if (out.kind === "signed_out") return onSignedOut()
    setLeave("confirm")
    setLeaveProblem(true)
    announce(C.leave_failed)
  }

  return (
    <section aria-labelledby="crew-settings-heading" className="flex flex-col gap-4 border-t border-pt-line pt-5">
      <h3 id="crew-settings-heading" className={`${playDisplay.className} text-2xl font-bold`}>
        {C.settings_heading}
      </h3>
      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        <div className="flex flex-col gap-2">
          <PhotoSwitch
            checked={board.showPhoto}
            disabled={photoSaving || leave === "sending"}
            busyLabel={photoSaving ? C.photo_saving : null}
            onChange={(next) => void setPhoto(next)}
          />
          {photoProblem ? <p className="px-1 text-xl leading-snug text-pt-ink">{C.photo_failed}</p> : null}
        </div>

        {leave === "idle" ? (
          <Button ref={leaveRef} type="button" onClick={() => setLeave("confirm")} className={cn(ptSecondary, "bg-transparent")}>
            {C.leave_button}
          </Button>
        ) : (
          <div
            role="group"
            aria-labelledby={confirmId}
            onKeyDown={(e) => {
              if (e.key === "Escape" && leave === "confirm") {
                e.stopPropagation()
                stay()
              }
            }}
            className="flex flex-col gap-3 rounded-xl border border-pt-line bg-pt-surface-2 p-4"
          >
            <p id={confirmId} className="text-xl font-semibold leading-snug text-pt-ink">
              {leave === "sending" ? C.leave_sending : C.leave_confirm}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Button type="button" disabled={leave === "sending"} onClick={() => void doLeave()} className={cn(ptSecondary, "bg-pt-bg disabled:opacity-70")}>
                {C.leave_yes}
              </Button>
              <Button ref={stayRef} type="button" disabled={leave === "sending"} onClick={stay} className={cn(ptCta, "disabled:opacity-70")}>
                {C.leave_no}
              </Button>
            </div>
            {leaveProblem ? <p className="text-xl leading-snug text-pt-ink">{C.leave_failed}</p> : null}
          </div>
        )}
      </div>
    </section>
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
  canCheer,
  onMember,
  announce,
  onSignedOut,
  onRefresh,
}: {
  member: CrewMember
  viewer: string
  canCheer: boolean
  onMember: (m: CrewMember) => void
  announce: (text: string) => void
  onSignedOut?: () => void
  onRefresh?: () => void
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
    if (out.kind === "signed_out") {
      // No crew token on this phone: the join card replaces the board (and takes focus).
      setMode("idle")
      onSignedOut?.()
      return
    }
    if (out.kind === "refresh") {
      setMode("idle")
      onRefresh?.()
      return
    }
    if (out.kind === "limit") {
      setProblem("limit")
      setMode("idle")
      announce(C.cheer_limit)
      // The picker unmounts with the focused phrase; return focus to Cheer instead of dropping it to the page.
      requestAnimationFrame(() => triggerRef.current?.focus())
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

        {member.isYou || !canCheer ? null : member.cheeredByYouToday ? (
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

      {canCheer && mode !== "idle" && !member.cheeredByYouToday ? (
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
