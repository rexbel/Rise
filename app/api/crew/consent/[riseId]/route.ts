import { connection } from "next/server"
import { consentLog } from "@/lib/crew"

/** Care team: the patient's crew consent log (behind the console key in proxy.ts). */
export async function GET(_request: Request, ctx: RouteContext<"/api/crew/consent/[riseId]">) {
  await connection()
  const { riseId } = await ctx.params
  return Response.json(consentLog(riseId))
}
