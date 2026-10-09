/**
 * Tier 1: Ultralytics nano pose (public/models/pose.onnx, from scripts/export_pose_onnx.py) on onnxruntime-web.
 * WebGPU where the browser has it, WASM otherwise. Client-only: import inside an effect or a "use client" module.
 *
 * Model output is [1, 56, N]: per anchor 4 box values (cx, cy, w, h in input px), 1 person score,
 * then 17 x (x, y, visibility) already decoded to input px / 0..1.
 */
import type { InferenceSession, Tensor } from "onnxruntime-web"
import type { Keypoints17 } from "@/lib/types"
import type { PoseEstimator } from "@/lib/pose"

export type YoloBackend = "webgpu" | "wasm"

const MODEL_URL = "/models/pose.onnx"
const ORT_VERSION = "1.30.0"
const MIN_SCORE = 0.35

export class YoloOnnxEstimator implements PoseEstimator {
  readonly tier = "yolo-onnx" as const
  backend: YoloBackend | null = null
  private session: InferenceSession | null = null
  private ort: typeof import("onnxruntime-web") | null = null
  private canvas: OffscreenCanvas | HTMLCanvasElement | null = null
  private size = 320

  /** `prefer` forces one backend (used by the benchmark); default tries WebGPU then WASM. */
  constructor(private prefer?: YoloBackend) {}

  async load() {
    const probe = await fetch(MODEL_URL, { method: "HEAD" }).catch(() => null)
    if (!probe?.ok) throw new Error(`YOLO model missing at ${MODEL_URL}`)
    const ort = await import("onnxruntime-web/webgpu")
    ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`
    const order: YoloBackend[] = this.prefer ? [this.prefer] : ["webgpu", "wasm"]
    let lastError: unknown
    for (const backend of order) {
      if (backend === "webgpu" && !("gpu" in navigator)) continue
      try {
        this.session = await ort.InferenceSession.create(MODEL_URL, { executionProviders: [backend], graphOptimizationLevel: "all" })
        this.backend = backend
        break
      } catch (e) {
        lastError = e
      }
    }
    if (!this.session) throw lastError ?? new Error("No ONNX backend available")
    this.ort = ort
    const dims = (this.session.inputMetadata[0] as { shape?: (number | string)[] }).shape
    if (dims && typeof dims[2] === "number") this.size = dims[2]
    this.canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(this.size, this.size) : Object.assign(document.createElement("canvas"), { width: this.size, height: this.size })
  }

  async estimate(frame: HTMLVideoElement): Promise<Keypoints17 | null> {
    if (!this.session || !this.ort || !this.canvas || !frame.videoWidth) return null
    const { size } = this
    const vw = frame.videoWidth, vh = frame.videoHeight
    const scale = size / Math.max(vw, vh)
    const dw = vw * scale, dh = vh * scale, padX = (size - dw) / 2, padY = (size - dh) / 2

    const ctx = this.canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D
    ctx.fillStyle = "rgb(114,114,114)"
    ctx.fillRect(0, 0, size, size)
    ctx.drawImage(frame, padX, padY, dw, dh)
    const px = ctx.getImageData(0, 0, size, size).data
    const area = size * size
    const input = new Float32Array(3 * area)
    for (let i = 0; i < area; i++) {
      input[i] = px[i * 4] / 255
      input[i + area] = px[i * 4 + 1] / 255
      input[i + 2 * area] = px[i * 4 + 2] / 255
    }

    const feeds = { [this.session.inputNames[0]]: new this.ort.Tensor("float32", input, [1, 3, size, size]) }
    const out = (await this.session.run(feeds))[this.session.outputNames[0]] as Tensor
    const data = out.data as Float32Array
    const n = out.dims[2]

    // Largest confident person.
    let best = -1, bestArea = 0
    for (let i = 0; i < n; i++) {
      if (data[4 * n + i] < MIN_SCORE) continue
      const a = data[2 * n + i] * data[3 * n + i]
      if (a > bestArea) { bestArea = a; best = i }
    }
    if (best < 0) return null

    const kp: Keypoints17 = []
    for (let k = 0; k < 17; k++) {
      const x = (data[(5 + 3 * k) * n + best] - padX) / dw
      const y = (data[(6 + 3 * k) * n + best] - padY) / dh
      kp.push([x, y, data[(7 + 3 * k) * n + best]])
    }
    return kp
  }

  dispose() {
    void this.session?.release()
    this.session = null
  }
}
