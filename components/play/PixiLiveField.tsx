"use client"

import { useEffect, useRef } from "react"
import { Application, Container, Graphics, Text } from "pixi.js"
import type { LiveVisual } from "@/lib/play/findings"
import type { HitMissEvent } from "@/lib/play/hitMiss"
import type { Keypoints17 } from "@/lib/play/types"

type Fx = {
  kind: "hit" | "miss"
  x: number
  y: number
  born: number
  life: number
}

const FX_LIFE_HIT = 550
const FX_LIFE_MISS = 480

export function PixiLiveField({
  keypoints,
  visual,
  events,
  hitCount,
  elapsedMs,
  durationMs,
  frozen,
  showGhost = true,
}: {
  keypoints: Keypoints17 | null
  visual: LiveVisual
  events: HitMissEvent[]
  hitCount: number
  elapsedMs: number
  durationMs: number
  frozen: boolean
  /** Coach silhouette to mirror — keep faint so the camera stays the hero. */
  showGhost?: boolean
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const worldRef = useRef<Container | null>(null)
  const fxRef = useRef<Fx[]>([])
  const stateRef = useRef({ keypoints, visual, hitCount, elapsedMs, durationMs, frozen, showGhost })
  stateRef.current = { keypoints, visual, hitCount, elapsedMs, durationMs, frozen, showGhost }

  useEffect(() => {
    if (!events.length) return
    const now = performance.now()
    for (const e of events) {
      fxRef.current.push({
        kind: e.kind,
        x: e.x,
        y: e.y,
        born: now,
        life: e.kind === "hit" ? FX_LIFE_HIT : FX_LIFE_MISS,
      })
    }
  }, [events])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let dead = false
    const app = new Application()
    const world = new Container()

    void app
      .init({
        backgroundAlpha: 0,
        antialias: true,
        resizeTo: host,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
      })
      .then(() => {
        if (dead) {
          try {
            app.destroy(true)
          } catch {
            /* ignore */
          }
          return
        }
        host.appendChild(app.canvas)
        app.stage.addChild(world)
        appRef.current = app
        worldRef.current = world

        const g = new Graphics()
        const fxLayer = new Graphics()
        const ui = new Container()
        world.addChild(g)
        world.addChild(fxLayer)
        world.addChild(ui)

        const hitLabel = new Text({
          text: "hits 0",
          style: {
            fill: "#fafafa",
            fontSize: 22,
            fontWeight: "600",
            fontFamily: "system-ui, sans-serif",
            dropShadow: {
              color: "#000000",
              alpha: 0.65,
              blur: 4,
              distance: 1,
            },
          },
        })
        hitLabel.x = 12
        hitLabel.y = 10
        ui.addChild(hitLabel)

        app.ticker.add(() => {
          const w = app.screen.width
          const h = app.screen.height
          const s = stateRef.current
          const now = performance.now()
          fxRef.current = fxRef.current.filter((f) => now - f.born < f.life)

          g.clear()
          fxLayer.clear()

          // Soft time bar (no digits)
          const progress = s.durationMs > 0 ? Math.min(1, s.elapsedMs / s.durationMs) : 0
          g.rect(12, h - 18, w - 24, 8)
          g.fill({ color: 0x09090b, alpha: 0.45 })
          g.rect(12, h - 18, (w - 24) * progress, 8)
          g.fill({ color: 0xfafafa, alpha: 0.9 })

          if (s.showGhost) {
            const ghostT = (now / 3200) % 1
            const stand = ghostT < 0.5 ? ghostT * 2 : (1 - ghostT) * 2
            drawGhost(g, w, h, stand)
          }

          // Glowing knee rails (Fruit Ninja “line”)
          const bent = s.visual.kneeInward > 0.03 || s.visual.armsOut
          const bend = s.visual.kneeInward * w * 3.5
          const lineColor = s.frozen ? 0xef4444 : bent ? 0xf97316 : 0xfafafa
          g.moveTo(w * 0.38 + bend, h * 0.18)
          g.lineTo(w * 0.38, h * 0.88)
          g.stroke({ width: 5, color: lineColor, alpha: 0.85 })
          g.moveTo(w * 0.62 - bend, h * 0.18)
          g.lineTo(w * 0.62, h * 0.88)
          g.stroke({ width: 5, color: lineColor, alpha: 0.85 })

          // Soft joint markers only — player body is the camera
          if (s.keypoints && s.visual.trackingOk) {
            for (const i of [13, 14]) {
              g.circle(s.keypoints[i].x * w, s.keypoints[i].y * h, 7)
              g.fill({ color: bent ? 0xf97316 : 0xfafafa, alpha: 0.75 })
            }
            if (s.visual.armsOut) {
              for (const i of [9, 10]) {
                g.circle(s.keypoints[i].x * w, s.keypoints[i].y * h, 10)
                g.fill({ color: 0xb45309, alpha: 0.95 })
              }
            }
          }

          // Fruit Ninja FX on joints
          for (const f of fxRef.current) {
            const age = (now - f.born) / f.life
            const px = f.x * w
            const py = f.y * h
            if (f.kind === "hit") {
              const r = 12 + age * 46
              fxLayer.circle(px, py, r)
              fxLayer.stroke({ width: 5, color: 0x16a34a, alpha: 1 - age })
              fxLayer.circle(px, py - age * 36, 6)
              fxLayer.fill({ color: 0x22c55e, alpha: 1 - age })
            } else {
              const s = 10 + age * 8
              fxLayer.moveTo(px, py - s)
              fxLayer.lineTo(px + s, py)
              fxLayer.lineTo(px, py + s)
              fxLayer.lineTo(px - s, py)
              fxLayer.closePath()
              fxLayer.fill({ color: 0xea580c, alpha: 0.95 - age * 0.7 })
              fxLayer.stroke({ width: 2, color: 0x9a3412, alpha: 1 - age })
            }
          }

          hitLabel.text = `hits ${s.hitCount}`
        })
      })

    return () => {
      dead = true
      appRef.current = null
      worldRef.current = null
      try {
        const canvas = (app as Application & { canvas?: HTMLCanvasElement }).canvas
        try {
          app.destroy(true)
        } catch {
          /* not initialized */
        }
        if (canvas?.parentElement === host) host.removeChild(canvas)
      } catch {
        /* cleanup race */
      }
    }
  }, [])

  return <div ref={hostRef} className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden" />
}

function drawGhost(g: Graphics, w: number, h: number, stand: number) {
  const cx = w * 0.5
  const hipY = h * (0.62 - stand * 0.18)
  const headY = h * (0.28 - stand * 0.12)
  const shoulderY = h * (0.36 - stand * 0.12)
  const kneeY = h * (0.74 - stand * 0.1)
  const ankleY = h * 0.88
  g.circle(cx, headY, 14)
  g.stroke({ width: 3, color: 0xa1a1aa, alpha: 0.35 })
  g.moveTo(cx - 28, shoulderY)
  g.lineTo(cx + 28, shoulderY)
  g.moveTo(cx, shoulderY)
  g.lineTo(cx, hipY)
  g.moveTo(cx, hipY)
  g.lineTo(cx - 18, kneeY)
  g.lineTo(cx - 20, ankleY)
  g.moveTo(cx, hipY)
  g.lineTo(cx + 18, kneeY)
  g.lineTo(cx + 20, ankleY)
  g.stroke({ width: 3, color: 0xa1a1aa, alpha: 0.3 })
}
