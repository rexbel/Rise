"use client"

/**
 * Camera + YOLO/MediaPipe for Keep the Line. Emits play-shaped PoseFrames.
 * Falls back to null frames if the camera or estimators fail (caller may use synthetic).
 */

import { useCallback, useEffect, useRef, useState } from "react"
import type { PoseEstimator } from "@/lib/pose"
import { FpsMonitor, selectTier } from "@/lib/pose/select"
import { toPlayKeypoints } from "@/lib/play/keypointsAdapt"
import type { PoseFrame } from "@/lib/play/types"

export type PlayCameraStatus = "idle" | "requesting" | "loading" | "live" | "error"

export function usePlayCamera(onFrame: (frame: PoseFrame) => void) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const onFrameRef = useRef(onFrame)
  onFrameRef.current = onFrame
  const estRef = useRef<{ primary: PoseEstimator; fallback: PoseEstimator | null } | null>(null)
  const loopId = useRef(0)
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

  const stop = useCallback(() => {
    loopId.current++
    ;(videoRef.current?.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop())
    if (videoRef.current) videoRef.current.srcObject = null
    estRef.current?.primary.dispose()
    estRef.current?.fallback?.dispose()
    estRef.current = null
    pausedRef.current = false
    pauseAccum.current = 0
    setStatus("idle")
  }, [])

  useEffect(() => () => stop(), [stop])

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
    async (facing: "user" | "environment" = "user") => {
      stop()
      setError(null)
      setStatus("requesting")
      facingRef.current = facing
      const video = videoRef.current
      if (!video) {
        setError("Video element missing")
        setStatus("error")
        return false
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        })
        video.srcObject = stream
        video.playsInline = true
        video.muted = true
        await video.play()
      } catch (e) {
        console.warn("[play] camera", e)
        setError("Camera permission needed to see yourself in the game.")
        setStatus("error")
        return false
      }

      setStatus("loading")
      try {
        const sel = await selectTier(video)
        estRef.current = sel
        setTier(sel.primary.tier)
        setStatus("live")
        t0.current = performance.now()
        pauseAccum.current = 0
        pausedRef.current = false
        const id = ++loopId.current
        const monitor = new FpsMonitor()
        let fpsShown = 0
        const tick = async () => {
          if (id !== loopId.current || !estRef.current || !videoRef.current) return
          const kp = await estRef.current.primary.estimate(videoRef.current)
          const now = performance.now()
          if (monitor.frame(now) && estRef.current.primary.tier === "yolo-onnx" && estRef.current.fallback) {
            estRef.current.primary.dispose()
            estRef.current = { primary: estRef.current.fallback, fallback: null }
            setTier("mediapipe")
          }
          if (monitor.fps !== fpsShown) setFps((fpsShown = monitor.fps))
          // Front camera video is CSS-mirrored; flip x so Fruit Ninja FX stick to joints.
          const mirrorX = facingRef.current === "user"
          onFrameRef.current({ t: gameMs(), keypoints: toPlayKeypoints(kp, mirrorX) })
          requestAnimationFrame(() => void tick())
        }
        void tick()
        return true
      } catch (e) {
        console.warn("[play] pose", e)
        setError("Body tracker did not load. Using demo replay.")
        setStatus("error")
        return false
      }
    },
    [stop, gameMs],
  )

  return { videoRef, start, stop, pause, resume, status, error, tier, fps }
}
