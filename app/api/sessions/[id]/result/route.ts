import { handle, readBody } from "@/lib/api"
import { recordSelfStartedSet } from "@/lib/crew"
import { applyResult, SessionError } from "@/lib/sessions"
import { INVITE_HEADER, SessionResult } from "@/lib/types"

/** Phone -> triage card. lib/rules.ts decides here, on the server; posting again (with a note) is safe. */
export async function POST(request: Request, ctx: RouteContext<"/api/sessions/[id]/result">) {
  const { id } = await ctx.params
  const body = await readBody(request, SessionResult)
  if ("error" in body) return body.error
  try {
    return Response.json(applyResult(id, body.data, Date.now(), request.headers.get(INVITE_HEADER)))
  } catch (e) {
    // Gated tunnel, uninvited session (the patient tapped Continue on their own): not for the console, but a
    // finished non-emergency set still counts on the crew board. 202 = accepted for the crew only.
    if (e instanceof SessionError && e.status === 404 && process.env.CONSOLE_KEY && body.data.sessionId === id && recordSelfStartedSet(body.data)) {
      return Response.json({ crewOnly: true }, { status: 202 })
    }
    return handle(e)
  }
}
