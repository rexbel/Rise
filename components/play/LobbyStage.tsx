"use client"

import { useEffect, useRef } from "react"

type Phase =
  | "waiting"
  | "stretching"
  | "turning"
  | "walking"
  | "transitioning"
  | "falling"
  | "reset"

type Platform = { x: number; w: number }
type Stick = { x: number; length: number; rotation: number }
type Tree = { x: number; color: string }

const VIEW = 375
const PLATFORM_H = 100
const HERO_FROM_EDGE = 10
const PADDING_X = 100
const PERFECT = 10
const BG_PARALLAX = 0.18
const HERO_W = 17
const HERO_H = 30

const TREE_COLORS = ["#6D8821", "#8FAC34", "#98B333"]

type LobbyStageProps = {
  /** Pixels reserved at top for title/CTAs — playfield sits below this band. */
  topReserve?: number
  /** Pixels reserved at bottom — playfield sits above this band. */
  bottomReserve?: number
}

/**
 * Ambient Stick Hero–style loop for the RehabNinja lobby.
 * Green hills from the original; orange accents for RehabNinja.
 * Auto-plays; no input. Pointer-events stay on the CTAs above.
 */
export function LobbyStage({
  topReserve = 0,
  bottomReserve = 0,
}: LobbyStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const topReserveRef = useRef(topReserve)
  const bottomReserveRef = useRef(bottomReserve)
  topReserveRef.current = topReserve
  bottomReserveRef.current = bottomReserve

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const raw = canvas.getContext("2d")
    if (!raw) return
    const ctx: CanvasRenderingContext2D = raw

    function sceneTop(h: number) {
      // Place playfield in the free band between top chrome and bottom reserve
      const top = topReserveRef.current
      const bottom = bottomReserveRef.current
      const usable = Math.max(VIEW, h - top - bottom)
      return top + Math.max(0, (usable - VIEW) / 2)
    }

    let raf = 0
    let running = true
    let phase: Phase = "waiting"
    let lastTs: number | undefined
    let waitUntil = 0
    let heroX = 0
    let heroY = 0
    let sceneOffset = 0
    let score = 0
    let combo = 0
    let flashUntil = 0
    let flashLabel = ""
    let platforms: Platform[] = []
    let sticks: Stick[] = []
    let trees: Tree[] = []
    let stretchTarget = 0
    const FLASH_LABELS = ["PERFECT", "COMBO ×2", "NICE", "STREAK"]

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener("resize", resize)

    const last = <T,>(arr: T[]) => arr[arr.length - 1]!
    const sinus = (deg: number) => Math.sin((deg / 180) * Math.PI)

    function generatePlatform() {
      const prev = last(platforms)
      const furthest = prev.x + prev.w
      // Tight gaps so the ninja keeps hopping across several blocks
      const gap = 36 + Math.floor(Math.random() * 55)
      const w = 36 + Math.floor(Math.random() * 40)
      platforms.push({ x: furthest + gap, w })
    }

    function generateTree() {
      const prev = trees[trees.length - 1]
      const furthest = prev ? prev.x : 0
      const x = furthest + 30 + Math.floor(Math.random() * 120)
      trees.push({
        x,
        color: TREE_COLORS[Math.floor(Math.random() * TREE_COLORS.length)]!,
      })
    }

    function resetGame(keepScore = false) {
      phase = "waiting"
      lastTs = undefined
      sceneOffset = 0
      heroY = 0
      if (!keepScore) {
        score = 0
        combo = 0
      }
      waitUntil = performance.now() + 280
      platforms = [{ x: 50, w: 52 }]
      for (let i = 0; i < 8; i++) generatePlatform()
      sticks = [{ x: platforms[0]!.x + platforms[0]!.w, length: 0, rotation: 0 }]
      trees = []
      for (let i = 0; i < 14; i++) generateTree()
      heroX = platforms[0]!.x + platforms[0]!.w - HERO_FROM_EDGE
      planStretch()
    }

    /** Next platform to the right of the current stick anchor. */
    function nextPlatformAfterStick(): Platform | undefined {
      const stickX = last(sticks).x
      return platforms.find((p) => p.x >= stickX - 0.5)
    }

    function planStretch() {
      const stick = last(sticks)
      let next = nextPlatformAfterStick()
      if (!next) {
        generatePlatform()
        next = nextPlatformAfterStick()
      }
      if (!next) {
        stretchTarget = 80
        return
      }
      const stickX = stick.x
      const perfectMid = next.x + next.w / 2
      // Always land; often perfect so combos keep flashing while he hops onward
      const aimPerfect = Math.random() < 0.6
      if (aimPerfect) {
        stretchTarget = perfectMid - stickX + (Math.random() - 0.5) * 2
      } else {
        const edgePad = 8 + Math.random() * Math.max(8, next.w * 0.25)
        stretchTarget =
          Math.random() < 0.5
            ? next.x - stickX + edgePad
            : next.x + next.w - stickX - edgePad
      }
      stretchTarget = Math.max(30, stretchTarget)
    }

    function flashCombo(perfect: boolean) {
      if (perfect) {
        combo += 1
        flashLabel =
          combo >= 3
            ? `STREAK ×${combo}`
            : FLASH_LABELS[Math.floor(Math.random() * FLASH_LABELS.length)]!
      } else {
        combo = 0
        flashLabel = "+1"
      }
      flashUntil = performance.now() + 850
    }

    function stickHits(): [Platform | undefined, boolean] {
      const stick = last(sticks)
      if (stick.rotation !== 90) return [undefined, false]
      const far = stick.x + stick.length
      const hit = platforms.find((p) => p.x < far && far < p.x + p.w)
      if (!hit) return [undefined, false]
      const mid = hit.x + hit.w / 2
      const perfect =
        mid - PERFECT / 2 < far && far < mid + PERFECT / 2
      return [hit, perfect]
    }

    function drawRoundedRect(
      x: number,
      y: number,
      w: number,
      h: number,
      r: number,
    ) {
      ctx.beginPath()
      ctx.moveTo(x, y + r)
      ctx.lineTo(x, y + h - r)
      ctx.arcTo(x, y + h, x + r, y + h, r)
      ctx.lineTo(x + w - r, y + h)
      ctx.arcTo(x + w, y + h, x + w, y + h - r, r)
      ctx.lineTo(x + w, y + r)
      ctx.arcTo(x + w, y, x + w - r, y, r)
      ctx.lineTo(x + r, y)
      ctx.arcTo(x, y, x, y + r, r)
      ctx.fill()
    }

    function drawHero() {
      ctx.save()
      // Stick Hero black body; orange band = RehabNinja
      ctx.fillStyle = "black"
      ctx.translate(
        heroX - HERO_W / 2,
        heroY + VIEW - PLATFORM_H - HERO_H / 2,
      )
      drawRoundedRect(-HERO_W / 2, -HERO_H / 2, HERO_W, HERO_H - 4, 5)
      const leg = 5
      ctx.beginPath()
      ctx.arc(leg, 11.5, 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(-leg, 11.5, 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.fillStyle = "white"
      ctx.arc(5, -7, 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = "#f97316"
      ctx.fillRect(-HERO_W / 2 - 1, -12, HERO_W + 2, 4.5)
      ctx.beginPath()
      ctx.moveTo(-9, -14.5)
      ctx.lineTo(-17, -18.5)
      ctx.lineTo(-14, -8.5)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(-10, -10.5)
      ctx.lineTo(-15, -3.5)
      ctx.lineTo(-5, -7)
      ctx.fill()
      ctx.restore()
    }

    function drawPlatforms() {
      platforms.forEach(({ x, w }) => {
        ctx.fillStyle = "black"
        ctx.fillRect(
          x,
          VIEW - PLATFORM_H,
          w,
          PLATFORM_H + (window.innerHeight - VIEW) / 2,
        )
        if (last(sticks).x < x) {
          ctx.fillStyle = "#f97316"
          ctx.fillRect(
            x + w / 2 - PERFECT / 2,
            VIEW - PLATFORM_H,
            PERFECT,
            PERFECT,
          )
        }
      })
    }

    function drawSticks() {
      sticks.forEach((stick) => {
        ctx.save()
        ctx.translate(stick.x, VIEW - PLATFORM_H)
        ctx.rotate((Math.PI / 180) * stick.rotation)
        ctx.beginPath()
        ctx.lineWidth = 2
        ctx.strokeStyle = "black"
        ctx.moveTo(0, 0)
        ctx.lineTo(0, -stick.length)
        ctx.stroke()
        ctx.restore()
      })
    }

    function getHillY(windowX: number, baseHeight: number, amplitude: number, stretch: number) {
      const sineBaseY = window.innerHeight - baseHeight
      return (
        sinus((sceneOffset * BG_PARALLAX + windowX) * stretch) * amplitude +
        sineBaseY
      )
    }

    function drawHill(
      baseHeight: number,
      amplitude: number,
      stretch: number,
      color: string,
    ) {
      const w = window.innerWidth
      const h = window.innerHeight
      ctx.beginPath()
      ctx.moveTo(0, h)
      ctx.lineTo(0, getHillY(0, baseHeight, amplitude, stretch))
      for (let i = 0; i < w; i++) {
        ctx.lineTo(i, getHillY(i, baseHeight, amplitude, stretch))
      }
      ctx.lineTo(w, h)
      ctx.fillStyle = color
      ctx.fill()
    }

    function drawTree(x: number, color: string) {
      ctx.save()
      const hill1Base = 100
      const hill1Amp = 10
      ctx.translate(
        (-sceneOffset * BG_PARALLAX + x) * 1,
        window.innerHeight - hill1Base + sinus(x) * hill1Amp,
      )
      ctx.fillStyle = "#7D833C"
      ctx.fillRect(-1, -5, 2, 5)
      ctx.beginPath()
      ctx.moveTo(-5, -5)
      ctx.lineTo(0, -30)
      ctx.lineTo(5, -5)
      ctx.fillStyle = color
      ctx.fill()
      ctx.restore()
    }

    function drawHud() {
      ctx.fillStyle = "#111"
      ctx.font = "900 36px ui-sans-serif, system-ui, sans-serif"
      ctx.textAlign = "right"
      ctx.fillText(String(score), window.innerWidth - 28, 48)

      if (performance.now() < flashUntil) {
        ctx.textAlign = "center"
        ctx.fillStyle = "#ea580c"
        ctx.font = "800 26px ui-sans-serif, system-ui, sans-serif"
        ctx.globalAlpha = Math.min(1, (flashUntil - performance.now()) / 350)
        ctx.fillText(
          flashLabel,
          window.innerWidth / 2,
          sceneTop(window.innerHeight) + 28,
        )
        ctx.globalAlpha = 1
      }
    }

    function draw() {
      const w = window.innerWidth
      const h = window.innerHeight
      ctx.clearRect(0, 0, w, h)

      // Stick Hero sky
      const sky = ctx.createLinearGradient(0, 0, 0, h)
      sky.addColorStop(0, "#BBD691")
      sky.addColorStop(1, "#FEF1E1")
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, w, h)

      drawHill(100, 10, 1, "#95C629")
      drawHill(70, 20, 0.5, "#659F1C")
      trees.forEach((t) => drawTree(t.x, t.color))

      ctx.save()
      ctx.translate((w - VIEW) / 2 - sceneOffset, sceneTop(h))
      drawPlatforms()
      drawHero()
      drawSticks()
      ctx.restore()

      drawHud()
    }

    function animate(ts: number) {
      if (!running) return
      if (!lastTs) {
        lastTs = ts
        raf = requestAnimationFrame(animate)
        return
      }
      const dt = ts - lastTs

      switch (phase) {
        case "waiting": {
          if (ts >= waitUntil) {
            phase = "stretching"
            lastTs = ts
          }
          break
        }
        case "stretching": {
          last(sticks).length += dt / 2.1
          if (last(sticks).length >= stretchTarget) {
            last(sticks).length = stretchTarget
            phase = "turning"
          }
          break
        }
        case "turning": {
          last(sticks).rotation += dt / 2.4
          if (last(sticks).rotation > 90) {
            last(sticks).rotation = 90
            const [next, perfect] = stickHits()
            if (next) {
              score += perfect ? 2 : 1
              flashCombo(perfect)
              generatePlatform()
              generateTree()
              generateTree()
            }
            phase = "walking"
          }
          break
        }
        case "walking": {
          heroX += dt / 1.85
          const [landed] = stickHits()
          if (landed) {
            const maxX = landed.x + landed.w - HERO_FROM_EDGE
            if (heroX > maxX) {
              heroX = maxX
              // Keep hopping — camera follows so you see him cross many blocks
              phase = "transitioning"
            }
          } else {
            const maxX = last(sticks).x + last(sticks).length + HERO_W
            if (heroX > maxX) {
              heroX = maxX
              phase = "falling"
            }
          }
          break
        }
        case "transitioning": {
          // Original Stick Hero camera: scroll world, don't reset the hero to block #1
          sceneOffset += dt / 0.95
          const [landed] = stickHits()
          if (landed && sceneOffset > landed.x + landed.w - PADDING_X) {
            sticks.push({
              x: landed.x + landed.w,
              length: 0,
              rotation: 0,
            })
            // Prune far-left clutter; keep a long runway ahead
            platforms = platforms.filter(
              (p) => p.x + p.w > sceneOffset - 80,
            )
            sticks = sticks.filter((s) => s.x > sceneOffset - 120)
            while (platforms.length < 10) generatePlatform()
            trees = trees.filter((t) => t.x > sceneOffset * BG_PARALLAX - 40)
            while (trees.length < 14) generateTree()
            planStretch()
            waitUntil = performance.now() + 90
            phase = "waiting"
          }
          break
        }
        case "falling": {
          // Rare — auto-demo prefers landing. Restart quickly and keep going.
          if (last(sticks).rotation < 180) {
            last(sticks).rotation += dt / 2.4
          }
          heroY += dt / 1.2
          const maxY = PLATFORM_H + 120 + sceneTop(window.innerHeight)
          if (heroY > maxY) {
            phase = "reset"
            waitUntil = performance.now() + 180
          }
          break
        }
        case "reset": {
          if (ts >= waitUntil) resetGame(true)
          break
        }
      }

      draw()
      lastTs = ts
      raf = requestAnimationFrame(animate)
    }

    resetGame()
    draw()
    raf = requestAnimationFrame(animate)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    />
  )
}
