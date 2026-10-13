import { readBody } from "@/lib/api"
import { cheer, CrewError } from "@/lib/crew"
import { CheerRequest } from "@/lib/types"

/** Send a fixed-phrase cheer. Idempotent per sender, recipient and day. Same-origin is enforced in proxy.ts. */
export async function POST(request: Request) {
  const body = await readBody(request, CheerRequest)
  if ("error" in body) return body.error
  try {
    return Response.json(cheer(body.data))
  } catch (e) {
    if (e instanceof CrewError) return Response.json({ error: e.message }, { status: e.status })
    return Response.json({ error: "server error" }, { status: 500 })
  }
}
