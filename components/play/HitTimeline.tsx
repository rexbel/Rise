"use client"

import { Check, X } from "lucide-react"
import type { HitLogKind } from "@/components/play/PlayProvider"
import { hitSummary } from "@/lib/play/hitMiss"
import { cn } from "@/lib/utils"

/**
 * Hits vs misses in order. Never color alone: each cell carries a check or a cross glyph,
 * and screen readers get one summary line instead of the cells.
 */
export function HitTimeline({
  hitLog,
  label,
  emptyText,
  size = "md",
  className,
}: {
  hitLog: HitLogKind[]
  /** Visible heading, also the accessible name of the summary. */
  label?: string
  emptyText?: string
  size?: "sm" | "md"
  className?: string
}) {
  const cell = size === "sm" ? "h-7" : "h-10"
  return (
    <div className={className}>
      {label ? <p className="mb-2 text-xl text-pt-muted">{label}</p> : null}
      <p className="sr-only">{hitLog.length === 0 ? (emptyText ?? "No moves yet") : hitSummary(hitLog)}</p>
      <div aria-hidden className={cn("flex gap-0.5 overflow-hidden rounded-xl bg-pt-bg", cell)}>
        {hitLog.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-xl text-pt-muted">{emptyText ?? ""}</div>
        ) : (
          hitLog.map((kind, i) => (
            <div
              key={`${kind}-${i}`}
              className={cn(
                "flex min-w-2 flex-1 items-center justify-center overflow-hidden",
                kind === "hit" ? "bg-pt-hit/25 text-pt-hit" : "bg-pt-miss/25 text-pt-miss",
              )}
            >
              {kind === "hit" ? <Check className="size-4 shrink-0" strokeWidth={3} /> : <X className="size-4 shrink-0" strokeWidth={3} />}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
