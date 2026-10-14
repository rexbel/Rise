import { readBody } from "@/lib/api"
import { CrewError, joinCrew } from "@/lib/crew"
import { getSession } from "@/lib/sessions"
import { crewFail, tokenCookie } from "@/lib/crew-http"
import { CrewJoinRequest } from "@/lib/types"

/** Opt in after reading the join card: records consent and sets this phone's device token. */
export async function POST(request: Request) {
  const body = await readBody(request, CrewJoinRequest)
  if ("error" in body) return body.error
  try {
    // On the public tunnel, joining needs the patient's console invite (?s=), so nobody can opt someone else in.
    const s = body.data.sessionId ? getSession(body.data.sessionId) : undefined
    const verified = !!s && s.invitedAt !== null && s.riseId === body.data.riseId
    if (process.env.CONSOLE_KEY && !verified) throw new CrewError("open your check-in link from your care team to join", 403)
    const { token, board } = joinCrew(body.data, Date.now(), verified)
    return Response.json(board, { headers: { "set-cookie": tokenCookie(request, body.data.riseId, token) } })
  } catch (e) {
    return crewFail(e)
  }
}
