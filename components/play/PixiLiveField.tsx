"use client"

/**
 * Full-bleed RehabNinja overlay on the live camera.
 * Fruits on target joints; clean apex → slash; form break → bomb.
 */

import { useEffect, useLayoutEffect, useRef } from "react"
import { Application, Container, Graphics } from "pixi.js"
import type { LiveVisual } from "@/lib/play/findings"
import type { HitMissEvent } from "@/lib/play/hitMiss"
import type { ExerciseId } from "@/lib/play/programs"
import type { Keypoints17 } from "@/lib/play/types"
import { avatarGeometry, demoY, fitDemoBand, type AvatarGeometry } from "@/lib/play/avatarGeometry"

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
  progress,
  frozen,
  showGhost = false,
  exerciseId = "sit_to_stand",
  dimmed = false,
}: {
  keypoints: Keypoints17 | null
  visual: LiveVisual
  events: HitMissEvent[]
  hitCount: number
  combo: number
  elapsedMs: number
  durationMs: number
  progress: number
  frozen: boolean
  showGhost?: boolean
  exerciseId?: ExerciseId
  dimmed?: boolean
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const fxRef = useRef<Fx[]>([])
  const juiceRef = useRef<Juice[]>([])
  const stateRef = useRef({
    keypoints,
    visual,
    hitCount,
    combo,
    elapsedMs,
    durationMs,
    progress,
    frozen,
    showGhost,
    exerciseId,
    dimmed,
  })
  useLayoutEffect(() => {
    stateRef.current = {
      keypoints,
      visual,
      hitCount,
      combo,
      elapsedMs,
      durationMs,
      progress,
      frozen,
      showGhost,
      exerciseId,
      dimmed,
    }
  })

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
      for (let i = 0; i < 16; i++) {
        const a = Math.random() * Math.PI * 2
        const sp = 0.1 + Math.random() * 0.25
        juiceRef.current.push({
          x: e.x,
          y: e.y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 0.05,
          born: now,
          life: 400 + Math.random() * 350,
          color,
          r: 4 + Math.random() * 6,
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
        world.addChild(g)
        world.addChild(fxLayer)

        app.ticker.add(() => {
          const w = app.screen.width
          const h = app.screen.height
          const s = stateRef.current
          const now = performance.now()
          fxRef.current = fxRef.current.filter((f) => now - f.born < f.life)
          juiceRef.current = juiceRef.current.filter((j) => now - j.born < j.life)
          world.alpha = s.dimmed ? 0.45 : 1

          g.clear()
          fxLayer.clear()

          const prog = Math.max(0, Math.min(1, s.progress))
          g.roundRect(20, h - 28, w - 40, 10, 5)
          g.fill({ color: 0x09090b, alpha: 0.55 })
          g.roundRect(20, h - 28, (w - 40) * prog, 10, 5)
          g.fill({ color: 0xfafafa, alpha: 0.95 })

          // Demo replay fits the body below the header; live camera keypoints stay as tracked.
          const kp = s.showGhost && s.keypoints ? fitDemoBand(s.keypoints) : s.keypoints
          const fy = (y: number) => (s.showGhost ? demoY(y) : y)

          if (s.showGhost) {
            // Demo replay: the medic ninja is drawn from the same keypoints that place the fruit.
            const body = avatarGeometry(kp, w, h)
            if (body) drawMedicNinja(g, body)
          }

          const bent =
            s.visual.kneeInward > 0.035 ||
            (s.exerciseId !== "single_leg_balance" && s.visual.armsOut) ||
            s.frozen ||
            (s.exerciseId === "single_leg_balance" && s.visual.sway > 0.08)
          const pulse = 1 + Math.sin(now / 220) * 0.12
          const bob = Math.sin(now / 280) * 8

          // Near-apex pulse cue for STS/squat
          const nearApex = s.visual.standAmount > 0.45 && s.visual.standAmount < 0.7 && !bent && s.visual.trackingOk

          if (kp && s.visual.trackingOk) {
            if (s.exerciseId === "single_leg_balance") {
              const ax = ((kp[15].x + kp[16].x) / 2) * w
              const ay = ((kp[15].y + kp[16].y) / 2) * h
              const r = 58 * pulse
              g.circle(ax, ay, r)
              g.stroke({ width: 5, color: bent ? 0xea580c : 0xfafafa, alpha: 0.55 })
              g.circle(ax, ay, r * prog)
              g.stroke({ width: 7, color: 0x22c55e, alpha: 0.95 })
              drawFruit(g, ax, ay, bent ? "bomb" : "melon", 1.35 * pulse)
            } else {
              const scale = (nearApex ? 1.45 : 1.28) * pulse
              drawFruit(g, kp[13].x * w, kp[13].y * h + bob, bent ? "bomb" : "melon", scale)
              drawFruit(g, kp[14].x * w, kp[14].y * h - bob * 0.6, bent ? "bomb" : "apple", scale)
              if (s.visual.armsOut) {
                drawFruit(g, kp[9].x * w, kp[9].y * h, "bomb", 1.2)
                drawFruit(g, kp[10].x * w, kp[10].y * h, "bomb", 1.2)
              }
            }
          } else if (!kp) {
            drawFruit(g, w * 0.42, h * 0.62 + bob, "melon", 1.15)
            drawFruit(g, w * 0.58, h * 0.62 - bob * 0.5, "apple", 1.15)
          }

          for (const f of fxRef.current) {
            const age = (now - f.born) / f.life
            const px = f.x * w
            const py = fy(f.y) * h
            if (f.kind === "hit") {
              drawSlash(fxLayer, px, py, f.angle, age)
              drawHalf(fxLayer, px, py, f.angle, age, 1, 0x16a34a)
              drawHalf(fxLayer, px, py, f.angle, age, -1, 0x15803d)
            } else {
              const r = 28 + age * 64
              fxLayer.circle(px, py, r)
              fxLayer.stroke({ width: 7, color: 0xea580c, alpha: 1 - age })
              fxLayer.circle(px, py, 16 + age * 14)
              fxLayer.fill({ color: 0x1c1917, alpha: 0.9 - age * 0.5 })
            }
          }

          for (const j of juiceRef.current) {
            const age = (now - j.born) / j.life
            const t = (now - j.born) / 1000
            const jx = (j.x + j.vx * t) * w
            const jy = (fy(j.y) + j.vy * t + 0.35 * t * t) * h
            fxLayer.circle(jx, jy, j.r * (1 - age * 0.5))
            fxLayer.fill({ color: j.color, alpha: 1 - age })
          }
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
  const r = 42 * scale
  if (kind === "bomb") {
    g.circle(x, y, r * 0.95)
    g.fill({ color: 0x1c1917, alpha: 0.95 })
    g.circle(x, y, r * 0.95)
    g.stroke({ width: 5, color: 0xf97316, alpha: 1 })
    g.moveTo(x, y - r * 0.9)
    g.lineTo(x + r * 0.28, y - r * 1.4)
    g.stroke({ width: 5, color: 0xfbbf24, alpha: 1 })
    return
  }
  if (kind === "melon") {
    g.circle(x, y, r)
    g.fill({ color: 0x16a34a, alpha: 0.97 })
    g.ellipse(x, y, r * 0.55, r)
    g.fill({ color: 0x15803d, alpha: 0.55 })
    g.moveTo(x - r * 0.75, y)
    g.lineTo(x + r * 0.75, y)
    g.stroke({ width: 3, color: 0x14532d, alpha: 0.85 })
    g.circle(x + r * 0.28, y - r * 0.35, r * 0.2)
    g.fill({ color: 0xffffff, alpha: 0.4 })
    return
  }
  g.circle(x, y, r * 0.92)
  g.fill({ color: 0xdc2626, alpha: 0.97 })
  g.moveTo(x, y - r * 0.75)
  g.lineTo(x + r * 0.18, y - r * 1.2)
  g.stroke({ width: 4, color: 0x78350f, alpha: 1 })
  g.ellipse(x + r * 0.38, y - r * 0.98, r * 0.3, r * 0.15)
  g.fill({ color: 0x22c55e, alpha: 0.95 })
}

function drawSlash(g: Graphics, x: number, y: number, angle: number, age: number) {
  const len = 70 + age * 140
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  g.moveTo(x - c * len, y - s * len)
  g.lineTo(x + c * len, y + s * len)
  g.stroke({ width: 10, color: 0xfafafa, alpha: 1 - age })
  g.moveTo(x - c * len * 0.7, y - s * len * 0.7)
  g.lineTo(x + c * len * 0.7, y + s * len * 0.7)
  g.stroke({ width: 4, color: 0x86efac, alpha: 0.9 - age })
}

function drawHalf(g: Graphics, x: number, y: number, angle: number, age: number, side: 1 | -1, color: number) {
  const nx = -Math.sin(angle) * side
  const ny = Math.cos(angle) * side
  const dist = age * 90
  const hx = x + nx * dist
  const hy = y + ny * dist - age * 28
  g.ellipse(hx, hy, 36, 20)
  g.fill({ color, alpha: 1 - age * 0.85 })
}

/** Light rim so the dark parts of the figure stand out from the near-black stage. */
const RIM = 0xe7e5e4
const LIMB = 0x57534e // slate legs: lighter than the stage, still reads as the ninja
const SLEEVE = 0xfafaf9
const SLEEVE_EDGE = 0x78716c
const HAND = 0x292524
const COAT = 0xffffff
const COAT_EDGE = 0xd6d3d1
const HOOD = 0x111111
const BAND = 0x1d9e75
const MASK = 0x85b7eb

type Pt = { x: number; y: number }

function bone(g: Graphics, a: Pt, b: Pt, width: number, color: number, alpha = 1) {
  g.moveTo(a.x, a.y)
  g.lineTo(b.x, b.y)
  g.stroke({ width, color, alpha, cap: "round", join: "round" })
}

/**
 * Medic ninja from keypoints: slate legs, white coat torso, white sleeves with dark hands, black hood with the green
 * band and cross, blue mask. Every dark part gets a light rim so the body reads on the dark stage.
 */
function drawMedicNinja(g: Graphics, b: AvatarGeometry) {
  const t = b.limb
  const [ls, rs] = b.shoulders
  const [lh, rh] = b.hips

  // Legs and pelvis (rim first, then fill)
  const legs: [Pt, Pt][] = [
    [b.hips[0], b.knees[0]],
    [b.knees[0], b.ankles[0]],
    [b.hips[1], b.knees[1]],
    [b.knees[1], b.ankles[1]],
    [lh, rh],
  ]
  for (const [a, c] of legs) bone(g, a, c, t + 6, RIM, 0.85)
  for (const [a, c] of legs) bone(g, a, c, t, LIMB)

  // Coat torso: shoulders to hips, slightly flared
  const pad = t * 0.45
  g.poly([ls.x - pad, ls.y, rs.x + pad, rs.y, rh.x + pad * 0.7, rh.y + t * 0.3, lh.x - pad * 0.7, lh.y + t * 0.3])
  g.fill({ color: COAT, alpha: 1 })
  g.stroke({ width: 3, color: COAT_EDGE, alpha: 1, join: "round" })
  // Lapels and the red-cross pocket
  const mid = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 }
  const lapel = t * 0.9
  g.moveTo(mid.x - lapel * 0.5, mid.y + 2)
  g.lineTo(mid.x, mid.y + lapel)
  g.lineTo(mid.x + lapel * 0.5, mid.y + 2)
  g.stroke({ width: 2, color: COAT_EDGE, alpha: 1 })
  const pocket = { x: rs.x - t * 0.9, y: (rs.y + rh.y) / 2 }
  const ps = Math.max(6, t * 0.45)
  g.roundRect(pocket.x - ps / 2, pocket.y - ps / 2, ps, ps, 2)
  g.fill({ color: 0xe24b4a, alpha: 1 })
  g.moveTo(pocket.x, pocket.y - ps * 0.3)
  g.lineTo(pocket.x, pocket.y + ps * 0.3)
  g.moveTo(pocket.x - ps * 0.3, pocket.y)
  g.lineTo(pocket.x + ps * 0.3, pocket.y)
  g.stroke({ width: Math.max(1.5, ps * 0.18), color: 0xffffff, alpha: 1 })

  // Arms: outlined white sleeves over the coat, dark hands with a rim
  const arms: [Pt, Pt][] = [
    [ls, b.elbows[0]],
    [b.elbows[0], b.wrists[0]],
    [rs, b.elbows[1]],
    [b.elbows[1], b.wrists[1]],
  ]
  const armW = t * 0.85
  for (const [a, c] of arms) bone(g, a, c, armW + 5, SLEEVE_EDGE)
  for (const [a, c] of arms) bone(g, a, c, armW, SLEEVE)
  for (const w of b.wrists) {
    g.circle(w.x, w.y, armW * 0.55 + 2.5)
    g.fill({ color: RIM, alpha: 0.9 })
    g.circle(w.x, w.y, armW * 0.55)
    g.fill({ color: HAND, alpha: 1 })
  }

  // Neck and head: black hood, green band with a white cross, white eye, blue mask
  const r = b.headR
  const head = { x: b.head.x, y: Math.min(b.head.y, mid.y - r * 0.9) }
  bone(g, { x: mid.x, y: mid.y }, { x: head.x, y: head.y + r * 0.6 }, t * 0.8 + 6, RIM, 0.85)
  bone(g, { x: mid.x, y: mid.y }, { x: head.x, y: head.y + r * 0.6 }, t * 0.8, HOOD)
  g.circle(head.x, head.y, r + 3)
  g.fill({ color: RIM, alpha: 0.9 })
  g.circle(head.x, head.y, r)
  g.fill({ color: HOOD, alpha: 1 })
  const bandH = r * 0.36
  g.rect(head.x - r * 0.98, head.y - r * 0.55, r * 1.96, bandH)
  g.fill({ color: BAND, alpha: 1 })
  // Tail of the band trailing behind
  g.poly([head.x - r * 0.95, head.y - r * 0.5, head.x - r * 1.7, head.y - r * 0.85, head.x - r * 1.55, head.y - r * 0.2])
  g.fill({ color: BAND, alpha: 1 })
  const cy = head.y - r * 0.55 + bandH / 2
  g.moveTo(head.x - r * 0.16, cy)
  g.lineTo(head.x + r * 0.16, cy)
  g.moveTo(head.x, cy - r * 0.14)
  g.lineTo(head.x, cy + r * 0.14)
  g.stroke({ width: Math.max(1.5, r * 0.09), color: 0xffffff, alpha: 1 })
  g.circle(head.x + r * 0.38, head.y + r * 0.02, r * 0.16)
  g.fill({ color: 0xffffff, alpha: 1 })
  g.roundRect(head.x - r * 0.62, head.y + r * 0.22, r * 1.24, r * 0.48, r * 0.22)
  g.fill({ color: MASK, alpha: 1 })
}
