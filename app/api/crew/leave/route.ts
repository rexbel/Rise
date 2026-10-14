import { readBody } from "@/lib/api"
import { CrewError, leaveCrew } from "@/lib/crew"
import { authedFor, crewFail, tokenCookie } from "@/lib/crew-http"
import { CrewLeaveRequest } from "@/lib/types"

/** Leave the crew: withdraws consent (recorded) and clears this phone's token. */
export async function POST(request: Request) {
  const body = await readBody(request, CrewLeaveRequest)
  if ("error" in body) return body.error
  try {
    if (!authedFor(request, body.data.riseId)) throw new CrewError("join your crew on this phone first", 401)
    leaveCrew(body.data.riseId)
    return new Response(null, { status: 204, headers: { "set-cookie": tokenCookie(request, body.data.riseId, null) } })
  } catch (e) {
    return crewFail(e)
  }
}
