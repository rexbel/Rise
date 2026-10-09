import { NextResponse } from "next/server"

/** Dev-only: browser posts play/camera errors so the agent terminal can see them. */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false }, { status: 404 })
  }
  try {
    const body = (await req.json()) as { level?: string; msg?: string; detail?: unknown }
    const level = (body.level ?? "error").toUpperCase()
    const msg = body.msg ?? "(no msg)"
    const detail = body.detail !== undefined ? ` ${JSON.stringify(body.detail)}` : ""
    console.error(`[client:${level}] ${msg}${detail}`)
  } catch (e) {
    console.error("[client:ERROR] bad payload", e)
  }
  return NextResponse.json({ ok: true })
}
