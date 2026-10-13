import { describe, expect, it } from "vitest"
import raw from "../seed/patients.json"
import { SeedFile } from "../lib/types"
import { StandCounter, type CounterEvent } from "../lib/pose/counter"
import { poseAt, synthSession, type SynthScript } from "../lib/pose/synth"
import { FpsMonitor } from "../lib/pose/select"

const seed = SeedFile.parse(raw)

function run(script: SynthScript, fps = 15) {
  const { frames, startT, endT } = synthSession({ ...script, fps })
  const c = new StandCounter()
  const events: CounterEvent[] = []
  let started = false
  for (const f of frames) {
    if (!started && f.t >= startT) {
      c.start(f.t)
      started = true
    }
    events.push(...c.push(f))
  }
  return { summary: c.finish(endT), events }
}

describe("stand counter", () => {
  it.each(seed.patients.map((p) => [p.rise_id, p] as const))("%s: matches scripted_today", (_id, p) => {
    const t = p.scripted_today
    const { summary } = run({
      stands: t.raw, armsFromRep: t.arms ? t.arms_from_rep : undefined, asymmetryPct: t.asymmetry_pct,
      favoring: t.favoring as "left" | "right" | null, pauses: t.pauses_over_3s_after_standing ?? 0,
    })
    expect(summary.rawStands).toBe(t.raw)
    expect(summary.armsUsed).toBe(t.arms)
    if (t.arms) expect(summary.armsFromRep).toBe(t.arms_from_rep)
    expect(summary.pausesOver3s).toBe(t.pauses_over_3s_after_standing ?? 0)
    expect(Math.abs(summary.asymmetryPct - t.asymmetry_pct)).toBeLessThan(3)
    expect(summary.favoring).toBe(t.favoring)
  })

  it("counts the same at 12 fps (mid-test MediaPipe swap threshold)", () => {
    expect(run({ stands: 10 }, 12).summary.rawStands).toBe(10)
  })

  it("ignores a seated leg kick (knee opens, hip stays down)", () => {
    const c = new StandCounter()
    const seated = poseAt(0)
    c.push({ t: 0, kp: seated })
    c.start(100)
    for (let t = 100; t < 3000; t += 66) {
      const kp = poseAt(0).map((k) => [...k]) as typeof seated
      kp[15] = [0.85, 0.66, 0.95] // ankle swung forward, leg straight, hip unchanged
      c.push({ t, kp })
    }
    expect(c.finish(3000).rawStands).toBe(0)
  })

  it("applies the CDC half-way rule at 30 s", () => {
    const c = new StandCounter()
    c.push({ t: 0, kp: poseAt(0) })
    c.start(0)
    for (let t = 0; t <= 30_000; t += 66) c.push({ t, kp: poseAt(t > 29_000 ? 0.65 : 0) })
    const s = c.finish(30_000)
    expect(s.rawStands).toBe(1)
    expect(s.reps[0].partial).toBe(true)
  })

  it("does not count a half rise when the patient finishes early", () => {
    const c = new StandCounter()
    c.push({ t: 0, kp: poseAt(0) })
    c.start(0)
    for (let t = 0; t <= 12_000; t += 66) c.push({ t, kp: poseAt(t > 11_000 ? 0.65 : 0) })
    expect(c.finish(12_000).rawStands).toBe(0)
  })

  it("emits one no_stand stop after 8 s seated, and again only after resume", () => {
    const c = new StandCounter()
    c.push({ t: 0, kp: poseAt(0) })
    c.start(0)
    const stops: number[] = []
    for (let t = 0; t <= 20_000; t += 100) {
      if (t === 12_000) c.resume(t)
      for (const e of c.push({ t, kp: poseAt(0) })) if (e.type === "no_stand") stops.push(e.t)
    }
    expect(stops).toEqual([8100, 20_100].filter((x) => x <= 20_000))
  })

  it("flags arm use once per rep and keeps the raw count", () => {
    const { summary, events } = run({ stands: 6, armsFromRep: 1 })
    expect(summary.rawStands).toBe(6)
    expect(summary.reps.every((r) => r.armsUsed)).toBe(true)
    expect(events.filter((e) => e.type === "arm_use")).toHaveLength(6)
  })
})


describe("fps monitor (mid-test swap)", () => {
  const feed = (m: FpsMonitor, fps: number, fromMs: number, toMs: number) => {
    let tripAt: number | null = null
    for (let t = fromMs; t < toMs; t += 1000 / fps) if (m.frame(t) && tripAt === null) tripAt = t
    return tripAt
  }
  it("stays on YOLO at 16 fps", () => {
    expect(feed(new FpsMonitor(12, 2), 16, 0, 10_000)).toBeNull()
  })
  it("trips after 2 s under 12 fps, once", () => {
    const m = new FpsMonitor(12, 2)
    feed(m, 16, 0, 3000)
    const at = feed(m, 9, 3000, 9000)
    expect(at).not.toBeNull()
    expect(at!).toBeGreaterThanOrEqual(5000)
    expect(at!).toBeLessThan(6500)
    expect(feed(m, 5, 9000, 12_000)).toBeNull()
  })
})
