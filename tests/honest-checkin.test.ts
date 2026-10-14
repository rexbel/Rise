import { afterEach, describe, expect, it } from "vitest"
import { checkInKind, couldNotCompleteText, setupSummary } from "@/components/clinic/session-facts"
import { failureReason, isRealInvite, isRealPlay, reportCouldNotComplete } from "@/components/play/couldNotComplete"
import lines from "@/content/patient-lines.json"
import voice from "@/content/voice-lines.json"
import { INVITE_HEADER } from "@/lib/types"
import { setInviteToken } from "@/lib/session-client"

afterEach(() => setInviteToken(null))

describe("real invite predicate", () => {
  it("only a console invite for the patient's own camera is real", () => {
    expect(isRealInvite({ demo: false })).toBe(true)
    expect(isRealInvite({ demo: true })).toBe(false)
    expect(isRealInvite(null)).toBe(false)
    expect(isRealInvite(undefined)).toBe(false)
  })

  it("RehabNinja: invited and not demo", () => {
    expect(isRealPlay(true, false)).toBe(true)
    expect(isRealPlay(true, true)).toBe(false)
    // An unlinked visit keeps the replay fallback, demo or not.
    expect(isRealPlay(false, false)).toBe(false)
  })
})

describe("failure reason", () => {
  const stream = (...states: string[]) => ({ getVideoTracks: () => states.map((readyState) => ({ readyState })) })

  it("no stream or no live track means the camera did not open", () => {
    expect(failureReason(null)).toBe("camera")
    expect(failureReason(undefined)).toBe("camera")
    expect(failureReason(stream())).toBe("camera")
    expect(failureReason(stream("ended"))).toBe("camera")
  })

  it("a live camera track means the body tracker is what failed", () => {
    expect(failureReason(stream("live"))).toBe("tracker")
    expect(failureReason(stream("ended", "live"))).toBe("tracker")
  })
})

describe("reportCouldNotComplete", () => {
  type Call = { url: string; init: RequestInit }
  const fakeFetch = (statuses: (number | "throw")[]) => {
    const calls: Call[] = []
    const impl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      const s = statuses[Math.min(calls.length - 1, statuses.length - 1)]
      if (s === "throw") throw new Error("offline")
      return new Response(null, { status: s })
    }) as unknown as typeof fetch
    return { calls, impl }
  }
  const opts = (impl: typeof fetch) => ({ fetchImpl: impl, now: () => 1234, backoffMs: () => 0 })

  it("posts a could_not_complete event with the invite token and resolves true on 204", async () => {
    setInviteToken("tok-123")
    const f = fakeFetch([204])
    expect(await reportCouldNotComplete("rise-01-abc", "tracker", opts(f.impl))).toBe(true)
    expect(f.calls).toHaveLength(1)
    expect(f.calls[0].url).toBe("/api/sessions/rise-01-abc/events")
    expect(JSON.parse(String(f.calls[0].init.body))).toEqual({ type: "could_not_complete", sessionId: "rise-01-abc", reason: "tracker", at: 1234 })
    expect((f.calls[0].init.headers as Record<string, string>)[INVITE_HEADER]).toBe("tok-123")
  })

  it("retries network errors and 5xx a bounded number of times", async () => {
    const ok = fakeFetch(["throw", 503, 204])
    expect(await reportCouldNotComplete("s1", "camera", opts(ok.impl))).toBe(true)
    expect(ok.calls).toHaveLength(3)
    const down = fakeFetch(["throw"])
    expect(await reportCouldNotComplete("s1", "camera", opts(down.impl))).toBe(false)
    expect(down.calls).toHaveLength(3)
  })

  it("does not retry a refusal (wrong or missing token)", async () => {
    const f = fakeFetch([403])
    expect(await reportCouldNotComplete("s1", "camera", opts(f.impl))).toBe(false)
    expect(f.calls).toHaveLength(1)
  })
})

describe("console session facts", () => {
  it("names how the check-in was sent", () => {
    expect(checkInKind({ inviteDemo: false })).toBe("real")
    expect(checkInKind({ inviteDemo: true })).toBe("demo")
    expect(checkInKind({ inviteDemo: null })).toBe("unlinked")
    expect(checkInKind({})).toBe("unlinked")
  })

  it("summarizes the classic safety checks", () => {
    expect(setupSummary({ surface: "classic" })).toEqual({ state: "none", label: "Not confirmed yet" })
    expect(setupSummary({ surface: "classic", setup: { confirmed: [], skipped: false, at: null } }).state).toBe("none")
    expect(setupSummary({ surface: "classic", setup: { confirmed: ["chair"], skipped: false, at: 1 } })).toEqual({
      state: "partial",
      label: "Confirmed chair; not yet helper nearby and phone placed",
    })
    expect(setupSummary({ surface: "classic", setup: { confirmed: ["chair", "helper", "phone"], skipped: false, at: 1 } })).toEqual({
      state: "confirmed",
      label: "Confirmed chair, helper nearby and phone placed",
    })
  })

  it("summarizes RehabNinja's combined ready card and a skipped demo setup", () => {
    expect(setupSummary({ surface: "play", setup: { confirmed: ["ready"], skipped: false, at: 1 } })).toEqual({
      state: "confirmed",
      label: "Confirmed ready card (chair, helper, feeling OK)",
    })
    expect(setupSummary({ surface: "play", setup: { confirmed: [], skipped: true, at: 1 } })).toEqual({ state: "skipped", label: "Skipped (demo)" })
    expect(setupSummary({ surface: "classic", setup: { confirmed: ["chair"], skipped: true, at: 1 } }).label).toBe(
      "Skipped (demo) after confirming chair",
    )
  })

  it("says why a real check-in couldn't be completed", () => {
    expect(couldNotCompleteText("camera")).toBe("Couldn't complete: camera problem")
    expect(couldNotCompleteText("tracker")).toBe("Couldn't complete: tracker problem")
  })
})

describe("couldn't-complete patient copy", () => {
  const c = lines.could_not_complete
  const spoken = new Map(voice.lines.map((l) => [l.id, l.text]))

  it("the spoken lines match the printed ones, so captions and audio agree", () => {
    expect(spoken.get("camera_trouble")).toBe(c.spoken)
    expect(spoken.get("could_not_complete_done")).toBe(c.done)
  })

  it("offers the care-team action in plain words and never promises a call", () => {
    expect(c.tell).toBe("Tell my care team I couldn't do it today")
    expect(c.done).toMatch(/care team will see/i)
    for (const text of [c.title, c.body, c.spoken, c.done, c.done_title, ...Object.values(c.tips)]) {
      expect(text, text).not.toMatch(/\bcall\b|demo|replay|score|\d/i)
    }
  })
})
