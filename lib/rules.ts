/**
 * Deterministic triage rules (plan §6). Rules run top to bottom; the first match wins.
 * Models never set the recommendation.
 *
 *  1. Red flag        short_of_breath_or_chest_pain = yes            -> escalate_urgent (+ patient emergency screen)
 *  2. Stopped early   finished early / no resume in 60 s              -> human_confirm ("Was this a safety event?")
 *  3. Clot signal     calf_pain_or_swelling = yes                    -> escalate_urgent, surgeon_on_call
 *  4. Non-surgical    decline + new_incontinence or shuffling gait   -> escalate_urgent, primary_care
 *  5. Decline         raw down >= 25% vs last, or NEW arm use        -> escalate_urgent, surgeon if POD <= 30 else primary_care
 *  6. Orthostatic     dizzy = yes, or >= 2 post-stand pauses > 3 s   -> nurse_callback, care_coordinator (orthostatic BP check)
 *  7. Balance         tandem hold < 10 s                             -> nurse_callback, physical_therapy
 *  8. On track                                                       -> continue_plan (physical_therapy if arms still needed)
 *
 * Non-surgical is checked before Decline because it is a narrower case of it (the plan's table lists it after).
 * Acceptance: reproduces expected_triage for all 7 seed patients (tests/rules.test.ts; oracle in tests/seed.test.ts).
 */
import protocol from "@/config/protocol.default.json"
import type { CheckIn, Route, SessionResult, TriageDecision } from "@/lib/types"

const T = protocol.thresholds
const TANDEM_MIN_S = protocol.addons.balance_tandem.fall_risk_if_hold_under_s

export function triage(result: SessionResult, previous: CheckIn | undefined, postOpDay: number): TriageDecision {
  const s = result.symptoms
  const surgicalRoute: Route = postOpDay <= T.route_surgeon_if_pod_lte ? "surgeon_on_call" : "primary_care"
  const decide = (d: Omit<TriageDecision, "emergency">, emergency = false): TriageDecision => ({ ...d, emergency })

  if (s.short_of_breath_or_chest_pain) {
    return decide({ recommendation: "escalate_urgent", route: surgicalRoute, ruleFired: "red_flag", reasons: ["Short of breath or chest pain"] }, true)
  }
  if (result.stoppedEarly) {
    return decide({ recommendation: "human_confirm", route: "care_coordinator", ruleFired: "stopped_early", reasons: ["Finished early: was this a safety event?"] })
  }
  if (s.calf_pain_or_swelling) {
    return decide({ recommendation: "escalate_urgent", route: "surgeon_on_call", ruleFired: "clot_signal", reasons: ["New calf pain or swelling"] })
  }

  const decline: string[] = []
  if (previous) {
    const drop = previous.raw_stands > 0 ? ((previous.raw_stands - result.rawStands) / previous.raw_stands) * 100 : 0
    if (drop >= T.decline_pct_vs_last) decline.push(`${result.rawStands} stands vs ${previous.raw_stands} last time`)
    if (result.armsUsed && !previous.arms_used) decline.push(result.armsFromRep ? `Arms used from rep ${result.armsFromRep}` : "New arm use")
  }
  if (decline.length) {
    const shuffling = result.gaitObservations.some((g) => /shuffl/i.test(g))
    if (s.new_incontinence || shuffling) {
      const extra = [s.new_incontinence && "New incontinence", shuffling && "Shuffling gait"].filter((x): x is string => !!x)
      return decide({ recommendation: "escalate_urgent", route: "primary_care", ruleFired: "non_surgical", reasons: [...decline, ...extra] })
    }
    return decide({ recommendation: "escalate_urgent", route: surgicalRoute, ruleFired: "decline", reasons: decline })
  }

  if (s.dizzy || result.pausesOver3s >= T.orthostatic_pauses_min) {
    const reasons = [s.dizzy && "Dizzy or lightheaded", result.pausesOver3s >= T.orthostatic_pauses_min && `${result.pausesOver3s} pauses over ${T.orthostatic_pause_s} s after standing`].filter((x): x is string => !!x)
    return decide({ recommendation: "nurse_callback", route: "care_coordinator", ruleFired: "orthostatic", reasons })
  }
  if (result.tandemHoldS !== undefined && result.tandemHoldS < TANDEM_MIN_S) {
    return decide({ recommendation: "nurse_callback", route: "physical_therapy", ruleFired: "balance", reasons: [`Tandem stance held ${result.tandemHoldS} s (< ${TANDEM_MIN_S} s)`] })
  }
  return decide({
    recommendation: "continue_plan",
    route: result.armsUsed ? "physical_therapy" : null,
    ruleFired: "on_track",
    reasons: result.armsUsed ? ["Still using arms to stand; arm-assisted count tracked"] : ["No rule fired"],
  })
}
