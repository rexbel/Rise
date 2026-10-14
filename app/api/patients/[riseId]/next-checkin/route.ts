import { connection } from "next/server"
import { patientNextCheckIn } from "@/lib/sessions"
import type { PatientNextCheckIn } from "@/lib/types"

/** The patient's next check-in (latest decided session, else the seed's schedule). Day only; no scores. */
export async function GET(_request: Request, ctx: RouteContext<"/api/patients/[riseId]/next-checkin">) {
  await connection()
  const { riseId } = await ctx.params
  const nextCheckIn = patientNextCheckIn(riseId)
  if (!nextCheckIn) return Response.json({ error: "unknown patient" }, { status: 404 })
  return Response.json({ riseId, nextCheckIn } satisfies PatientNextCheckIn)
}
