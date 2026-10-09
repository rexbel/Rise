"use client"

import { useEffect, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { PoseEstimator } from "@/lib/pose"
import { StandCounter, type CounterSummary } from "@/lib/pose/counter"
import { FIXTURE_TARGETS, type Fixture } from "@/lib/pose/seeded"
import type { Keypoints17 } from "@/lib/types"

const LEAD_IN_MS = 1000
const TEST_MS = 30_000

type Source = "camera" | "file"
type Tier = "mediapipe" | "yolo-onnx"

/** Runs the recorded frames through the counter exactly as the seeded tier will. */
function replay(frames: Fixture["frames"]): CounterSummary {
  const c = new StandCounter()
  let started = false
  for (const f of frames) {
    if (!started && f.t_ms >= 0) {
      c.start(f.t_ms)
      started = true
    }
    c.push({ t: f.t_ms, kp: f.keypoints })
  }
  return c.finish(TEST_MS)
}

export function FixtureRecorder() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const est = useRef<PoseEstimator | null>(null)
  const run = useRef(0)
  const [target, setTarget] = useState<(typeof FIXTURE_TARGETS)[number]>(FIXTURE_TARGETS[0])
  const [source, setSource] = useState<Source>("file")
  const [tier, setTier] = useState<Tier>("mediapipe")
  const [fileName, setFileName] = useState<string | null>(null)
  const [state, setState] = useState<string>("")
  const [fixture, setFixture] = useState<Fixture | null>(null)
  const [check, setCheck] = useState<CounterSummary | null>(null)

  useEffect(() => () => {
    run.current++
    est.current?.dispose()
    ;(videoRef.current?.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop())
  }, [])

  const loadTier = async (): Promise<PoseEstimator> => {
    if (est.current?.tier === tier) return est.current
    est.current?.dispose()
    setState(`Loading ${tier}…`)
    const e =
      tier === "mediapipe"
        ? new (await import("@/lib/pose/mediapipe")).MediaPipeEstimator()
        : new (await import("@/lib/pose/yolo-onnx")).YoloOnnxEstimator()
    await e.load()
    est.current = e
    return e
  }

  const openCamera = async () => {
    const v = videoRef.current!
    v.src = ""
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } } })
    v.srcObject = stream
    await v.play()
    setFileName(null)
    setState("Camera on. Sit in the chair, side-on, whole body in frame.")
  }

  const openFile = (f: File) => {
    const v = videoRef.current!
    ;(v.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop())
    v.srcObject = null
    v.src = URL.createObjectURL(f)
    v.muted = true
    setFileName(f.name)
    setState("Clip loaded. Scrub to about 1 s before the first stand starts, then press Record.")
  }

  const record = async () => {
    const my = ++run.current
    setFixture(null)
    setCheck(null)
    const v = videoRef.current!
    const e = await loadTier()
    const frames: Fixture["frames"] = []
    let fps = 0

    if (source === "camera") {
      for (const n of [3, 2, 1]) {
        setState(`Starting in ${n}… (stay seated)`)
        await new Promise((r) => setTimeout(r, 1000))
      }
    } else {
      await v.play()
    }
    setState("Recording… seated lead-in, then 30 s")
    const t0 = performance.now() + LEAD_IN_MS
    while (run.current === my) {
      const now = performance.now()
      const t = Math.round(now - t0)
      if (t > TEST_MS) break
      const kp = await e.estimate(v)
      if (kp) frames.push({ t_ms: t, keypoints: kp.map((p) => p.map((x) => Math.round(x * 1000) / 1000)) as Keypoints17 })
      if (source === "file" && v.ended) break
      await new Promise((r) => requestAnimationFrame(r))
    }
    if (source === "file") v.pause()
    if (run.current !== my) return
    const testFrames = frames.filter((f) => f.t_ms >= 0)
    fps = testFrames.length / (TEST_MS / 1000)

    const fx: Fixture = {
      riseId: target.riseId,
      variant: target.variant,
      tier: e.tier,
      fps: Math.round(fps * 10) / 10,
      recordedAt: new Date().toISOString(),
      source: source === "file" ? `video:${fileName}` : "camera",
      expected: target.expected,
      frames,
    }
    setFixture(fx)
    setCheck(replay(frames))
    setState(`Recorded ${frames.length} frames at ${fx.fps} fps.`)
  }

  const download = () => {
    if (!fixture) return
    const blob = new Blob([JSON.stringify(fixture)], { type: "application/json" })
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${fixture.riseId}-${fixture.variant}.json` })
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const exp = target.expected
  const matches = check && check.rawStands === exp.rawStands && check.armsUsed === exp.armsUsed && (!exp.armsFromRep || check.armsFromRep === exp.armsFromRep)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {FIXTURE_TARGETS.map((t) => (
          <Button key={t.file} variant={t.file === target.file ? "default" : "outline"} onClick={() => setTarget(t)}>{t.file}</Button>
        ))}
      </div>
      <p className="text-muted-foreground">{target.movement}</p>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant={source === "file" ? "default" : "outline"} onClick={() => setSource("file")}>From a clip</Button>
        <Button variant={source === "camera" ? "default" : "outline"} onClick={() => { setSource("camera"); void openCamera() }}>Live camera</Button>
        <Button variant={tier === "mediapipe" ? "secondary" : "ghost"} onClick={() => setTier("mediapipe")}>MediaPipe</Button>
        <Button variant={tier === "yolo-onnx" ? "secondary" : "ghost"} onClick={() => setTier("yolo-onnx")}>YOLO</Button>
      </div>
      {source === "file" && (
        <input type="file" accept="video/*" aria-label="Fallback clip" onChange={(e) => e.target.files?.[0] && openFile(e.target.files[0])} />
      )}

      <video ref={videoRef} playsInline muted controls={source === "file"} className="w-full rounded-lg bg-black" />
      {state && <p aria-live="polite">{state}</p>}

      <div className="flex gap-2">
        <Button size="lg" onClick={() => void record()} disabled={source === "file" && !fileName}>Record fixture</Button>
        <Button size="lg" variant="outline" onClick={() => { run.current++; setState("Stopped.") }}>Stop</Button>
      </div>

      {fixture && check && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {fixture.riseId}-{fixture.variant}
              <Badge variant={matches ? "default" : "destructive"}>{matches ? "Matches expected" : "Does not match"}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p>
              Counter: {check.rawStands} stands, arms {check.armsUsed ? `used from rep ${check.armsFromRep}` : "not used"}, asymmetry {check.asymmetryPct}%
              {check.favoring ? ` favoring ${check.favoring}` : ""}, {check.pausesOver3s} pauses.
            </p>
            <p className="text-muted-foreground">
              Expected: {exp.rawStands} stands, arms {exp.armsUsed ? `from rep ${exp.armsFromRep}` : "not used"}
              {exp.asymmetryPct ? `, asymmetry ≥ ${exp.asymmetryPct}%` : ""}.
            </p>
            <Button onClick={download}>Download {fixture.riseId}-{fixture.variant}.json → put it in public/fixtures/</Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
