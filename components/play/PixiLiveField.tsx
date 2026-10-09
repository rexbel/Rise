"use client"

/**
 * Full-bleed Fruit Ninja overlay on the live camera.
 * Fruits sit on the knees; clean form → slice hits; bent form → bomb / miss.
 */

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
  angle: number
}

type Juice = {
  x: number
  y: number
  vx: number
  vy: number
  born: number
  life: number
  color: number
  r: number
}

const FX_LIFE_HIT = 700
const FX_LIFE_MISS = 650

export function PixiLiveField({
  keypoints,
  visual,
  events,
  hitCount,
  combo,
  elapsedMs,
  durationMs,
  frozen,
  showGhost = false,
}: {
  keypoints: Keypoints17 | null
  visual: LiveVisual
  events: HitMissEvent[]
  hitCount: number
  combo: number
  elapsedMs: number
  durationMs: number
  frozen: boolean
  showGhost?: boolean
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const fxRef = useRef<Fx[]>([])
  const juiceRef = useRef<Juice[]>([])
  const stateRef = useRef({ keypoints, visual, hitCount, combo, elapsedMs, durationMs, frozen, showGhost })
  stateRef.current = { keypoints, visual, hitCount, combo, elapsedMs, durationMs, frozen, showGhost }

  useEffect(() => {
    if (!events.length) return
    const now = performance.now()
    for (const e of events) {
      const angle = (Math.random() - 0.5) * 1.2
      fxRef.current.push({
        kind: e.kind,
        x: e.x,
        y: e.y,
        born: now,
        life: e.kind === "hit" ? FX_LIFE_HIT : FX_LIFE_MISS,
        angle,
      })
      const color = e.kind === "hit" ? 0x22c55e : 0xea580c
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2
        const sp = 0.08 + Math.random() * 0.22
        juiceRef.current.push({
          x: e.x,
          y: e.y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 0.05,
          born: now,
          life: 400 + Math.random() * 350,
          color,
          r: 3 + Math.random() * 5,
        })
      }
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

        const g = new Graphics()
        const fxLayer = new Graphics()
        const ui = new Container()
        world.addChild(g)
        world.addChild(fxLayer)
        world.addChild(ui)

        const hitLabel = new Text({
          text: "0 hits",
          style: {
            fill: "#fafafa",
            fontSize: 28,
            fontWeight: "700",
            fontFamily: "system-ui, sans-serif",
            dropShadow: { color: "#000000", alpha: 0.7, blur: 6, distance: 2 },
          },
        })
        hitLabel.x = 20
        hitLabel.y = 18
        ui.addChild(hitLabel)

        const comboLabel = new Text({
          text: "",
          style: {
            fill: "#fb923c",
            fontSize: 22,
            fontWeight: "700",
            fontFamily: "system-ui, sans-serif",
            dropShadow: { color: "#000000", alpha: 0.7, blur: 4, distance: 1 },
          },
        })
        comboLabel.x = 20
        comboLabel.y = 54
        ui.addChild(comboLabel)

        const hint = new Text({
          text: "Slice fruit — keep knees over feet as you stand",
          style: {
            fill: "#fafafa",
            fontSize: 16,
            fontWeight: "500",
            fontFamily: "system-ui, sans-serif",
            dropShadow: { color: "#000000", alpha: 0.75, blur: 4, distance: 1 },
          },
        })
        hint.x = 20
        hint.y = 86
        ui.addChild(hint)

        app.ticker.add(() => {
          const w = app.screen.width
          const h = app.screen.height
          const s = stateRef.current
          const now = performance.now()
          fxRef.current = fxRef.current.filter((f) => now - f.born < f.life)
          juiceRef.current = juiceRef.current.filter((j) => now - j.born < j.life)

          g.clear()
          fxLayer.clear()

          // Time bar
          const progress = s.durationMs > 0 ? Math.min(1, s.elapsedMs / s.durationMs) : 0
          g.roundRect(20, h - 28, w - 40, 10, 5)
          g.fill({ color: 0x09090b, alpha: 0.5 })
          g.roundRect(20, h - 28, (w - 40) * progress, 10, 5)
          g.fill({ color: 0xfafafa, alpha: 0.92 })

          if (s.showGhost) {
            const ghostT = (now / 3200) % 1
            const stand = ghostT < 0.5 ? ghostT * 2 : (1 - ghostT) * 2
            drawGhost(g, w, h, stand)
          }

          const bent = s.visual.kneeInward > 0.03 || s.visual.armsOut || s.frozen
          const bob = Math.sin(now / 280) * 6

          // Live fruit on knees (and wrists if arms out)
          if (s.keypoints && s.visual.trackingOk) {
            const lk = s.keypoints[13]
            const rk = s.keypoints[14]
            drawFruit(g, lk.x * w, lk.y * h + bob, bent ? "bomb" : "melon", 1)
            drawFruit(g, rk.x * w, rk.y * h - bob * 0.6, bent ? "bomb" : "apple", 1)
            if (s.visual.armsOut) {
              drawFruit(g, s.keypoints[9].x * w, s.keypoints[9].y * h, "bomb", 0.85)
              drawFruit(g, s.keypoints[10].x * w, s.keypoints[10].y * h, "bomb", 0.85)
            }
          } else if (!s.keypoints) {
            // Demo placeholder fruits when no body yet
            drawFruit(g, w * 0.42, h * 0.62 + bob, "melon", 0.7)
            drawFruit(g, w * 0.58, h * 0.62 - bob * 0.5, "apple", 0.7)
          }

          // Slash + halves + juice
          for (const f of fxRef.current) {
            const age = (now - f.born) / f.life
            const px = f.x * w
            const py = f.y * h
            if (f.kind === "hit") {
              drawSlash(fxLayer, px, py, f.angle, age)
              drawHalf(fxLayer, px, py, f.angle, age, 1, 0x16a34a)
              drawHalf(fxLayer, px, py, f.angle, age, -1, 0x15803d)
            } else {
              // Bomb burst
              const r = 18 + age * 40
              fxLayer.circle(px, py, r)
              fxLayer.stroke({ width: 4, color: 0xea580c, alpha: 1 - age })
              fxLayer.circle(px, py, 10 + age * 8)
              fxLayer.fill({ color: 0x1c1917, alpha: 0.9 - age * 0.5 })
              for (let i = 0; i < 6; i++) {
                const a = f.angle + (i / 6) * Math.PI * 2
                fxLayer.moveTo(px, py)
                fxLayer.lineTo(px + Math.cos(a) * (20 + age * 50), py + Math.sin(a) * (20 + age * 50))
              }
              fxLayer.stroke({ width: 3, color: 0xf97316, alpha: 1 - age })
            }
          }

          for (const j of juiceRef.current) {
            const age = (now - j.born) / j.life
            const t = (now - j.born) / 1000
            const jx = (j.x + j.vx * t) * w
            const jy = (j.y + j.vy * t + 0.35 * t * t) * h
            fxLayer.circle(jx, jy, j.r * (1 - age * 0.5))
            fxLayer.fill({ color: j.color, alpha: 1 - age })
          }

          hitLabel.text = `${s.hitCount} hits`
          comboLabel.text = s.combo > 1 ? `combo x${s.combo}` : ""
          hint.alpha = s.hitCount === 0 ? 0.95 : 0.35
        })
      })

    return () => {
      dead = true
      appRef.current = null
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

function drawFruit(g: Graphics, x: number, y: number, kind: "melon" | "apple" | "bomb", scale: number) {
  const r = 28 * scale
  if (kind === "bomb") {
    g.circle(x, y, r * 0.95)
    g.fill({ color: 0x1c1917, alpha: 0.92 })
    g.circle(x, y, r * 0.95)
    g.stroke({ width: 3, color: 0xf97316, alpha: 0.95 })
    g.moveTo(x, y - r * 0.9)
    g.lineTo(x + r * 0.25, y - r * 1.35)
    g.stroke({ width: 3, color: 0xfbbf24, alpha: 1 })
    return
  }
  if (kind === "melon") {
    g.circle(x, y, r)
    g.fill({ color: 0x16a34a, alpha: 0.95 })
    g.ellipse(x, y, r * 0.55, r)
    g.fill({ color: 0x15803d, alpha: 0.5 })
    g.moveTo(x - r * 0.7, y)
    g.lineTo(x + r * 0.7, y)
    g.stroke({ width: 2, color: 0x14532d, alpha: 0.8 })
    g.circle(x + r * 0.25, y - r * 0.35, r * 0.18)
    g.fill({ color: 0xffffff, alpha: 0.35 })
    return
  }
  // apple
  g.circle(x, y, r * 0.9)
  g.fill({ color: 0xdc2626, alpha: 0.95 })
  g.circle(x - r * 0.15, y - r * 0.1, r * 0.85)
  g.fill({ color: 0xb91c1c, alpha: 0.45 })
  g.moveTo(x, y - r * 0.75)
  g.lineTo(x + r * 0.15, y - r * 1.15)
  g.stroke({ width: 3, color: 0x78350f, alpha: 1 })
  g.ellipse(x + r * 0.35, y - r * 0.95, r * 0.28, r * 0.14)
  g.fill({ color: 0x22c55e, alpha: 0.95 })
}

function drawSlash(g: Graphics, x: number, y: number, angle: number, age: number) {
  const len = 40 + age * 90
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  g.moveTo(x - c * len, y - s * len)
  g.lineTo(x + c * len, y + s * len)
  g.stroke({ width: 5, color: 0xfafafa, alpha: 1 - age })
  g.moveTo(x - c * len * 0.7, y - s * len * 0.7)
  g.lineTo(x + c * len * 0.7, y + s * len * 0.7)
  g.stroke({ width: 2, color: 0x86efac, alpha: 0.8 - age })
}

function drawHalf(g: Graphics, x: number, y: number, angle: number, age: number, side: 1 | -1, color: number) {
  const nx = -Math.sin(angle) * side
  const ny = Math.cos(angle) * side
  const dist = age * 55
  const hx = x + nx * dist
  const hy = y + ny * dist - age * 20
  g.ellipse(hx, hy, 22, 14)
  g.fill({ color, alpha: 1 - age * 0.85 })
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
