/** Shared helpers for the crew routes: device-token cookie, caller address, error mapping. */
import { CrewError, crewCookieName, tokenMatches } from "@/lib/crew"

/** True when the request carries this patient's device token (httpOnly cookie set on join). */
export function authedFor(request: Request, riseId: string): boolean {
  const name = crewCookieName(riseId)
  const raw = request.headers.get("cookie") ?? ""
  const token = raw
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${name}=`))
    ?.slice(name.length + 1)
  return tokenMatches(riseId, token ? decodeURIComponent(token) : undefined)
}

export function clientOf(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local"
}

/** Set-Cookie for a patient's device token. Scoped to the crew API, httpOnly, same-site strict. */
export function tokenCookie(request: Request, riseId: string, token: string | null): string {
  const https = new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https"
  const value = token ? encodeURIComponent(token) : ""
  const age = token ? 60 * 60 * 24 * 30 : 0
  return `${crewCookieName(riseId)}=${value}; Path=/api/crew; HttpOnly; SameSite=Strict; Max-Age=${age}${https ? "; Secure" : ""}`
}

export function crewFail(e: unknown): Response {
  if (e instanceof CrewError) return Response.json({ error: e.message }, { status: e.status })
  console.error("[rise] crew route error", e instanceof Error ? e.message : "unknown")
  return Response.json({ error: "server error" }, { status: 500 })
}
