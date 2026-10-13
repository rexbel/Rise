/**
 * When to ask Cosmos for a second look, and the request itself. Pure throttle so it is unit-tested:
 * one call in flight, at least MIN_GAP_MS between calls, at most MAX_PER_SET per set.
 * A hard finding may go while a soft one is in flight (the soft answer is still shown when it lands).
 */
import type { CosmosSecondLookRequest, CosmosSecondLookResult, CosmosTrigger } from "@/lib/types"

export const MIN_GAP_MS = 3000
export const MAX_PER_SET = 8
export const FRAMES_PER_LOOK = 4
export const WINDOW_MS = 2000

export interface ThrottleState {
  inFlight: boolean
  inFlightSeverity: "soft" | "hard" | null
  lastSentAt: number | null
  sentThisSet: number
}

export const initialThrottle = (): ThrottleState => ({ inFlight: false, inFlightSeverity: null, lastSentAt: null, sentThisSet: 0 })

export function shouldSecondLook(state: ThrottleState, now: number, severity: "soft" | "hard"): boolean {
  if (state.sentThisSet >= MAX_PER_SET) return false
  const hardOverSoft = severity === "hard" && state.inFlightSeverity === "soft"
  if (state.inFlight && !hardOverSoft) return false
  if (state.lastSentAt !== null && now - state.lastSentAt < MIN_GAP_MS && !hardOverSoft) return false
  return true
}

/** One entry on the clinic strip. `result` is null while Cosmos is looking. */
export interface CosmosLook {
  id: string
  trigger: CosmosTrigger
  atMs: number
  result: CosmosSecondLookResult | null
}

export async function requestSecondLook(req: CosmosSecondLookRequest): Promise<CosmosSecondLookResult | null> {
  try {
    const res = await fetch("/api/cosmos/second-look", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
      // Server has an 8 s timeout plus one retry; give it a little headroom.
      signal: AbortSignal.timeout(20_000),
    })
    return res.ok ? ((await res.json()) as CosmosSecondLookResult) : null
  } catch {
    return null
  }
}
