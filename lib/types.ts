import { z } from "zod"

/* ---------- Seed (seed/patients.json) ---------- */

export const Recommendation = z.enum(["escalate_urgent", "nurse_callback", "continue_plan", "human_confirm"])
export type Recommendation = z.infer<typeof Recommendation>

export const Trend = z.enum(["better", "same", "harder"])
export type Trend = z.infer<typeof Trend>

export const Symptoms = z.object({
  pain_0_10: z.number().min(0).max(10),
  dizzy: z.boolean(),
  short_of_breath_or_chest_pain: z.boolean(),
  calf_pain_or_swelling: z.boolean(),
  new_incontinence: z.boolean(),
})
export type Symptoms = z.infer<typeof Symptoms>

export const CheckIn = z.object({
  label: z.string(),
  post_op_day: z.number(),
  raw_stands: z.number().int().min(0),
  arms_used: z.boolean(),
  steadi_score: z.number().int().min(0),
})
export type CheckIn = z.infer<typeof CheckIn>

export const ScriptedSession = z.object({
  raw: z.number().int().min(0),
  arms: z.boolean(),
  arms_from_rep: z.number().int().optional(),
  asymmetry_pct: z.number(),
  favoring: z.string().nullable(),
  pauses_over_3s_after_standing: z.number().int().optional(),
  balance_tandem_hold_s: z.number().optional(),
  gait_observations: z.array(z.string()).optional(),
  symptoms: Symptoms,
  steadi_score: z.number().int().min(0),
})
export type ScriptedSession = z.infer<typeof ScriptedSession>

export const SeedPatient = z.object({
  rise_id: z.string(),
  display_name: z.string(),
  demo_role: z.string(),
  synthetic: z.literal(true),
  source: z.object({
    dataset: z.string(),
    patient_id: z.number(),
    repo: z.string().url(),
    license: z.string(),
    chart_note: z.string(),
  }),
  demographics: z.object({ age: z.number(), sex: z.enum(["F", "M"]), race_ethnicity: z.string(), insurance: z.string() }),
  chronic_conditions: z.array(z.string()),
  surgical_history: z.array(z.string()),
  home_medications: z.array(z.string()),
  allergies: z.array(z.string()),
  episode: z.object({
    procedure: z.string(),
    operated_side: z.string(),
    post_op_day_today: z.number(),
    risk_flags: z.array(z.string()),
  }),
  protocol: z.object({
    name: z.string(),
    steadi_age_band: z.string(),
    steadi_below_average_if_under: z.number().nullable(),
    addons: z.array(z.string()),
  }),
  checkins: z.array(CheckIn).min(1),
  scripted_today: ScriptedSession,
  expected_triage: z.object({
    recommendation: Recommendation,
    route: z.string().nullable(),
    patient_message: z.string(),
    why: z.string(),
  }),
  monitoring_episode: z.object({
    type: z.enum(["post_discharge", "reactivated"]),
    start_pod: z.number(),
    length_days: z.number(),
    cadence_days: z.number().nullable(),
    set_by: z.string(),
    day_in_episode: z.number(),
    ends_after_day: z.number(),
    on_end: z.string(),
  }),
  cadence: z.object({ next_checkin_in_days: z.number(), phase: z.string(), reason: z.string() }),
  patient_feedback: z.object({ trend_vs_previous: Trend, compared_to: z.string(), next_step: z.string() }),
})
export type SeedPatient = z.infer<typeof SeedPatient>

export const SeedFile = z.object({
  generated_for: z.string(),
  protocol_source: z.string().url(),
  patients: z.array(SeedPatient).length(7),
})

/* ---------- Live session (day-of) ---------- */

export type PoseTier = "yolo-onnx" | "mediapipe" | "remote-yolo" | "seeded"

/** 17 COCO keypoints: [x, y, confidence], normalized 0..1 */
export type Keypoints17 = [number, number, number][]

export type SessionStatus = "invited" | "setting_up" | "testing" | "paused" | "questions" | "scoring" | "ready" | "needs_confirmation"

export type RepEvent =
  | { type: "status"; sessionId: string; status: SessionStatus; tier?: PoseTier; at: number }
  | { type: "rep"; sessionId: string; count: number; armsUsed: boolean; at: number }
  | { type: "stop"; sessionId: string; reason: "button" | "no_stand"; at: number }
  | { type: "resume"; sessionId: string; at: number }
  | { type: "finished_early"; sessionId: string; at: number }

export interface SessionResult {
  sessionId: string
  riseId: string
  rawStands: number
  armsUsed: boolean
  steadiScore: number
  asymmetryPct: number
  pausesOver3s: number
  stoppedEarly: boolean
  tandemHoldS?: number
  symptoms: Symptoms
  patientNote?: string
  tier: PoseTier
}

export interface TriageCard {
  sessionId: string
  recommendation: Recommendation
  route: "surgeon_on_call" | "primary_care" | "care_coordinator" | "physical_therapy" | null
  ruleFired: string
  observation?: { observation: string; compensations: string[]; steadiness: string; uncertainty: string; demoData: boolean }
  careTeamNote?: string
  evidenceFrameUrls: string[]
  warnings: string[]
}

export interface OverrideLogEntry {
  setting: string
  oldValue: unknown
  newValue: unknown
  reasonCode: string
  freeText?: string
  user: string
  at: string
}
