"use client"

import { useEffect, useRef } from "react"
import { DROP_EVERY_PX, pruneDrops, spawnDrop, stepDrops, type Drop } from "@/lib/play/lobbyDrops"
import { SCENE_PALETTE, type LobbyScene } from "@/lib/play/lobbyScene"

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
  /** Rehab gym by day, hospital rooftops at night (lib/play/lobbyScene). */
  scene?: LobbyScene
}

/**
 * Ambient Stick Hero–style loop for the RehabNinja lobby.
 * Green hills from the original; the hero is a surgeon ninja (teal scrub cap with the orange tie, white coat,
 * mask) who drops crutches, pills, and band-aids behind him as he walks.
 * Auto-plays; no input. Pointer-events stay on the CTAs above.
 */
export function LobbyStage({
  topReserve = 0,
  bottomReserve = 0,
  scene = "gym",
}: LobbyStageProps) {
  const sceneRef = useRef<LobbyScene>(scene)
  useEffect(() => {
    sceneRef.current = scene
  }, [scene])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const topReserveRef = useRef(topReserve)
  const bottomReserveRef = useRef(bottomReserve)
  const pausedRef = useRef(false)

  useEffect(() => {
    topReserveRef.current = topReserve
    bottomReserveRef.current = bottomReserve
  }, [topReserve, bottomReserve])

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

    function syncPause() {
      const reduce =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      pausedRef.current = document.hidden || reduce
    }
    syncPause()
    const onVis = () => syncPause()
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    document.addEventListener("visibilitychange", onVis)
    mq.addEventListener("change", onVis)

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
    let drops: Drop[] = []
    let dropCount = 0
    let nextDropAt = 0
    let stretchTarget = 0
    const FLASH_LABELS = ["PERFECT", "COMBO ×2", "NICE", "STREAK"]

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener("resize", resize)

    const last = <T,>(arr: T[]) => arr[arr.length - 1]!

    function generatePlatform() {
      const prev = platforms[platforms.length - 1]
      const furthest = prev ? prev.x + prev.w : sceneOffset + 50
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
      drops = []
      nextDropAt = heroX + DROP_EVERY_PX
      planStretch()
    }

    /** Next platform to the right of the current stick anchor. */
    function nextPlatformAfterStick(): Platform | undefined {
      const stickX = sticks[sticks.length - 1]?.x ?? sceneOffset
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

    function drawDrop(d: Drop) {
      ctx.save()
      // Resting supplies sit on the surface: lift each by half its height so it rests on top.
      const lift = d.kind === "crutch" ? 2.2 : 3
      ctx.translate(d.x, VIEW - PLATFORM_H + d.y - lift)
      ctx.rotate(d.rot)
      if (d.kind === "bandaid") {
        ctx.fillStyle = "#F2C9A0"
        drawRoundedRect(-8, -3, 16, 6, 3)
        ctx.fillStyle = "#E7B184"
        ctx.fillRect(-2.5, -3, 5, 6)
        ctx.fillStyle = "#B9875A"
        ctx.beginPath()
        ctx.arc(-1.2, -1, 0.5, 0, Math.PI * 2)
        ctx.arc(1.2, 1, 0.5, 0, Math.PI * 2)
        ctx.fill()
      } else if (d.kind === "pill") {
        ctx.fillStyle = "#ffffff"
        drawRoundedRect(-6, -2.5, 12, 5, 2.5)
        ctx.fillStyle = "#f97316"
        ctx.beginPath()
        ctx.moveTo(0, -2.5)
        ctx.lineTo(3.5, -2.5)
        ctx.arc(3.5, 0, 2.5, -Math.PI / 2, Math.PI / 2)
        ctx.lineTo(0, 2.5)
        ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = "#9CA3AF"
        ctx.lineWidth = 0.5
        ctx.stroke()
      } else {
        // Crutch, drawn vertical (it rests on its side)
        ctx.strokeStyle = "#7A7F87"
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.moveTo(-1.7, -12)
        ctx.lineTo(-1.7, 10)
        ctx.moveTo(1.7, -12)
        ctx.lineTo(1.7, 10)
        ctx.stroke()
        ctx.fillStyle = "#4B5563"
        drawRoundedRect(-4.5, -13.5, 9, 2.6, 1.3)
        drawRoundedRect(-3, -1.5, 6, 2, 1)
        ctx.fillStyle = "#111"
        drawRoundedRect(-2.2, 9.5, 4.4, 2.2, 1)
      }
      ctx.restore()
    }

    function drawDrops() {
      drops.forEach(drawDrop)
    }

    function drawHero() {
      ctx.save()
      // Surgeon ninja: Stick Hero body, white coat, teal scrub cap with the orange RehabNinja tie, blue mask
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
      // White coat over the lower body, with lapels and a red-cross pocket
      const half = HERO_W / 2
      ctx.fillStyle = "#ffffff"
      ctx.beginPath()
      ctx.moveTo(-half, -3)
      ctx.lineTo(half, -3)
      ctx.lineTo(half, 6)
      ctx.arcTo(half, 11, half - 5, 11, 5)
      ctx.lineTo(-half + 5, 11)
      ctx.arcTo(-half, 11, -half, 6, 5)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = "#C9CDD3"
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(-2.5, -3)
      ctx.lineTo(0, 2)
      ctx.lineTo(2.5, -3)
      ctx.stroke()
      ctx.fillStyle = "#E24B4A"
      drawRoundedRect(2.2, 4, 4.4, 4.4, 1)
      ctx.strokeStyle = "#ffffff"
      ctx.lineWidth = 0.9
      ctx.beginPath()
      ctx.moveTo(4.4, 4.9)
      ctx.lineTo(4.4, 7.5)
      ctx.moveTo(3.1, 6.2)
      ctx.lineTo(5.7, 6.2)
      ctx.stroke()
      // Teal scrub cap with the orange tie trailing behind
      ctx.fillStyle = "#1D9E75"
      ctx.beginPath()
      ctx.moveTo(-half - 1, -8.5)
      ctx.quadraticCurveTo(-half - 1, -19.5, 0, -19.5)
      ctx.quadraticCurveTo(half + 1, -19.5, half + 1, -8.5)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = "#f97316"
      ctx.beginPath()
      ctx.moveTo(-half, -11)
      ctx.lineTo(-16, -14)
      ctx.lineTo(-14.5, -7.5)
      ctx.fill()
      // Eye and surgical mask
      ctx.beginPath()
      ctx.fillStyle = "white"
      ctx.arc(4.5, -6.3, 2.3, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = "#85B7EB"
      drawRoundedRect(-0.8, -4.4, half + 0.8, 4.2, 1.8)
      ctx.restore()
    }

    function drawPlatforms() {
      platforms.forEach(({ x, w }) => {
        ctx.fillStyle = SCENE_PALETTE[sceneRef.current].platform
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




    /** Parallax x for a background anchor (the old tree positions, reused for props and buildings). */
    const propX = (x: number) => -sceneOffset * BG_PARALLAX + x
    /** Stable 0..1 value per anchor so each prop keeps its look as it scrolls. */
    const pick = (x: number) => {
      const v = Math.sin(x * 12.9898) * 43758.5453
      return v - Math.floor(v)
    }

    /** Day: bright PT clinic with windows, stall bars, parallel bars, exercise balls, and step blocks. */
    function drawGym(w: number, h: number) {
      const floorY = h - 100
      ctx.fillStyle = "#F3EEE6"
      ctx.fillRect(0, 0, w, h)
      // Windows on a slower parallax band, in the free space between the lobby buttons and the floor
      const winTop = Math.max(topReserveRef.current + 16, floorY - 230)
      const winH = Math.min(120, floorY - 90 - winTop)
      if (winH >= 50) {
        const winW = 120
        const winOffset = (sceneOffset * BG_PARALLAX * 0.5) % (winW + 60)
        for (let x = -winOffset; x < w + winW; x += winW + 60) {
          ctx.fillStyle = "#CFE6F2"
          ctx.fillRect(x, winTop, winW, winH)
          ctx.fillStyle = "#F3EEE6"
          ctx.fillRect(x + winW / 2 - 2, winTop, 4, winH)
          ctx.fillRect(x, winTop + winH / 2 - 2, winW, 4)
        }
      }
      ctx.fillStyle = "#D9C7A8"
      ctx.fillRect(0, floorY, w, h - floorY)
      ctx.fillStyle = "#CDB894"
      ctx.fillRect(0, floorY, w, 3)
      trees.forEach((t) => {
        const x = propX(t.x)
        if (x < -80 || x > w + 80) return
        const kind = Math.floor(pick(t.x) * 4)
        if (kind === 0) {
          // Stall bars on the wall
          ctx.strokeStyle = "#C69A6B"
          ctx.lineWidth = 3
          ctx.beginPath()
          ctx.moveTo(x - 14, floorY)
          ctx.lineTo(x - 14, floorY - 70)
          ctx.moveTo(x + 14, floorY)
          ctx.lineTo(x + 14, floorY - 70)
          for (let y = floorY - 8; y > floorY - 70; y -= 10) {
            ctx.moveTo(x - 14, y)
            ctx.lineTo(x + 14, y)
          }
          ctx.stroke()
        } else if (kind === 1) {
          // Parallel bars
          ctx.strokeStyle = "#7A7F87"
          ctx.lineWidth = 3
          ctx.beginPath()
          ctx.moveTo(x - 30, floorY - 28)
          ctx.lineTo(x + 30, floorY - 28)
          ctx.moveTo(x - 30, floorY - 22)
          ctx.lineTo(x + 30, floorY - 22)
          ctx.moveTo(x - 26, floorY - 28)
          ctx.lineTo(x - 26, floorY)
          ctx.moveTo(x + 26, floorY - 28)
          ctx.lineTo(x + 26, floorY)
          ctx.stroke()
        } else if (kind === 2) {
          // Exercise ball
          ctx.fillStyle = "#5DCAA5"
          ctx.beginPath()
          ctx.arc(x, floorY - 14, 14, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = "#9FE1CB"
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.arc(x, floorY - 8, 12, Math.PI * 1.15, Math.PI * 1.85)
          ctx.stroke()
        } else {
          // Step block
          ctx.fillStyle = "#f97316"
          drawRoundedRect(x - 14, floorY - 10, 28, 10, 2)
        }
      })
    }

    /** Night: dusk sky, moon, twinkling stars, and a skyline with lit windows and the odd red-cross hospital. */
    function drawRooftops(w: number, h: number) {
      ctx.fillStyle = "#2B3554"
      ctx.fillRect(0, 0, w, h)
      // City haze sits low, behind the skyline, so the sky above the buttons stays one calm color
      ctx.fillStyle = "#34416A"
      ctx.fillRect(0, h - 260, w, 260)
      ctx.fillStyle = "#F6E7B8"
      ctx.beginPath()
      ctx.arc(w * 0.82, h * 0.1, 16, 0, Math.PI * 2)
      ctx.fill()
      const t = pausedRef.current ? 0 : performance.now() / 900
      for (let i = 0; i < 40; i++) {
        const sx = pick(i + 0.5) * w
        const sy = pick(i + 7.25) * h * 0.45
        ctx.globalAlpha = 0.45 + 0.4 * Math.sin(t + i)
        ctx.fillRect(sx, sy, 1.6, 1.6)
      }
      ctx.globalAlpha = 1
      const groundY = h - 100
      trees.forEach((tr) => {
        const x = propX(tr.x)
        if (x < -90 || x > w + 90) return
        const r = pick(tr.x)
        const bw = 34 + Math.floor(r * 34)
        const bh = 90 + Math.floor(pick(tr.x + 3) * 150)
        const hospital = r > 0.86
        ctx.fillStyle = hospital ? "#E9EDF5" : "#1F2742"
        ctx.fillRect(x - bw / 2, groundY - bh, bw, bh + 100)
        if (hospital) {
          ctx.fillStyle = "#E24B4A"
          drawRoundedRect(x - 8, groundY - bh + 8, 16, 16, 2)
          ctx.fillStyle = "#ffffff"
          ctx.fillRect(x - 1.8, groundY - bh + 11, 3.6, 10)
          ctx.fillRect(x - 5, groundY - bh + 14.2, 10, 3.6)
        }
        // Windows: a stable lit pattern per building
        for (let wy = groundY - bh + (hospital ? 32 : 10); wy < groundY - 8; wy += 12) {
          for (let wx = x - bw / 2 + 6; wx < x + bw / 2 - 8; wx += 10) {
            const lit = pick(wx * 0.37 + wy) > 0.55
            ctx.fillStyle = lit ? "#F6D27A" : hospital ? "#C9CDD3" : "#2E3858"
            ctx.fillRect(wx, wy, 5, 6)
          }
        }
      })
    }

    function drawHud() {
      const palette = SCENE_PALETTE[sceneRef.current]
      ctx.fillStyle = palette.hud
      ctx.font = "900 36px ui-sans-serif, system-ui, sans-serif"
      ctx.textAlign = "right"
      ctx.fillText(String(score), window.innerWidth - 28, 48)

      if (performance.now() < flashUntil) {
        ctx.textAlign = "center"
        ctx.fillStyle = palette.flash
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

      if (sceneRef.current === "rooftops") drawRooftops(w, h)
      else drawGym(w, h)

      ctx.save()
      ctx.translate((w - VIEW) / 2 - sceneOffset, sceneTop(h))
      drawPlatforms()
      drawSticks()
      drawDrops()
      drawHero()
      ctx.restore()

      drawHud()
    }

    function animate(ts: number) {
      if (!running) return
      if (pausedRef.current) {
        lastTs = undefined
        draw()
        raf = requestAnimationFrame(animate)
        return
      }
      if (!lastTs) {
        lastTs = ts
        raf = requestAnimationFrame(animate)
        return
      }
      // Clamp the step: after a backgrounded tab or a hot reload one giant frame would scroll the camera past
      // every platform, the prune below would empty the world, and the loop would crash.
      const dt = Math.min(50, ts - lastTs)

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
          if (heroX >= nextDropAt) {
            drops = spawnDrop(drops, heroX - HERO_W - 2, -HERO_H + 6, dropCount++)
            nextDropAt = heroX + DROP_EVERY_PX
          }
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
            drops = pruneDrops(drops, sceneOffset - 60)
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

      drops = stepDrops(drops, dt)
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
      document.removeEventListener("visibilitychange", onVis)
      mq.removeEventListener("change", onVis)
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
