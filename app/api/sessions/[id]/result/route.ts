import { handle, readBody } from "@/lib/api"
import { applyResult } from "@/lib/sessions"
import { SessionResult } from "@/lib/types"

/** Phone -> triage card. lib/rules.ts decides here, on the server; posting again (with a note) is safe. */
export async function POST(request: Request, ctx: RouteContext<"/api/sessions/[id]/result">) {
  const { id } = await ctx.params
  const body = await readBody(request, SessionResult)
  if ("error" in body) return body.error
  try {
    return Response.json(applyResult(id, body.data))
  } catch (e) {
    return handle(e)
  }
}
