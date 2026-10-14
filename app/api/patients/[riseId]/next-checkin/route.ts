import { connection } from "next/server"
import { patientNextCheckIn } from "@/lib/sessions"
import type { PatientNextCheckIn } from "@/lib/types"

/** The patient's next check-in (the standing schedule, else the seed's). Day only; no scores, no reasons. */
export async function GET(_request: Request, ctx: RouteContext<"/api/patients/[riseId]/next-checkin">) {
  await connection()
  const { riseId } = await ctx.params
  const nc = patientNextCheckIn(riseId)
  if (!nc) return Response.json({ error: "unknown patient" }, { status: 404 })
  // The day only: reason, phase, and source would reveal escalations or decline on this unauthenticated route.
  return Response.json({ riseId, nextCheckIn: { inDays: nc.inDays, dueOn: nc.dueOn, paused: nc.paused } } satisfies PatientNextCheckIn)
}
