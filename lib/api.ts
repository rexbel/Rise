/** Small helpers shared by the session route handlers. */
import type { z } from "zod"
import { SessionError } from "@/lib/sessions"

const MAX_BODY_BYTES = 256_000

export function fail(message: string, status: number, issues?: string[]) {
  return Response.json(issues ? { error: message, issues } : { error: message }, { status })
}

/** Parse a JSON body against a schema; returns the data or a ready 400/413 response. */
export async function readBody<S extends z.ZodType>(request: Request, schema: S): Promise<{ data: z.infer<S> } | { error: Response }> {
  const length = Number(request.headers.get("content-length") ?? 0)
  if (length > MAX_BODY_BYTES) return { error: fail("body too large", 413) }
  // Read with a running byte count: chunked uploads have no content-length to check up front.
  let text = ""
  try {
    const reader = request.body?.getReader()
    const decoder = new TextDecoder()
    let bytes = 0
    for (;;) {
      if (!reader) break
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel()
        return { error: fail("body too large", 413) }
      }
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
  } catch {
    return { error: fail("unreadable body", 400) }
  }
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return { error: fail("invalid JSON", 400) }
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return { error: fail("invalid request", 400, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)) }
  }
  return { data: parsed.data }
}

/** Map store errors to HTTP; anything else is a 500 without internals. */
export function handle(e: unknown) {
  if (e instanceof SessionError) return fail(e.message, e.status)
  console.error("[rise] session route error", e instanceof Error ? e.message : "unknown")
  return fail("server error", 500)
}
