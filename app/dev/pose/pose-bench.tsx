"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import protocol from "@/config/protocol.default.json"
import type { PoseEstimator } from "@/lib/pose"
import type { Keypoints17 } from "@/lib/types"

type Variant = "yolo-webgpu" | "yolo-wasm" | "mediapipe"
const VARIANTS: { id: Variant; label: string }[] = [
  { id: "yolo-webgpu", label: "YOLO · WebGPU" },
  { id: "yolo-wasm", label: "YOLO · WASM" },
  { id: "mediapipe", label: "MediaPipe" },
]

interface BenchRow {
  variant: Variant
  backend: string
  loadMs: number
  fps: number
  medianMs: number
  detectedPct: number
  error?: string
}

const { yolo_keep_min_fps: KEEP_FPS, benchmark_s: BENCH_S } = protocol.pose

/** COCO skeleton edges for the overlay. */
const EDGES: [number, number][] = [
  [5, 6], [5, 7], [7, 9], [6, 8], [8, 10], [5, 11], [6, 12], [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [0, 5], [0, 6],
]

async function makeEstimator(v: Variant): Promise<{ est: PoseEstimator; backend: () => string }> {
  if (v === "mediapipe") {
    const { MediaPipeEstimator } = await import("@/lib/pose/mediapipe")
    const est = new MediaPipeEstimator()
    return { est, backend: () => `mediapipe/${est.delegate ?? "?"}` }
  }
  const { YoloOnnxEstimator } = await import("@/lib/pose/yolo-onnx")
  const est = new YoloOnnxEstimator(v === "yolo-webgpu" ? "webgpu" : "wasm")
  return { est, backend: () => `onnx/${est.backend ?? "?"}` }
}

function drawSkeleton(canvas: HTMLCanvasElement, video: HTMLVideoElement, kp: Keypoints17 | null) {
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  canvas.width = video.clientWidth
  canvas.height = video.clientHeight
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (!kp) return
  const w = canvas.width, h = canvas.height
  ctx.lineWidth = 4
  ctx.strokeStyle = "#22c55e"
  for (const [a, b] of EDGES) {
    if (kp[a][2] < 0.3 || kp[b][2] < 0.3) continue
    ctx.beginPath()
    ctx.moveTo(kp[a][0] * w, kp[a][1] * h)
    ctx.lineTo(kp[b][0] * w, kp[b][1] * h)
    ctx.stroke()
  }
  ctx.fillStyle = "#f97316"
  for (const [x, y, c] of kp) if (c >= 0.3) ctx.fillRect(x * w - 4, y * h - 4, 8, 8)
}

function median(xs: number[]) {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

export function PoseBench() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const runRef = useRef(0)
  const [facing, setFacing] = useState<"environment" | "user">("environment")
  const [cameraOn, setCameraOn] = useState(false)
  const [live, setLive] = useState<{ variant: Variant; backend: string; fps: number; ms: number } | null>(null)
  const [rows, setRows] = useState<BenchRow[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const startCamera = useCallback(async () => {
    setError(null)
    try {
      const old = videoRef.current?.srcObject as MediaStream | null
      old?.getTracks().forEach((t) => t.stop())
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
      const v = videoRef.current!
      v.srcObject = stream
      await v.play()
      setCameraOn(true)
    } catch (e) {
      setError(`Camera failed: ${(e as Error).message}. The page must be on HTTPS (use the tunnel URL) and camera permission allowed.`)
    }
  }, [facing])

  useEffect(() => () => {
    runRef.current++
    ;(videoRef.current?.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop())
  }, [])

  /** Runs one estimator for `seconds`, drawing the skeleton; returns timing stats. */
  const runFor = useCallback(async (variant: Variant, seconds: number, onTick?: (fps: number, ms: number, backend: string) => void): Promise<BenchRow> => {
    const run = ++runRef.current
    const video = videoRef.current!, canvas = canvasRef.current!
    const t0 = performance.now()
    let made: Awaited<ReturnType<typeof makeEstimator>>
    try {
      made = await makeEstimator(variant)
      await made.est.load()
    } catch (e) {
      return { variant, backend: "-", loadMs: 0, fps: 0, medianMs: 0, detectedPct: 0, error: (e as Error).message }
    }
    const loadMs = performance.now() - t0
    const { est, backend } = made
    // Warm up so shader/JIT compile time doesn't count against fps.
    const warmEnd = performance.now() + 500
    while (performance.now() < warmEnd && run === runRef.current) await est.estimate(video)

    const times: number[] = []
    const stamps: number[] = []
    let detected = 0
    const end = performance.now() + seconds * 1000
    while (performance.now() < end && run === runRef.current) {
      const a = performance.now()
      const kp = await est.estimate(video)
      const b = performance.now()
      times.push(b - a)
      stamps.push(b)
      if (kp) detected++
      drawSkeleton(canvas, video, kp)
      while (stamps.length && stamps[0] < b - 1000) stamps.shift()
      onTick?.(stamps.length, b - a, backend())
      await new Promise((r) => requestAnimationFrame(r))
    }
    est.dispose()
    const elapsed = (performance.now() - (end - seconds * 1000)) / 1000
    return { variant, backend: backend(), loadMs: Math.round(loadMs), fps: +(times.length / elapsed).toFixed(1), medianMs: +median(times).toFixed(1), detectedPct: times.length ? Math.round((100 * detected) / times.length) : 0 }
  }, [])

  const runBenchmark = useCallback(async () => {
    setRows([])
    for (const { id, label } of VARIANTS) {
      setBusy(`Benchmarking ${label} for ${BENCH_S} s…`)
      const row = await runFor(id, BENCH_S, (fps, ms, backend) => setLive({ variant: id, backend, fps, ms }))
      setRows((r) => [...r, row])
    }
    setBusy(null)
    setLive(null)
  }, [runFor])

  const runLive = useCallback(async (variant: Variant) => {
    setBusy(`Live: ${variant} (press Stop to end)`)
    await runFor(variant, 3600, (fps, ms, backend) => setLive({ variant, backend, fps, ms }))
    setBusy(null)
  }, [runFor])

  const stop = () => { runRef.current++; setBusy(null); setLive(null) }

  const verdict = (r: BenchRow) =>
    r.error ? "Failed" : r.variant === "mediapipe" ? "Fallback tier" : r.fps >= KEEP_FPS ? `Keep (≥ ${KEEP_FPS} fps)` : `Drop to MediaPipe (< ${KEEP_FPS} fps)`

  const report = () => JSON.stringify({ at: new Date().toISOString(), userAgent: navigator.userAgent, webgpu: "gpu" in navigator, rows }, null, 2)

  return (
    <div className="flex flex-col gap-4">
      <div className="relative w-full overflow-hidden rounded-lg bg-black">
        <video ref={videoRef} playsInline muted className="block w-full" />
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
        {live && (
          <div className="absolute left-2 top-2 flex flex-col gap-1">
            <Badge>{live.backend}</Badge>
            <Badge variant="secondary">{live.fps} fps · {live.ms.toFixed(0)} ms</Badge>
          </div>
        )}
      </div>

      {error && <p role="alert" className="text-destructive">{error}</p>}
      {busy && <p aria-live="polite" className="text-muted-foreground">{busy}</p>}

      <div className="flex flex-wrap gap-2">
        <Button size="lg" variant="outline" onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))} disabled={!!busy}>
          Camera: {facing === "user" ? "front" : "back"}
        </Button>
        <Button size="lg" onClick={startCamera} disabled={!!busy}>{cameraOn ? "Restart camera" : "Start camera"}</Button>
        <Button size="lg" onClick={runBenchmark} disabled={!cameraOn || !!busy}>Run benchmark</Button>
        {busy && <Button size="lg" variant="destructive" onClick={stop}>Stop</Button>}
      </div>
      <div className="flex flex-wrap gap-2">
        {VARIANTS.map((v) => (
          <Button key={v.id} variant="secondary" onClick={() => runLive(v.id)} disabled={!cameraOn || !!busy}>Live: {v.label}</Button>
        ))}
      </div>

      {rows.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Results ({BENCH_S} s each)</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tier</TableHead><TableHead>FPS</TableHead><TableHead>Median ms</TableHead>
                  <TableHead>Load ms</TableHead><TableHead>Person seen</TableHead><TableHead>Verdict</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.variant}>
                    <TableCell>{r.backend}</TableCell>
                    <TableCell>{r.fps}</TableCell>
                    <TableCell>{r.medianMs}</TableCell>
                    <TableCell>{r.loadMs}</TableCell>
                    <TableCell>{r.detectedPct}%</TableCell>
                    <TableCell title={r.error}>{verdict(r)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Button variant="outline" onClick={() => navigator.clipboard.writeText(report())}>Copy results as JSON</Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
