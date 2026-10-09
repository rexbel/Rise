"use client"

/**
 * Camera + YOLO/MediaPipe for Keep the Line. Emits play-shaped PoseFrames.
 * Falls back to null frames if the camera or estimators fail (caller may use synthetic).
 */

import { useCallback, useEffect, useRef, useState } from "react"
import type { PoseEstimator } from "@/lib/pose"
import { FpsMonitor, selectTier } from "@/lib/pose/select"
import { clientLog } from "@/lib/play/clientLog"
import { toPlayKeypoints } from "@/lib/play/keypointsAdapt"
import type { PoseFrame } from "@/lib/play/types"

export type PlayCameraStatus = "idle" | "requesting" | "loading" | "live" | "error"

export function usePlayCamera(onFrame: (frame: PoseFrame) => void) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const onFrameRef = useRef(onFrame)
  onFrameRef.current = onFrame
  const estRef = useRef<{ primary: PoseEstimator; fallback: PoseEstimator | null } | null>(null)
  const loopId = useRef(0)
  /** Bumped by every start/stop so a slower earlier start cannot take over (Strict Mode). */
  const startGen = useRef(0)
  const t0 = useRef(0)
  const pauseAccum = useRef(0)
  const pauseAt = useRef(0)
  const pausedRef = useRef(false)
  const facingRef = useRef<"user" | "environment">("user")
  const [status, setStatus] = useState<PlayCameraStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const [tier, setTier] = useState<string | null>(null)
  const [fps, setFps] = useState(0)

  const gameMs = useCallback(() => {
    const now = performance.now()
    const frozen = pausedRef.current ? now - pauseAt.current : 0
    return now - t0.current - pauseAccum.current - frozen
  }, [])

  const stopAll = useCallback(() => {
    loopId.current++
    startGen.current++
    ;(videoRef.current?.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop())
    if (videoRef.current) videoRef.current.srcObject = null
    estRef.current?.primary.dispose()
    estRef.current?.fallback?.dispose()
    estRef.current = null
    pausedRef.current = false
    pauseAccum.current = 0
    setStatus("idle")
  }, [])

  useEffect(() => () => stopAll(), [stopAll])

  const pause = useCallback(() => {
    if (pausedRef.current) return
    pausedRef.current = true
    pauseAt.current = performance.now()
  }, [])

  const resume = useCallback(() => {
    if (!pausedRef.current) return
    pauseAccum.current += performance.now() - pauseAt.current
    pausedRef.current = false
  }, [])

  const start = useCallback(
    async (facing: "user" | "environment" = "user"): Promise<"live" | "cancelled" | "error"> => {
      const my = ++startGen.current
      loopId.current++
      ;(videoRef.current?.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop())
      estRef.current?.primary.dispose()
      estRef.current?.fallback?.dispose()
      estRef.current = null
      pausedRef.current = false
      pauseAccum.current = 0

      setError(null)
      setStatus("requesting")
      facingRef.current = facing
      const video = videoRef.current
      if (!video) {
        setError("Video element missing")
        setStatus("error")
        return "error"
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        })
        if (my !== startGen.current) {
          stream.getTracks().forEach((t) => t.stop())
          return "cancelled"
        }
        video.srcObject = stream
        video.playsInline = true
        video.muted = true
        await video.play()
      } catch (e) {
        if (my !== startGen.current) return "cancelled"
        const msg = String(e)
        // Strict Mode remount aborts play(); treat as cancelled, not a user-facing failure.
        if (msg.includes("AbortError")) {
          clientLog("warn", "camera play aborted (likely remount)", msg)
          return "cancelled"
        }
        clientLog("error", "camera getUserMedia failed", msg)
        setError("Camera permission needed to see yourself in the game.")
        setStatus("error")
        return "error"
      }

      if (my !== startGen.current) return "cancelled"
      setStatus("loading")
      try {
        const sel = await selectTier(video)
        if (my !== startGen.current) {
          sel.primary.dispose()
          sel.fallback?.dispose()
          return "cancelled"
        }
        estRef.current = sel
        setTier(sel.primary.tier)
        clientLog("info", "pose tier ready", { tier: sel.primary.tier, benchFps: sel.benchFps })
        setStatus("live")
        t0.current = performance.now()
        pauseAccum.current = 0
        pausedRef.current = false
        const id = ++loopId.current
        const monitor = new FpsMonitor()
        let fpsShown = 0
        let estimateErrors = 0
        const tick = async () => {
          if (id !== loopId.current || !estRef.current || !videoRef.current) return
          try {
            const kp = await estRef.current.primary.estimate(videoRef.current)
            const now = performance.now()
            if (monitor.frame(now) && estRef.current.primary.tier === "yolo-onnx" && estRef.current.fallback) {
              estRef.current.primary.dispose()
              estRef.current = { primary: estRef.current.fallback, fallback: null }
              setTier("mediapipe")
              clientLog("warn", "swapped to mediapipe (low fps)", { fps: monitor.fps })
            }
            if (monitor.fps !== fpsShown) setFps((fpsShown = monitor.fps))
            const mirrorX = facingRef.current === "user"
            onFrameRef.current({ t: gameMs(), keypoints: toPlayKeypoints(kp, mirrorX) })
          } catch (e) {
            estimateErrors += 1
            if (estimateErrors <= 3 || estimateErrors % 30 === 0) {
              clientLog("error", "pose estimate failed", { n: estimateErrors, err: String(e) })
            }
          }
          requestAnimationFrame(() => void tick())
        }
        void tick()
        return "live"
      } catch (e) {
        if (my !== startGen.current) return "cancelled"
        clientLog("error", "pose selectTier failed", String(e))
        setError("Body tracker did not load. Using demo replay.")
        setStatus("error")
        return "error"
      }
    },
    [gameMs],
  )

  return { videoRef, start, stop: stopAll, pause, resume, status, error, tier, fps }
}
