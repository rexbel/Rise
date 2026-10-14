import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { patients, scriptedResult } from "../lib/seed"
import { applyResult, approve, getSession, invite, resetSessions } from "../lib/sessions"
import { __test, loadSnapshot } from "../lib/persist"

const ellen = patients.find((p) => p.rise_id === "rise-01")!

type Call = { method: string; body?: string }

/** A fake store: GET answers from `get`, PUT is recorded. */
function stubStore(get: () => Response) {
  const calls: Call[] = []
  vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET"
    calls.push({ method, body: init?.body as string | undefined })
    return method === "GET" ? get() : new Response(null, { status: 204 })
  })
  return calls
}

function decidedSession() {
  const { sessionId } = invite("rise-01", "classic", "Nurse A", 1000)
  applyResult(sessionId, scriptedResult(ellen, { sessionId }), 2000)
  approve(sessionId, { action: "approve", user: "Nurse A" }, 3000)
  return sessionId
}

beforeEach(() => {
  resetSessions()
  vi.stubEnv("RISE_STORE_URL", "https://store.test/__rise_store")
  vi.stubEnv("RISE_STORE_KEY", "k")
  Object.assign(__test.state, { started: false, loaded: false, last: "", saving: null })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("durable storage", () => {
  it("a failed load never lets a save overwrite the stored snapshot", async () => {
    const calls = stubStore(() => new Response("boom", { status: 500 }))
    expect(await loadSnapshot()).toBe("failed")
    decidedSession()
    await __test.save()
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0)
  })

  it("a snapshot that fails validation is rejected whole, and saving stays off", async () => {
    const calls = stubStore(() => Response.json({ version: 1, savedAt: 1, sessions: [{ nope: true }], crew: {} }))
    const before = decidedSession()
    expect(await loadSnapshot()).toBe("failed")
    expect(getSession(before)).toBeDefined()
    await __test.save()
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0)
  })

  it("nothing saved yet (404) allows saving; an unchanged store is not saved twice", async () => {
    const calls = stubStore(() => new Response("none", { status: 404 }))
    expect(await loadSnapshot()).toBe("loaded")
    await __test.save()
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0)
    decidedSession()
    await __test.save()
    await __test.save()
    const puts = calls.filter((c) => c.method === "PUT")
    expect(puts).toHaveLength(1)
    expect(JSON.parse(puts[0].body!)).toMatchObject({ version: 1, sessions: [expect.objectContaining({ riseId: "rise-01" })] })
  })

  it("a saved snapshot loads back, validated", async () => {
    const id = decidedSession()
    let saved = ""
    vi.stubGlobal("fetch", async (_u: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        saved = init.body as string
        return new Response(null, { status: 204 })
      }
      return saved ? new Response(saved) : new Response("none", { status: 404 })
    })
    await loadSnapshot()
    decidedSession()
    await __test.save()
    resetSessions()
    Object.assign(__test.state, { loaded: false, last: "" })
    expect(await loadSnapshot()).toBe("loaded")
    expect(getSession(id)?.followUp?.status).toBe("open")
  })
})
