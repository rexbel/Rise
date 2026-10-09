"use client"

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
    <div className="fixed right-3 bottom-3 z-50 flex max-w-xs flex-col gap-2 rounded-md border bg-background/95 p-2 text-xs shadow-md print:hidden">
      <p className="text-muted-foreground">Presenter · press H to hide · not in projector crop</p>
      <div className="flex flex-wrap gap-1">
        <Button
          type="button"
          size="xs"
          variant="outline"
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
          onClick={() => dispatch({ type: "PRESENTER_JUMP_TO_QUESTIONS" })}
        >
          Jump to questions
        </Button>
        <Button type="button" size="xs" variant="outline" onClick={() => dispatch({ type: "TRACKING_LOST" })}>
          Step back
        </Button>
        <Button type="button" size="xs" variant="outline" onClick={onRestart}>
          Restart
        </Button>
      </div>
      <p className="text-muted-foreground">Voice Stop off in demo</p>
    </div>
  )
}
