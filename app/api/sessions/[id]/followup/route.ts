import { handle, readBody } from "@/lib/api"
import { recordFollowUp } from "@/lib/sessions"
import { FollowUpRequest } from "@/lib/types"

/** A person records how a follow-up ended. Demo build: no auth, user is a label. */
export async function POST(request: Request, ctx: RouteContext<"/api/sessions/[id]/followup">) {
  const { id } = await ctx.params
  const body = await readBody(request, FollowUpRequest)
  if ("error" in body) return body.error
  try {
    return Response.json(recordFollowUp(id, body.data))
  } catch (e) {
    return handle(e)
  }
}
