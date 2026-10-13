/**
 * Tier selection (plan §6): a short benchmark on the setup screen keeps YOLO only at >= pose.yolo_keep_min_fps;
 * MediaPipe is always preloaded so a mid-test swap (YOLO under pose.yolo_swap_below_fps for pose.yolo_swap_after_s)
 * costs no pause. If neither loads, the caller falls back to the seeded tier. Client-only.
 */
import protocol from "@/config/protocol.default.json"
import type { PoseEstimator } from "@/lib/pose"

const P = protocol.pose

/** Trips once when fps stays under `belowFps` for `afterS` seconds. Pure, so it is unit-tested. */
export class FpsMonitor {
  private stamps: number[] = []
  private lowSince: number | null = null
  tripped = false

  constructor(private belowFps = P.yolo_swap_below_fps, private afterS = P.yolo_swap_after_s) {}

  /** Record a processed frame at time t (ms). Returns true on the frame that trips the monitor. */
  frame(t: number): boolean {
    this.stamps.push(t)
    while (this.stamps.length && this.stamps[0] <= t - 1000) this.stamps.shift()
    if (this.tripped || t - (this.stamps[0] ?? t) < 0) return false
    const fps = this.stamps.length
    if (fps < this.belowFps) {
      this.lowSince ??= t
      if (t - this.lowSince >= this.afterS * 1000) return (this.tripped = true)
    } else {
      this.lowSince = null
    }
    return false
  }

  get fps() {
    return this.stamps.length
  }
}

/** Frames per second the estimator sustains on this video for `seconds`, after a short warm-up. */
export async function benchmark(est: PoseEstimator, video: HTMLVideoElement, seconds = P.benchmark_s): Promise<number> {
  const warm = performance.now() + 400
  while (performance.now() < warm) await est.estimate(video)
  let n = 0
  const start = performance.now()
  while (performance.now() - start < seconds * 1000) {
    await est.estimate(video)
    n++
  }
  return n / ((performance.now() - start) / 1000)
}

export interface Selection {
  primary: PoseEstimator
  /** Preloaded MediaPipe for a mid-test swap (null if primary already is MediaPipe or it failed to load). */
  fallback: PoseEstimator | null
  benchFps: number | null
}

/** Load MediaPipe in the background, benchmark YOLO, keep the faster-enough one. Throws if nothing loads. */
export async function selectTier(video: HTMLVideoElement, onStatus?: (msg: string) => void): Promise<Selection> {
  const { MediaPipeEstimator } = await import("@/lib/pose/mediapipe")
  const mp = new MediaPipeEstimator()
  const mpReady = mp.load().then(() => mp, () => null)

  onStatus?.("Loading the body tracker…")
  let yolo: PoseEstimator | null = null
  try {
    const { YoloOnnxEstimator } = await import("@/lib/pose/yolo-onnx")
    const y = new YoloOnnxEstimator()
    await y.load()
    yolo = y
  } catch {
    yolo = null
  }

  if (yolo) {
    onStatus?.("Checking your phone's speed…")
    const fps = await benchmark(yolo, video)
    if (fps >= P.yolo_keep_min_fps) return { primary: yolo, fallback: await mpReady, benchFps: Math.round(fps * 10) / 10 }
    yolo.dispose()
    const m = await mpReady
    if (m) return { primary: m, fallback: null, benchFps: Math.round(fps * 10) / 10 }
    throw new Error("No pose tier available")
  }
  const m = await mpReady
  if (m) return { primary: m, fallback: null, benchFps: null }
  throw new Error("No pose tier available")
}
