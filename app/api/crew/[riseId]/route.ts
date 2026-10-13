import { connection } from "next/server"
import { crewBoard, CrewError } from "@/lib/crew"

/** The patient's crew board: days active and cheers only. In-memory, so it runs per request. */
export async function GET(_request: Request, ctx: RouteContext<"/api/crew/[riseId]">) {
  await connection()
  const { riseId } = await ctx.params
  try {
    return Response.json(crewBoard(riseId))
  } catch (e) {
    if (e instanceof CrewError) return Response.json({ error: e.message }, { status: e.status })
    return Response.json({ error: "server error" }, { status: 500 })
  }
}
