import { describe, expect, it, vi } from "vitest"
import { StartTimeout, withTimeout } from "../lib/pose/timeout"

describe("camera and tracker start timeouts", () => {
  it("rejects a start that hangs, and hands a late result to the clean-up", async () => {
    vi.useFakeTimers()
    let resolveLate!: (v: string) => void
    const late = new Promise<string>((r) => (resolveLate = r))
    const cleaned: string[] = []
    const p = withTimeout(late, 1000, "camera", (v) => cleaned.push(v))
    vi.advanceTimersByTime(1000)
    await expect(p).rejects.toBeInstanceOf(StartTimeout)
    resolveLate("stream")
    await Promise.resolve()
    await Promise.resolve()
    expect(cleaned).toEqual(["stream"])
    vi.useRealTimers()
  })

  it("passes a timely result and a timely error straight through", async () => {
    await expect(withTimeout(Promise.resolve(1), 1000, "x")).resolves.toBe(1)
    await expect(withTimeout(Promise.reject(new Error("denied")), 1000, "x")).rejects.toThrow("denied")
  })
})
