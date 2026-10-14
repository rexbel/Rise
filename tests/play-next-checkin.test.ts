import { describe, expect, it } from "vitest"
import { fetchNextCheckIn, NEXT_PAUSED_LABEL, patientNextCheckInLabel } from "@/lib/play/playerHome"
import type { NextCheckIn } from "@/lib/types"

const now = new Date(2026, 9, 14, 9, 0).getTime()
const due = (days: number) => new Date(2026, 9, 14 + days).getTime()

const sample: NextCheckIn = {
  inDays: 2,
  dueOn: due(2),
  phase: "Episode days 0-14, day 8",
  reason: "Recheck within 2 days of the nurse callback",
  paused: false,
  source: "session",
}

function respond(status: number, body: unknown) {
  return async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

describe("patient next check-in label", () => {
  it("uses plain day words and counts from the due day", () => {
    expect(patientNextCheckInLabel(sample, now)).toBe("In 2 days")
    expect(patientNextCheckInLabel({ ...sample, dueOn: due(1) }, now)).toBe("Tomorrow")
    expect(patientNextCheckInLabel({ ...sample, dueOn: due(-2) }, now)).toBe("Today")
    expect(patientNextCheckInLabel({ ...sample, dueOn: null, inDays: 3 }, now)).toBe("In 3 days")
  })

  it("says the care team will let them know when paused, with no numbers", () => {
    const label = patientNextCheckInLabel({ paused: true, inDays: null, dueOn: null }, now)
    expect(label).toBe(NEXT_PAUSED_LABEL)
    expect(label).not.toMatch(/\d/)
    expect(label).not.toMatch(/STEADI|score|below average|urgent/i)
  })
})

describe("fetchNextCheckIn", () => {
  it("returns only the day from the API (no reason, phase, or source reach the patient)", async () => {
    const nc = await fetchNextCheckIn("rise-03", { fetchImpl: respond(200, { riseId: "rise-03", nextCheckIn: sample }) })
    expect(nc).toEqual({ inDays: sample.inDays, dueOn: sample.dueOn, paused: sample.paused })
  })

  it("throws on an error status, a bad shape, or another patient's data, so the neutral line shows instead", async () => {
    await expect(fetchNextCheckIn("rise-03", { fetchImpl: respond(404, { error: "unknown patient" }) })).rejects.toThrow()
    await expect(fetchNextCheckIn("rise-03", { fetchImpl: respond(200, { riseId: "rise-03" }) })).rejects.toThrow()
    await expect(
      fetchNextCheckIn("rise-03", { fetchImpl: respond(200, { riseId: "rise-04", nextCheckIn: sample }) }),
    ).rejects.toThrow()
  })
})
