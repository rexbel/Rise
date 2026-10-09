import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { StandCounter } from "../lib/pose/counter"
import { FIXTURE_TARGETS, type Fixture } from "../lib/pose/seeded"

/** Every committed fixture must replay through the counter to its expected result (fixtures/README.md). */
const present = FIXTURE_TARGETS.map((t) => ({ t, file: path.join("public", "fixtures", `${t.file}.json`) })).filter((x) => existsSync(x.file))

describe.skipIf(present.length === 0)("recorded fixtures", () => {
  it.each(present.map((x) => [x.t.file, x.file] as const))("%s replays to its expected counts", (_name, file) => {
    const fx = JSON.parse(readFileSync(file, "utf8")) as Fixture
    const c = new StandCounter()
    let started = false
    for (const f of fx.frames) {
      if (!started && f.t_ms >= 0) {
        c.start(f.t_ms)
        started = true
      }
      c.push({ t: f.t_ms, kp: f.keypoints })
    }
    const s = c.finish(30_000)
    expect(s.rawStands).toBe(fx.expected.rawStands)
    expect(s.armsUsed).toBe(fx.expected.armsUsed)
    if (fx.expected.armsFromRep) expect(s.armsFromRep).toBe(fx.expected.armsFromRep)
    if (fx.expected.asymmetryPct) expect(s.asymmetryPct).toBeGreaterThanOrEqual(fx.expected.asymmetryPct)
  })
})
