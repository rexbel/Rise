/**
 * DAY-OF: deterministic triage rules (plan §6). Rules run top to bottom; the first match wins.
 * Models never set the recommendation.
 *
 *  1. Red flag        short_of_breath_or_chest_pain = yes            -> escalate_urgent (+ patient emergency screen)
 *  2. Stopped early   finished early / no resume in 60 s              -> human_confirm ("Was this a safety event?")
 *  3. Clot signal     calf_pain_or_swelling = yes                    -> escalate_urgent, surgeon_on_call
 *  4. Decline         raw down >= 25% vs last, or NEW arm use        -> escalate_urgent, surgeon if POD <= 30 else primary_care
 *  5. Non-surgical    decline + new_incontinence or shuffling gait   -> escalate_urgent, primary_care
 *  6. Orthostatic     dizzy = yes, or >= 2 post-stand pauses > 3 s   -> nurse_callback (orthostatic BP check)
 *  7. Balance         tandem hold < 10 s                             -> nurse_callback, physical_therapy
 *  8. On track                                                       -> continue_plan
 *
 * Acceptance: reproduces expected_triage for all 7 seed patients (tests/seed.test.ts has the oracle).
 */
import type { CheckIn, SessionResult, TriageDecision } from "@/lib/types"

export function triage(_result: SessionResult, _previous: CheckIn, _postOpDay: number): TriageDecision {
  throw new Error("TODO(day-of): implement lib/rules.ts")
}
