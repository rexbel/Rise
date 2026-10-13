"use client"

import { useEffect, useRef } from "react"
import type { LiveVisual } from "@/lib/play/findings"
import type { Keypoints17 } from "@/lib/play/types"

export function RailsCanvas({
  keypoints,
  visual,
  pathSteps,
  frozen,
}: {
  keypoints: Keypoints17 | null
  visual: LiveVisual
  pathSteps: number
  frozen: boolean
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)

    ctx.fillStyle = "oklch(0.97 0 0)"
    ctx.fillRect(0, 0, w, h)

    const railL = w * 0.38
    const railR = w * 0.62
    const bend = visual.kneeInward * w * 4
    ctx.strokeStyle = visual.armsOut || visual.kneeInward > 0.03 ? "oklch(0.55 0.12 70)" : "oklch(0.25 0 0)"
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.moveTo(railL + bend, h * 0.15)
    ctx.lineTo(railL, h * 0.9)
    ctx.moveTo(railR - bend, h * 0.15)
    ctx.lineTo(railR, h * 0.9)
    ctx.stroke()

    ctx.strokeStyle = "oklch(0.4 0 0)"
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(w * 0.25, h * 0.9)
    ctx.lineTo(w * 0.75, h * 0.9)
    ctx.stroke()

    const dots = Math.min(pathSteps, 12)
    for (let i = 0; i < dots; i++) {
      ctx.fillStyle = "oklch(0.45 0.05 150 / 0.5)"
      ctx.beginPath()
      ctx.arc(w * 0.12, h * 0.85 - i * 14, 5, 0, Math.PI * 2)
      ctx.fill()
    }

    if (!keypoints) return
    const draw = (i: number, r = 5) => {
      const p = keypoints[i]
      ctx.beginPath()
      ctx.arc(p.x * w, p.y * h, r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = frozen ? "oklch(0.5 0.15 25)" : "oklch(0.2 0 0)"
    const bones: [number, number][] = [
      [5, 6],
      [5, 11],
      [6, 12],
      [11, 12],
      [11, 13],
      [13, 15],
      [12, 14],
      [14, 16],
      [5, 7],
      [7, 9],
      [6, 8],
      [8, 10],
    ]
    ctx.lineWidth = 3
    ctx.strokeStyle = ctx.fillStyle as string
    for (const [a, b] of bones) {
      ctx.beginPath()
      ctx.moveTo(keypoints[a].x * w, keypoints[a].y * h)
      ctx.lineTo(keypoints[b].x * w, keypoints[b].y * h)
      ctx.stroke()
    }
    for (let i = 0; i < 17; i++) draw(i, i === 13 || i === 14 ? 8 : 4)
    if (visual.armsOut) {
      ctx.fillStyle = "oklch(0.55 0.12 70)"
      draw(9, 9)
      draw(10, 9)
    }
    if (visual.standing && !visual.armsOut && visual.kneeInward < 0.03) {
      ctx.strokeStyle = "oklch(0.5 0.12 150 / 0.6)"
      ctx.lineWidth = 10
      ctx.beginPath()
      ctx.arc(((keypoints[13].x + keypoints[14].x) / 2) * w, ((keypoints[13].y + keypoints[14].y) / 2) * h, 22, 0, Math.PI * 2)
      ctx.stroke()
    }
  }, [keypoints, visual, pathSteps, frozen])

  return <canvas ref={ref} width={320} height={420} className="h-full w-full rounded-lg" />
}
