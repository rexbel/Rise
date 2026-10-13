import { readBody } from "@/lib/api"
import { cheer, CrewError } from "@/lib/crew"
import { CheerRequest } from "@/lib/types"

/** Send a fixed-phrase cheer. Idempotent per sender, recipient and day. Same-origin is enforced in proxy.ts. */
export async function POST(request: Request) {
  const body = await readBody(request, CheerRequest)
  if ("error" in body) return body.error
  try {
    // Behind Cloudflare the caller's address is cf-connecting-ip; locally there is none.
    const client = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local"
    return Response.json(cheer(body.data, Date.now(), client))
  } catch (e) {
    if (e instanceof CrewError) return Response.json({ error: e.message }, { status: e.status })
    console.error("[rise] cheer route error", e instanceof Error ? e.message : "unknown")
    return Response.json({ error: "server error" }, { status: 500 })
  }
}
