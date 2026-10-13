"use client"

/**
 * Pitch-only operator tools, demo sessions only. Never covers patient controls:
 * - lg and up: bottom-right, over the clinic strip column (never over Stop / Pause / Begin / Next on the left).
 * - below lg: hidden (the phone is the patient's whole screen). Press H to show it at the top; H again hides.
 * Shortcuts ignore keys typed into text fields (the note box).
 */

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { usePlay } from "@/components/play/PlayProvider"
import { isLiveShell } from "@/lib/play/phaseView"
import { unlockPlayback } from "@/lib/play/speak"
import type { PlayAction } from "@/lib/play/types"
import { cn } from "@/lib/utils"

function typingInField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.tagName === "SELECT"
}

const tool =
  "h-8 rounded-md border border-pt-line bg-pt-surface px-2 text-sm text-pt-ink hover:bg-pt-surface-2 outline-none focus-visible:ring-2 focus-visible:ring-pt-focus"

export function PresenterBar({ onRestart }: { onRestart: () => void }) {
  const { session, dispatch, dispatchMany } = usePlay()
  /** Flips the default: shown on lg+, hidden below lg. */
  const [toggled, setToggled] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (typingInField(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === "h" || e.key === "H") {
        setToggled((v) => !v)
        return
      }
      if (e.key === "Escape" || e.key === "s" || e.key === "S") {
        if (!isLiveShell(session.phase)) return
        e.preventDefault()
        dispatch({ type: e.key === "Escape" ? "PAUSE" : "STOP" })
      }
      if ((e.key === "v" || e.key === "V") && isLiveShell(session.phase)) {
        dispatch({ type: "FINDING", finding: { id: "valgus", severity: "hard", atMs: 1000 } })
      }
      if ((e.key === "a" || e.key === "A") && isLiveShell(session.phase)) {
        dispatch({ type: "FINDING", finding: { id: "arms", severity: "soft", atMs: 4000 } })
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [dispatch, session.phase])

  if (!session.demo) return null

  return (
    <div
      className={cn(
        "fixed z-[60] max-w-[16rem] flex-col gap-1.5 rounded-md border border-pt-line bg-pt-bg/95 p-2 text-sm text-pt-muted shadow-lg print:hidden",
        toggled ? "left-3 top-3 flex lg:hidden" : "bottom-3 right-3 hidden lg:flex",
      )}
      data-presenter="pitch-only"
      role="region"
      aria-label="Presenter controls, pitch only. Press H to show or hide."
    >
      <p className="leading-snug">Presenter (pitch only) · H hide</p>
      <div className="flex flex-wrap gap-1">
        <Button
          type="button"
          className={tool}
          onClick={() => {
            unlockPlayback()
            dispatch({ type: "PRESENTER_SKIP_TO_LIVE" })
          }}
        >
          Skip to live
        </Button>
        <Button
          type="button"
          className={tool}
          onClick={() => {
            const actions: PlayAction[] = []
            if (!isLiveShell(session.phase) && session.phase !== "paused") {
              unlockPlayback()
              actions.push({ type: "PRESENTER_SKIP_TO_LIVE" })
            }
            if (session.riseId === "rise-01") {
              actions.push({ type: "FINDING", finding: { id: "arms", severity: "soft", atMs: 4000 } })
            }
            actions.push({ type: "SET_COMPLETE", durationMs: 12_000 })
            dispatchMany(actions)
          }}
        >
          End set
        </Button>
        <Button type="button" className={tool} onClick={() => dispatch({ type: "PRESENTER_JUMP_TO_QUESTIONS" })}>
          Jump to questions
        </Button>
        <Button type="button" className={tool} onClick={() => dispatch({ type: "TRACKING_LOST" })}>
          Step back
        </Button>
        <Button type="button" className={tool} onClick={onRestart}>
          Restart
        </Button>
      </div>
    </div>
  )
}
