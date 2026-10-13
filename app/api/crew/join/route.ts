import { readBody } from "@/lib/api"
import { joinCrew } from "@/lib/crew"
import { crewFail, tokenCookie } from "@/lib/crew-http"
import { CrewJoinRequest } from "@/lib/types"

/** Opt in after reading the join card: records consent and sets this phone's device token. */
export async function POST(request: Request) {
  const body = await readBody(request, CrewJoinRequest)
  if ("error" in body) return body.error
  try {
    const { token, board } = joinCrew(body.data)
    return Response.json(board, { headers: { "set-cookie": tokenCookie(request, body.data.riseId, token) } })
  } catch (e) {
    return crewFail(e)
  }
}
