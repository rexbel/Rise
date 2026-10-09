"use client"

/**
 * Pitch-only operator tools. Never part of the patient crop —
 * fixed corner, press H to hide. Demo sessions only.
 */

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { usePlay } from "@/components/play/PlayProvider"
import { isLiveShell } from "@/lib/play/phaseView"
import { unlockPlayback } from "@/lib/play/speak"
import type { PlayAction } from "@/lib/play/types"

export function PresenterBar({ onRestart }: { onRestart: () => void }) {
  const { session, dispatch, dispatchMany } = usePlay()
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "h" || e.key === "H") {
        setHidden((v) => !v)
        return
      }
      if (hidden) return
      if (e.key === "Escape" || e.key === "s" || e.key === "S") {
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
  }, [dispatch, hidden, session.phase])

  if (!session.demo || hidden) return null

  return (
    <div
      className="fixed bottom-3 left-3 z-[60] flex max-w-[14rem] flex-col gap-1.5 rounded-md border border-zinc-700 bg-zinc-950/95 p-2 text-[10px] text-zinc-400 shadow-lg print:hidden"
      data-presenter="pitch-only"
      aria-label="Presenter controls — hide with H; keep outside projector crop"
    >
      <p className="leading-snug">Presenter (pitch only) · H hide · outside player crop</p>
      <div className="flex flex-wrap gap-1">
        <Button
          type="button"
          size="xs"
          variant="outline"
          className="h-7 border-zinc-700 text-[10px]"
          onClick={() => {
            unlockPlayback()
            dispatch({ type: "PRESENTER_SKIP_TO_LIVE" })
          }}
        >
          Skip to live
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          className="h-7 border-zinc-700 text-[10px]"
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
        <Button
          type="button"
          size="xs"
          variant="outline"
          className="h-7 border-zinc-700 text-[10px]"
          onClick={() => dispatch({ type: "PRESENTER_JUMP_TO_QUESTIONS" })}
        >
          Jump to questions
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          className="h-7 border-zinc-700 text-[10px]"
          onClick={() => dispatch({ type: "TRACKING_LOST" })}
        >
          Step back
        </Button>
        <Button type="button" size="xs" variant="outline" className="h-7 border-zinc-700 text-[10px]" onClick={onRestart}>
          Restart
        </Button>
      </div>
    </div>
  )
}
