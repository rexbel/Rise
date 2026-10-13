/**
 * Rolling buffer of recent camera frames for a Cosmos second look. While running, grabs the live video every
 * `intervalMs` onto a small canvas (longest side `maxSide`) as JPEG and keeps the last `keepMs`. Client-only.
 * Frames stay in memory on the device until an event sends a few of them.
 */
export interface RingFrame {
  t: number
  dataUrl: string
}

export class FrameRing {
  private frames: RingFrame[] = []
  private timer: number | null = null
  private canvas: HTMLCanvasElement | null = null

  constructor(private opts = { intervalMs: 250, keepMs: 2500, maxSide: 448, quality: 0.7 }) {}

  start(video: HTMLVideoElement) {
    this.stop()
    this.canvas ??= document.createElement("canvas")
    this.timer = window.setInterval(() => this.grab(video), this.opts.intervalMs)
  }

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer)
    this.timer = null
    this.frames = []
  }

  get running() {
    return this.timer !== null
  }

  /** Up to `n` frames spread evenly over the last `windowMs`, oldest first. */
  pick(n: number, windowMs: number, now = performance.now()): { frames: string[]; spanMs: number } {
    const recent = this.frames.filter((f) => f.t >= now - windowMs)
    if (!recent.length) return { frames: [], spanMs: 0 }
    const picked =
      recent.length <= n ? recent : Array.from({ length: n }, (_, i) => recent[Math.round((i * (recent.length - 1)) / (n - 1))])
    return { frames: picked.map((f) => f.dataUrl), spanMs: Math.round(picked[picked.length - 1].t - picked[0].t) }
  }

  private grab(video: HTMLVideoElement) {
    const c = this.canvas
    if (!c || !video.videoWidth || video.readyState < 2) return
    const scale = Math.min(1, this.opts.maxSide / Math.max(video.videoWidth, video.videoHeight))
    c.width = Math.round(video.videoWidth * scale)
    c.height = Math.round(video.videoHeight * scale)
    c.getContext("2d")?.drawImage(video, 0, 0, c.width, c.height)
    const now = performance.now()
    this.frames.push({ t: now, dataUrl: c.toDataURL("image/jpeg", this.opts.quality) })
    while (this.frames.length && this.frames[0].t < now - this.opts.keepMs) this.frames.shift()
  }
}
