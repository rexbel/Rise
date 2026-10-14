import { connection } from "next/server"
import { handle, readBody } from "@/lib/api"
import { invite, listSessions } from "@/lib/sessions"
import { InviteRequest } from "@/lib/types"

/** Every session on the board, newest first. In-memory, so it must run per request. */
export async function GET() {
  await connection()
  return Response.json(listSessions())
}

/** Send check-in: creates an invited session and the patient link. Twilio is not wired; sms.demoData is true. */
export async function POST(request: Request) {
  const body = await readBody(request, InviteRequest)
  if ("error" in body) return body.error
  try {
    return Response.json(invite(body.data.riseId, body.data.surface, undefined, Date.now(), body.data.demo), { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
