import { NextResponse, type NextRequest } from "next/server"

/**
 * Console gate for the public tunnel. Off unless CONSOLE_KEY is set, so local dev is unchanged.
 * With a key: /clinic and the console's session API need the rise_console cookie (set once by opening
 * /clinic?key=<CONSOLE_KEY>; a cookie because EventSource cannot send headers), and the debug log route is off.
 * Phone routes (events, result) stay open: patients have no key. Every POST must be same-origin (CSRF).
 */
const COOKIE = "rise_console"

/** Console-only API paths. Phone routes (/events, /result) are deliberately not here. */
function isConsoleApi(pathname: string, method: string): boolean {
  if (pathname === "/api/sessions") return true // GET list, POST invite
  if (pathname === "/api/sessions/stream" || pathname === "/api/sessions/reset") return true
  if (/^\/api\/sessions\/[^/]+\/approval$/.test(pathname)) return true
  return method === "GET" && pathname.startsWith("/api/sessions/")
}

/** Browsers always send Origin on cross-site POSTs; a missing Origin is a non-browser client, which CSRF does not cover. */
function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin")
  if (!origin) return true
  let host: string
  try {
    host = new URL(origin).host
  } catch {
    return false
  }
  // Behind Cloudflare the Host header can be the local service; the forwarded host is the public one.
  const hosts = [request.headers.get("host"), request.headers.get("x-forwarded-host")].filter(Boolean)
  return hosts.includes(host)
}

export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  if (request.method === "POST" && !sameOrigin(request)) {
    return NextResponse.json({ error: "cross-origin request refused" }, { status: 403 })
  }

  const key = process.env.CONSOLE_KEY
  if (!key) return NextResponse.next()

  if (pathname.startsWith("/api/debug/")) return NextResponse.json({ error: "not found" }, { status: 404 })

  const authed = request.cookies.get(COOKIE)?.value === key

  if (pathname === "/clinic" || pathname.startsWith("/clinic/")) {
    if (searchParams.get("key") === key) {
      const clean = request.nextUrl.clone()
      clean.searchParams.delete("key")
      const res = NextResponse.redirect(clean)
      const https = request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https"
      res.cookies.set(COOKIE, key, { httpOnly: true, sameSite: "strict", secure: https, path: "/", maxAge: 60 * 60 * 12 })
      return res
    }
    if (!authed) {
      return new NextResponse("Rise console is locked. Open /clinic?key=<console key> on this device.", {
        status: 401,
        headers: { "content-type": "text/plain; charset=utf-8" },
      })
    }
    return NextResponse.next()
  }

  if (isConsoleApi(pathname, request.method) && !authed) {
    return NextResponse.json({ error: "console key required" }, { status: 401 })
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/clinic", "/clinic/:path*", "/api/sessions", "/api/sessions/:path*", "/api/crew/:path*", "/api/debug/:path*", "/api/cosmos/:path*"],
}
