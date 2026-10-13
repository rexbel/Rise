import { handle, readBody } from "@/lib/api"
import { approve } from "@/lib/sessions"
import { ApprovalRequest } from "@/lib/types"

/** A person approves or downgrades the rules' recommendation. Demo build: no auth, user is a label. */
export async function POST(request: Request, ctx: RouteContext<"/api/sessions/[id]/approval">) {
  const { id } = await ctx.params
  const body = await readBody(request, ApprovalRequest)
  if ("error" in body) return body.error
  try {
    return Response.json(approve(id, body.data))
  } catch (e) {
    return handle(e)
  }
}
