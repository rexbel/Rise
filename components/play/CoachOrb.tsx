"use client"

import { cn } from "@/lib/utils"
import { usePlay } from "@/components/play/PlayProvider"

export function CoachOrb() {
  const { speaking, caption } = usePlay()
  const active = speaking || Boolean(caption)
  return (
    <div
      className={cn(
        "size-6 rounded-full border border-foreground/40 bg-foreground/80",
        active && "animate-pulse",
      )}
      aria-hidden
    />
  )
}
