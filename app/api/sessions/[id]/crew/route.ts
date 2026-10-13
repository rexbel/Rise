import { handle, readBody } from "@/lib/api"
import { resumeCrew } from "@/lib/sessions"
import { CrewResumeRequest } from "@/lib/types"

/** Console: return a paused patient to their crew. A person decides; audited as crew_resumed. */
export async function POST(request: Request, ctx: RouteContext<"/api/sessions/[id]/crew">) {
  const { id } = await ctx.params
  const body = await readBody(request, CrewResumeRequest)
  if ("error" in body) return body.error
  try {
    return Response.json(resumeCrew(id, body.data.user))
  } catch (e) {
    return handle(e)
  }
}
