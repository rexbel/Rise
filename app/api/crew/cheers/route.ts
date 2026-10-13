import { readBody } from "@/lib/api"
import { cheer } from "@/lib/crew"
import { authedFor, clientOf, crewFail } from "@/lib/crew-http"
import { CheerRequest } from "@/lib/types"

/** Send a fixed-phrase cheer. The sender must hold its device token. Idempotent per sender, recipient, day. */
export async function POST(request: Request) {
  const body = await readBody(request, CheerRequest)
  if ("error" in body) return body.error
  try {
    return Response.json(cheer(body.data, Date.now(), clientOf(request), authedFor(request, body.data.from)))
  } catch (e) {
    return crewFail(e)
  }
}
