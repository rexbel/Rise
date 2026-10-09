"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { PoseEstimator } from "@/lib/pose"
import { FpsMonitor, selectTier } from "@/lib/pose/select"
import { seededFrames } from "@/lib/pose/seeded"
import type { Keypoints17, PoseTier, SeedPatient } from "@/lib/types"

/** COCO skeleton edges for the overlay. */
const EDGES: [number, number][] = [
  [5, 6], [5, 7], [7, 9], [6, 8], [8, 10], [5, 11], [6, 12], [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [0, 5], [0, 6],
]

/** Whole body in frame: head, a hip and an ankle visible and inside the picture. */
export function fullBodyVisible(kp: Keypoints17 | null) {
  if (!kp) return false
  const seen = (i: number) => kp[i][2] >= 0.5 && kp[i][1] > 0.01 && kp[i][1] < 0.99 && kp[i][0] > 0.01 && kp[i][0] < 0.99
  return seen(0) && (seen(11) || seen(12)) && (seen(15) || seen(16))
}

function draw(canvas: HTMLCanvasElement | null, kp: Keypoints17 | null, opaque: boolean) {
  const ctx = canvas?.getContext("2d")
  if (!canvas || !ctx) return
  const w = (canvas.width = canvas.clientWidth)
  const h = (canvas.height = canvas.clientHeight)
  ctx.clearRect(0, 0, w, h)
  if (opaque) {
    ctx.fillStyle = "#0b1220"
    ctx.fillRect(0, 0, w, h)
  }
  if (!kp) return
  ctx.lineWidth = 6
  ctx.lineCap = "round"
  ctx.strokeStyle = "#34d399"
  for (const [a, b] of EDGES) {
    if (kp[a][2] < 0.3 || kp[b][2] < 0.3) continue
    ctx.beginPath()
    ctx.moveTo(kp[a][0] * w, kp[a][1] * h)
    ctx.lineTo(kp[b][0] * w, kp[b][1] * h)
    ctx.stroke()
  }
}

export type FrameHandler = (kp: Keypoints17 | null) => void

/**
 * Camera + pose tier + frame loop for the patient phone. Live: camera -> selected tier -> onFrame, with the
 * mid-test swap to preloaded MediaPipe. Seeded: replays the patient's frames against `seededClock()` (ms from Go).
 */
export function usePose() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const onFrame = useRef<FrameHandler>(() => {})
  const est = useRef<{ primary: PoseEstimator; fallback: PoseEstimator | null } | null>(null)
  const seeded = useRef<{ frames: { t: number; kp: Keypoints17 }[]; clock: () => number } | null>(null)
  const loopId = useRef(0)
  /** Bumped by every start; a slower earlier start (camera prompt, model load) must not take over. */
  const startGen = useRef(0)
  const [tier, setTier] = useState<PoseTier | null>(null)
  const [status, setStatus] = useState<string>("")
  const [error, setError] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)
  const [fps, setFps] = useState(0)
  const [ready, setReady] = useState(false)
  const tierChange = useRef<(tier: PoseTier, fps: number) => void>(() => {})

  const stopAll = useCallback(() => {
    loopId.current++
    ;(videoRef.current?.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop())
    est.current?.primary.dispose()
    est.current?.fallback?.dispose()
    est.current = null
  }, [])
  useEffect(() => stopAll, [stopAll])

  const loop = useCallback(() => {
    const id = ++loopId.current
    const monitor = new FpsMonitor()
    let lastVisible = false
    let fpsShown = 0
    const tick = async () => {
      if (id !== loopId.current) return
      let kp: Keypoints17 | null = null
      if (seeded.current) {
        const { frames, clock } = seeded.current
        const t = clock()
        // Latest frame at or before the clock (frames are sorted).
        let lo = 0, hi = frames.length - 1
        while (lo < hi) {
          const m = (lo + hi + 1) >> 1
          if (frames[m].t <= t) lo = m
          else hi = m - 1
        }
        kp = frames[lo]?.kp ?? null
        draw(canvasRef.current, kp, true)
      } else if (est.current && videoRef.current) {
        kp = await est.current.primary.estimate(videoRef.current)
        const now = performance.now()
        if (monitor.frame(now) && est.current.primary.tier === "yolo-onnx" && est.current.fallback) {
          // Mid-test swap: YOLO under the swap threshold; MediaPipe is already loaded, count and timer carry on.
          est.current.primary.dispose()
          est.current = { primary: est.current.fallback, fallback: null }
          setTier("mediapipe")
          tierChange.current("mediapipe", monitor.fps)
        }
        draw(canvasRef.current, kp, false)
        if (monitor.fps !== fpsShown) setFps((fpsShown = monitor.fps))
      }
      const v = fullBodyVisible(kp)
      if (v !== lastVisible) setVisible((lastVisible = v))
      onFrame.current(kp)
      requestAnimationFrame(() => void tick())
    }
    void tick()
  }, [])

  /** Start the camera and pick a tier behind the setup checks. */
  const startLive = useCallback(
    async (facing: "environment" | "user") => {
      const my = ++startGen.current
      setError(null)
      setReady(false)
      stopAll()
      seeded.current = null
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
        const v = videoRef.current!
        v.srcObject = stream
        await v.play()
      } catch (e) {
        if (my !== startGen.current) return
        setError("We couldn't open the camera. Please allow camera access, or ask your helper to turn on the demo recording.")
        console.warn("[rise] camera", e)
        return
      }
      try {
        const sel = await selectTier(videoRef.current!, setStatus)
        if (my !== startGen.current) {
          sel.primary.dispose()
          sel.fallback?.dispose()
          return
        }
        est.current = sel
        setTier(sel.primary.tier)
        setStatus("")
        setReady(true)
        loop()
      } catch (e) {
        if (my !== startGen.current) return
        setError("The body tracker didn't load on this phone. Ask your helper to turn on the demo recording.")
        console.warn("[rise] tiers", e)
      }
    },
    [loop, stopAll],
  )

  /** Seeded tier: replay this patient's frames on the given clock. */
  const startSeeded = useCallback(
    (patient: SeedPatient, clock: () => number) => {
      startGen.current++
      stopAll()
      seeded.current = { frames: seededFrames(patient), clock }
      setTier("seeded")
      setError(null)
      setStatus("")
      setReady(true)
      loop()
    },
    [loop, stopAll],
  )

  const setFrameHandler = useCallback((fn: FrameHandler) => void (onFrame.current = fn), [])
  const setTierHandler = useCallback((fn: (tier: PoseTier, fps: number) => void) => void (tierChange.current = fn), [])

  return { videoRef, canvasRef, setFrameHandler, setTierHandler, tier, status, error, visible, fps, ready, startLive, startSeeded, stop: stopAll }
}
