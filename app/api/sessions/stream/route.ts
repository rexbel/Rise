import { connection } from "next/server"
import { listSessions, subscribe } from "@/lib/sessions"
import type { SessionStreamMessage } from "@/lib/types"

const HEARTBEAT_MS = 15_000

/** Live board feed (Server-Sent Events): a snapshot first, then one message per change. */
export async function GET(request: Request) {
  await connection()
  const encoder = new TextEncoder()
  let cleanup = () => {}
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (m: SessionStreamMessage) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(m)}\n\n`))
      send({ type: "snapshot", sessions: listSessions() })
      const unsubscribe = subscribe(send)
      const beat = setInterval(() => controller.enqueue(encoder.encode(": keep-alive\n\n")), HEARTBEAT_MS)
      cleanup = () => {
        clearInterval(beat)
        unsubscribe()
        try {
          controller.close()
        } catch {
          // already closed
        }
      }
      request.signal.addEventListener("abort", () => cleanup())
    },
    cancel() {
      cleanup()
    },
  })
  return new Response(stream, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive" },
  })
}
