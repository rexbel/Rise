import { connection } from "next/server"
import { crewBoard } from "@/lib/crew"
import { authedFor, crewFail } from "@/lib/crew-http"

/** The patient's crew board: days active and cheers only. "joined" only with this patient's device token. */
export async function GET(request: Request, ctx: RouteContext<"/api/crew/[riseId]">) {
  await connection()
  const { riseId } = await ctx.params
  try {
    return Response.json(crewBoard(riseId, Date.now(), authedFor(request, riseId)))
  } catch (e) {
    return crewFail(e)
  }
}
