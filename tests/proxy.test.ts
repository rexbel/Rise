import { afterEach, describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import { proxy } from "../proxy"

const req = (path: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
  new NextRequest(new URL(path, "https://rise.example.test"), { method: init.method ?? "GET", headers: init.headers })

afterEach(() => {
  delete process.env.CONSOLE_KEY
})

describe("console gate (proxy.ts)", () => {
  it("is open when no console key is set, but still refuses cross-origin POSTs", () => {
    expect(proxy(req("/clinic")).status).toBe(200)
    const evil = proxy(req("/api/sessions/reset", { method: "POST", headers: { origin: "https://evil.test", host: "rise.example.test" } }))
    expect(evil.status).toBe(403)
    const ok = proxy(req("/api/sessions/reset", { method: "POST", headers: { origin: "https://rise.example.test", host: "localhost:3400", "x-forwarded-host": "rise.example.test" } }))
    expect(ok.status).toBe(200)
  })

  it("with a key: locks the console and its API, keeps phone routes open, turns off debug logging", () => {
    process.env.CONSOLE_KEY = "k-123"
    expect(proxy(req("/clinic")).status).toBe(401)
    expect(proxy(req("/api/sessions")).status).toBe(401)
    expect(proxy(req("/api/sessions/stream")).status).toBe(401)
    expect(proxy(req("/api/sessions/rise-01-abcd1234/approval", { method: "POST" })).status).toBe(401)
    expect(proxy(req("/api/sessions/reset", { method: "POST" })).status).toBe(401)
    expect(proxy(req("/api/sessions/rise-01-abcd1234/events", { method: "POST" })).status).toBe(200)
    expect(proxy(req("/api/sessions/rise-01-abcd1234/result", { method: "POST" })).status).toBe(200)
    expect(proxy(req("/api/debug/client-log", { method: "POST" })).status).toBe(404)
  })

  it("?key= sets an httpOnly cookie and strips the key from the URL; the cookie then opens the console", () => {
    process.env.CONSOLE_KEY = "k-123"
    expect(proxy(req("/clinic?key=wrong")).status).toBe(401)
    const res = proxy(req("/clinic?key=k-123"))
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("https://rise.example.test/clinic")
    expect(res.headers.get("set-cookie")).toMatch(/rise_console=k-123.*HttpOnly/i)
    expect(proxy(req("/api/sessions", { headers: { cookie: "rise_console=k-123" } })).status).toBe(200)
  })
})
