import { resetSessions } from "@/lib/sessions"

/** Reset demo: clears every live session. Seed data is untouched. */
export function POST() {
  resetSessions()
  return new Response(null, { status: 204 })
}
