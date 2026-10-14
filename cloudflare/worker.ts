/**
 * Edge for rise.nextrex.health: every request goes to one Rise container (Next.js `next start` on :8080).
 * A single named instance keeps the in-memory session board, crew, and the console's SSE stream in one process.
 * It sleeps after a quiet spell; the next request wakes it and it reloads its saved state (below).
 *
 * Durable state: the container saves a JSON snapshot of sessions and crew to /__rise_store (lib/persist.ts), which
 * this Worker keeps in the Durable Object's own storage. Only the container knows STORE_KEY, so the public can't
 * read or write it. Calling the store methods does not start the container.
 */
import { Container } from "@cloudflare/containers"

/** Durable Object storage values are size-limited, so the snapshot is saved in chunks. */
const CHUNK = 100_000
const MAX_SNAPSHOT = 8_000_000

interface Env {
  RISE: DurableObjectNamespace<RiseContainer>
  STORE_KEY: string
  PUBLIC_ORIGIN: string
}

export class RiseContainer extends Container<Env> {
  defaultPort = 8080
  sleepAfter = "2h"

  constructor(ctx: DurableObjectState<{}>, env: Env) {
    super(ctx, env)
    this.envVars = {
      RISE_STORE_URL: `${env.PUBLIC_ORIGIN}/__rise_store`,
      RISE_STORE_KEY: env.STORE_KEY,
    }
  }

  async loadSnapshot(): Promise<string | null> {
    const n = await this.ctx.storage.get<number>("snap:n")
    if (!n) return null
    const parts = await this.ctx.storage.get<string>(Array.from({ length: n }, (_, i) => `snap:${i}`))
    return Array.from({ length: n }, (_, i) => parts.get(`snap:${i}`) ?? "").join("")
  }

  async saveSnapshot(json: string): Promise<void> {
    const n = Math.max(1, Math.ceil(json.length / CHUNK))
    const entries: Record<string, string | number> = { "snap:n": n }
    for (let i = 0; i < n; i++) entries[`snap:${i}`] = json.slice(i * CHUNK, (i + 1) * CHUNK)
    await this.ctx.storage.put(entries)
  }
}

async function store(request: Request, env: Env): Promise<Response> {
  if (!env.STORE_KEY || request.headers.get("x-rise-store-key") !== env.STORE_KEY) return new Response("forbidden", { status: 403 })
  const stub = env.RISE.getByName("rise")
  if (request.method === "GET") {
    const snap = await stub.loadSnapshot()
    return snap ? new Response(snap, { headers: { "content-type": "application/json" } }) : new Response("none", { status: 404 })
  }
  if (request.method === "PUT") {
    const body = await request.text()
    if (body.length > MAX_SNAPSHOT) return new Response("too large", { status: 413 })
    await stub.saveSnapshot(body)
    return new Response(null, { status: 204 })
  }
  return new Response("method not allowed", { status: 405 })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname === "/__rise_store") return store(request, env)
    return env.RISE.getByName("rise").fetch(request)
  },
}
