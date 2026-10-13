import { secondLook } from "@/lib/ai/cosmos"
import { CosmosSecondLookRequest } from "@/lib/types"

/** Cosmos second look on a YOLO event. Frames are used for this one call and never stored or logged. */
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 })
  }
  const parsed = CosmosSecondLookRequest.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: "invalid request", issues: parsed.error.issues.map((i) => i.path.join(".") + ": " + i.message) }, { status: 400 })
  }
  return Response.json(await secondLook(parsed.data))
}
