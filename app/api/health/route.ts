import { patients } from "@/lib/seed"

export function GET() {
  return Response.json({ ok: true, patients: patients.length, at: new Date().toISOString() })
}
