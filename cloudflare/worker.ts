/**
 * Edge for rise.nextrex.health: every request goes to one Rise container (Next.js `next start` on :8080).
 * A single named instance keeps the in-memory session board, crew, and the console's SSE stream in one process.
 * It sleeps after a quiet spell; the next request wakes it, with a fresh (synthetic, seeded) state.
 */
import { Container } from "@cloudflare/containers"

export class RiseContainer extends Container {
  defaultPort = 8080
  sleepAfter = "2h"
}

interface Env {
  RISE: DurableObjectNamespace<RiseContainer>
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.RISE.getByName("rise").fetch(request)
  },
}
