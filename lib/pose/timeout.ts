/**
 * Every external call has a timeout (AGENTS.md). Camera permission and model downloads can hang (a dismissed prompt,
 * a slow network), which would leave a real patient on "Turning on the camera…" with no way forward. On timeout this
 * rejects, and whatever the original call resolves to later is handed to `onLate` to clean up (stop the camera
 * tracks, dispose the tracker).
 */
export class StartTimeout extends Error {
  constructor(label: string) {
    super(`${label} timed out`)
    this.name = "StartTimeout"
  }
}

export const CAMERA_TIMEOUT_MS = 30_000
export const TRACKER_TIMEOUT_MS = 45_000

export function withTimeout<T>(p: Promise<T>, ms: number, label: string, onLate?: (value: T) => void): Promise<T> {
  let timedOut = false
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => {
      timedOut = true
      reject(new StartTimeout(label))
    }, ms)
    p.then(
      (v) => {
        clearTimeout(id)
        if (timedOut) onLate?.(v)
        else resolve(v)
      },
      (e) => {
        clearTimeout(id)
        if (!timedOut) reject(e)
      },
    )
  })
}
