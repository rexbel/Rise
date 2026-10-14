import { handle, readBody } from "@/lib/api"
import { applyEvent } from "@/lib/sessions"
import { INVITE_HEADER, RepEvent } from "@/lib/types"

/** Phone -> live board. Fire-and-forget from the phone; the test never waits on this. */
export async function POST(request: Request, ctx: RouteContext<"/api/sessions/[id]/events">) {
  const { id } = await ctx.params
  const body = await readBody(request, RepEvent)
  if ("error" in body) return body.error
  try {
    applyEvent(id, body.data, Date.now(), request.headers.get(INVITE_HEADER))
    return new Response(null, { status: 204 })
  } catch (e) {
    return handle(e)
  }
}
