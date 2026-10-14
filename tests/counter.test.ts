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

  // Filmed from the front: crossed hands rest by the opposite shoulders, ~0.6 torso lengths from the shoulder midpoint.
  // The seated lead-in sets the arm line, so a crossed-arms rise is clean and a push-off still counts.
  const frontOn = (reach: (s: number, rep: number) => number) => {
    const c = new StandCounter()
    const at = (s: number, rep: number) => {
      const kp = poseAt(s).map((k) => [...k]) as ReturnType<typeof poseAt>
      const sh = [(kp[5][0] + kp[6][0]) / 2, (kp[5][1] + kp[6][1]) / 2]
      const torso = Math.hypot(sh[0] - (kp[11][0] + kp[12][0]) / 2, sh[1] - (kp[11][1] + kp[12][1]) / 2)
      const r = reach(s, rep) * torso
      kp[9] = [sh[0] - r, sh[1], 0.95]
      kp[10] = [sh[0] + r * 0.9, sh[1], 0.95]
      return kp
    }
    for (let t = 0; t < 1000; t += 66) c.push({ t, kp: at(0, 1) })
    c.start(1000)
    let t = 1000
    for (let rep = 1; rep <= 3; rep++) {
      for (let i = 0; i <= 40; i++, t += 66) c.push({ t, kp: at(Math.sin((i / 40) * Math.PI), rep) })
    }
    return c.finish(30_000)
  }

  it("front-on, arms crossed: a forward lean of the crossed arms is not arm use", () => {
    const s = frontOn((s) => 0.6 + 0.3 * s)
    expect(s.rawStands).toBe(3)
    expect(s.armsUsed).toBe(false)
  })

  it("front-on: pushing off the thighs from rep 2 is still arm use", () => {
    const s = frontOn((s, rep) => (rep >= 2 && s > 0.05 && s < 0.95 ? 1.5 : 0.6))
    expect(s.rawStands).toBe(3)
    expect(s.armsFromRep).toBe(2)
  })

  it("hands already on the thighs at Go: the capped arm line still catches the push-off", () => {
    const s = frontOn((s) => (s > 0.05 && s < 0.95 ? 1.3 : 1.0))
    expect(s.armsFromRep).toBe(1)
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
