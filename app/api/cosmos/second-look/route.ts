import { secondLook } from "@/lib/ai/cosmos"
import { CosmosSecondLookRequest } from "@/lib/types"

/** Global budget: the route spends a paid key and the public tunnel can reach it. Live play throttles itself well below this. */
const MAX_CALLS_PER_MIN = 30
const recent: number[] = []

function overBudget(now: number): boolean {
  while (recent.length && now - recent[0] > 60_000) recent.shift()
  if (recent.length >= MAX_CALLS_PER_MIN) return true
  recent.push(now)
  return false
}

/** Cosmos second look on a YOLO event. Frames are used for this one call and never stored or logged. */
export async function POST(request: Request) {
  if (overBudget(Date.now())) return Response.json({ error: "too many second looks; try again in a minute" }, { status: 429 })
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
