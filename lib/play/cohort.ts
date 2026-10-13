/**
 * RehabNinja identity helpers for the patient's own pages. There is no peer board: patients only ever
 * compare with themselves (no ranks, places, peers, or numbers derived from stand counts).
 */

import type { ProcedureFamily } from "@/lib/play/programs"

/** The demo patient /play opens for (Ellen, synthetic). */
export const DEFAULT_YOU_ID = "rise-01"

export function avatarSrc(riseId: string): string {
  return `/play/avatars/${riseId}.jpg`
}

export function familyLabel(family: ProcedureFamily): string {
  switch (family) {
    case "tka":
      return "Knee track"
    case "tha":
      return "Hip track"
    case "hip_fracture":
      return "Fracture track"
  }
}
