import { beforeEach, describe, expect, it } from "vitest"
import {
  apiErrorMessage,
  backoffMs,
  boardOrder,
  buildPatientLink,
  downgradeOptions,
  finalRecommendation,
  latestByPatient,
  recommendationWithRoute,
  sessionTone,
  statusText,
} from "../components/clinic/format"
import * as server from "../lib/sessions"
import { getPatient, scriptedResult } from "../lib/seed"
import type { Recommendation, SessionSnapshot } from "../lib/types"

beforeEach(() => server.resetSessions())

describe("patient link", () => {
  it("prefixes the origin and appends demo=1 to an existing query", () => {
    expect(buildPatientLink("https://rise.example", "/play/rise-01?s=rise-01-abc123", false)).toBe(
      "https://rise.example/play/rise-01?s=rise-01-abc123",
    )
    expect(buildPatientLink("https://rise.example/", "/play/rise-01?s=rise-01-abc123", true)).toBe(
      "https://rise.example/play/rise-01?s=rise-01-abc123&demo=1",
    )
    expect(buildPatientLink("http://localhost:3000", "/p/rise-02", true)).toBe("http://localhost:3000/p/rise-02?demo=1")
  })
})

describe("status words", () => {
  it("carries the live count in words, in the unit of the surface", () => {
    expect(statusText({ status: "testing", count: 4, surface: "classic" })).toBe("Testing · 4 stands")
    expect(statusText({ status: "testing", count: 1, surface: "play" })).toBe("Testing · 1 rep")
    expect(statusText({ status: "needs_confirmation", count: 0, surface: "play" })).toBe("Needs confirmation")
  })

  it("writes the route in words", () => {
    expect(recommendationWithRoute("escalate_urgent", "surgeon_on_call")).toBe("Escalate urgent → surgeon on call")
    expect(recommendationWithRoute("continue_plan", null)).toBe("Continue plan")
  })
})

describe("decision semantics match the server", () => {
  it("finalRecommendation mirrors lib/sessions.ts through a real approve/downgrade", () => {
    const ellen = getPatient("rise-01")!
    const { sessionId } = server.invite("rise-01", "classic", "Demo coordinator", 1000)
    server.applyResult(sessionId, scriptedResult(ellen, { sessionId }), 2000)
    let snap = server.getSession(sessionId)!
    expect(finalRecommendation(snap)).toBe(server.finalRecommendation(snap))
    expect(finalRecommendation(snap)).toBe("escalate_urgent")

    snap = server.approve(sessionId, { action: "downgrade", to: "nurse_callback", reasonCode: "spoke_with_patient", user: "Demo coordinator" }, 3000)
    expect(finalRecommendation(snap)).toBe("nurse_callback")
    expect(finalRecommendation(snap)).toBe(server.finalRecommendation(snap))
    // The rules' original stays on the card for provenance.
    expect(snap.card!.recommendation).toBe("escalate_urgent")
    expect(sessionTone(snap)).toBe("callback")
  })

  it("offers only downgrades the server accepts", () => {
    const all: Recommendation[] = ["escalate_urgent", "nurse_callback", "human_confirm", "continue_plan"]
    for (const from of all) {
      for (const to of downgradeOptions(from)) {
        const ellen = getPatient("rise-01")!
        const { sessionId } = server.invite("rise-01", "classic")
        server.applyResult(sessionId, scriptedResult(ellen, { sessionId }))
        // Force the card to the "from" recommendation to probe the server's rule.
        const s = server.getSession(sessionId)!
        s.card!.recommendation = from
        expect(() => server.approve(sessionId, { action: "downgrade", to, reasonCode: "known_finding", user: "t" })).not.toThrow()
      }
    }
    expect(downgradeOptions("escalate_urgent")).toEqual(["nurse_callback", "continue_plan"])
    expect(downgradeOptions("human_confirm")).toEqual(["continue_plan"])
    expect(downgradeOptions("continue_plan")).toEqual([])
  })
})

describe("board helpers", () => {
  const snap = (id: string, riseId: string, invitedAt: number | null, updatedAt: number): SessionSnapshot => ({
    sessionId: id,
    riseId,
    surface: "play",
    status: "invited",
    crewPaused: false,
    count: 0,
    armsUsed: false,
    tier: null,
    audit: [],
    invitedAt,
    updatedAt,
    demoData: false,
  })

  it("keeps tiles in invite order while counts tick", () => {
    const a = snap("rise-01-aaaa", "rise-01", 100, 900)
    const b = snap("rise-02-bbbb", "rise-02", 200, 300)
    expect(boardOrder([a, b]).map((s) => s.sessionId)).toEqual(["rise-02-bbbb", "rise-01-aaaa"])
  })

  it("picks the newest session per patient", () => {
    const old = snap("rise-01-aaaa", "rise-01", 100, 100)
    const fresh = snap("rise-01-bbbb", "rise-01", 500, 500)
    expect(latestByPatient([fresh, old]).get("rise-01")?.sessionId).toBe("rise-01-bbbb")
  })

  it("backs off 1 s, 2 s, 4 s and caps at 30 s", () => {
    expect([0, 1, 2, 10].map(backoffMs)).toEqual([1000, 2000, 4000, 30_000])
  })

  it("turns API errors into a next step", () => {
    expect(apiErrorMessage(409, { error: "already decided" })).toMatch(/already decided/)
    expect(apiErrorMessage(404, { error: "unknown session" })).toMatch(/send a new check-in/)
    expect(apiErrorMessage(400, { error: "this reason needs a note" })).toMatch(/needs a note/)
  })
})
