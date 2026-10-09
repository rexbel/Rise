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

/* ---------- Live session contracts (plan §6b) ----------
 * Shared by rex/pose and jeremiah/vast. Change only by PR to main; the other person rebases right away.
 * Every payload that crosses the network is a Zod schema so the receiving route can .parse() it.
 *
 *   Phone  -> POST /api/sessions/[id]/events   RepEvent           (Rex sends, Jeremiah serves)
 *   Phone  -> POST /api/sessions/[id]/clip     multipart clip     -> ClipRef
 *   Phone  -> POST /api/sessions/[id]/result   SessionResult      -> TriageCard (rules -> Cosmos -> agent)
 *   Server -> GET  /api/sessions/stream        SSE of SessionSnapshot
 *   Console-> GET  /api/search?q=              SearchHit[]
 */

export const PoseTier = z.enum(["yolo-onnx", "mediapipe", "remote-yolo", "seeded"])
export type PoseTier = z.infer<typeof PoseTier>

/** One keypoint: [x, y, confidence], x and y normalized 0..1 to the video frame. */
export const Keypoint = z.tuple([z.number(), z.number(), z.number()])
/** 17 COCO keypoints (nose, eyes, ears, shoulders, elbows, wrists, hips, knees, ankles). */
export const Keypoints17 = z.array(Keypoint).length(17)
export type Keypoints17 = z.infer<typeof Keypoints17>

export const SessionStatus = z.enum(["invited", "setting_up", "testing", "paused", "questions", "scoring", "ready", "needs_confirmation"])
export type SessionStatus = z.infer<typeof SessionStatus>

/** Epoch ms. */
const At = z.number().int().nonnegative()

export const RepEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("status"), sessionId: z.string(), status: SessionStatus, tier: PoseTier.optional(), at: At }),
  z.object({ type: z.literal("rep"), sessionId: z.string(), count: z.number().int().min(0), armsUsed: z.boolean(), at: At }),
  /** Tier changed mid-test (e.g. YOLO under 12 fps for 2 s -> MediaPipe). Count and timer carry on. */
  z.object({ type: z.literal("tier"), sessionId: z.string(), tier: PoseTier, fps: z.number(), at: At }),
  z.object({ type: z.literal("stop"), sessionId: z.string(), reason: z.enum(["button", "no_stand"]), at: At }),
  z.object({ type: z.literal("resume"), sessionId: z.string(), at: At }),
  z.object({ type: z.literal("finished_early"), sessionId: z.string(), at: At }),
  /** Downsampled keypoint stream, batched (about 5 per second; config pose.upload_keypoints_hz). */
  z.object({ type: z.literal("keypoints"), sessionId: z.string(), frames: z.array(z.object({ t: At, kp: Keypoints17 })), at: At }),
])
export type RepEvent = z.infer<typeof RepEvent>

/** What the phone knows when the test and questions are done. Rex owns this shape. */
export const SessionResult = z.object({
  sessionId: z.string(),
  riseId: z.string(),
  /** Full stands in 30 s, including arm-assisted ones and a final stand past halfway. */
  rawStands: z.number().int().min(0),
  armsUsed: z.boolean(),
  /** 1-based rep where arms were first used, if any. */
  armsFromRep: z.number().int().min(1).optional(),
  /** CDC rule: 0 if arms were used, else rawStands. */
  steadiScore: z.number().int().min(0),
  /** Left/right knee-angle asymmetry, percent of weight shifted off one leg. */
  asymmetryPct: z.number().min(0),
  favoring: z.enum(["left", "right"]).nullable(),
  /** Pauses longer than thresholds.orthostatic_pause_s after reaching full stand. */
  pausesOver3s: z.number().int().min(0),
  stoppedEarly: z.boolean(),
  /** Patient chose "Keep going" after a pause (logged on the card, not a stop). */
  resumedAfterPause: z.boolean(),
  tandemHoldS: z.number().min(0).optional(),
  gaitObservations: z.array(z.string()).default([]),
  symptoms: Symptoms,
  patientNote: z.string().max(2000).optional(),
  tier: PoseTier,
  /** True when any part came from a seeded fallback; shows the "Demo data" badge. */
  demoData: z.boolean(),
  startedAt: At,
  finishedAt: At,
})
export type SessionResult = z.infer<typeof SessionResult>

export const Route = z.enum(["surgeon_on_call", "primary_care", "care_coordinator", "physical_therapy"])
export type Route = z.infer<typeof Route>

/** What lib/rules.ts decides. Deterministic; no model can change it. */
export const TriageDecision = z.object({
  recommendation: Recommendation,
  route: Route.nullable(),
  /** Rule name from lib/rules.ts, e.g. "red_flag", "decline", "on_track". */
  ruleFired: z.string(),
  /** Short human-readable reasons, e.g. "3 stands vs 5 last time", "arms used from rep 2". */
  reasons: z.array(z.string()),
  /** True when the phone must show the emergency screen (red flag). */
  emergency: z.boolean(),
})
export type TriageDecision = z.infer<typeof TriageDecision>

export const CosmosObservation = z.object({
  observation: z.string(),
  compensations: z.array(z.string()),
  steadiness: z.string(),
  uncertainty: z.string(),
  demoData: z.boolean(),
})
export type CosmosObservation = z.infer<typeof CosmosObservation>

/**
 * Cosmos second look on a YOLO event (RehabNinja live play). YOLO detects on-device; Cosmos verifies from a
 * short frame window. Care-team only: never patient-facing, never changes hits, bombs, or the recommendation.
 */
export const CosmosTrigger = z.enum(["valgus", "speed", "arms", "asymmetry", "tracking_lost"])
export type CosmosTrigger = z.infer<typeof CosmosTrigger>

export const CosmosSecondLook = z.object({
  /** Does Cosmos see what YOLO flagged? */
  verdict: z.enum(["confirms", "disagrees", "unclear"]),
  observation: z.string().min(1).max(400),
  compensations: z.array(z.string().max(120)).max(6),
  steadiness: z.enum(["steady", "unsteady", "unclear"]),
  /** Fall risk or other unsafe moment: the console asks a human to look. */
  safetyConcern: z.boolean(),
  uncertainty: z.string().max(200),
})
export type CosmosSecondLook = z.infer<typeof CosmosSecondLook>

/** What the route returns: the look plus provenance. */
export const CosmosSecondLookResult = CosmosSecondLook.extend({
  model: z.string(),
  latencyMs: z.number().int().nonnegative(),
  /** True when the fallback template answered instead of Cosmos. */
  demoData: z.boolean(),
})
export type CosmosSecondLookResult = z.infer<typeof CosmosSecondLookResult>

const JPEG_DATA_URL = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/
/** ~200 KB of JPEG is ~270k base64 chars. */
const MAX_FRAME_CHARS = 280_000

/** Browser -> POST /api/cosmos/second-look. Frames are never stored or logged. */
export const CosmosSecondLookRequest = z.object({
  sessionId: z.string().min(1).max(80),
  riseId: z.string().min(1).max(40),
  exerciseId: z.string().min(1).max(40),
  trigger: CosmosTrigger,
  severity: z.enum(["soft", "hard"]).optional(),
  /** ms into the set when YOLO fired. */
  atMs: z.number().nonnegative(),
  yolo: z.object({
    hitCount: z.number().int().nonnegative(),
    targetReps: z.number().int().nonnegative().optional(),
    trackingOk: z.boolean(),
    tier: z.string().max(40).nullable(),
  }),
  /** Oldest first, evenly spaced over the last ~2 s. */
  frames: z.array(z.string().max(MAX_FRAME_CHARS).regex(JPEG_DATA_URL)).min(1).max(6),
  frameSpanMs: z.number().int().nonnegative(),
})
export type CosmosSecondLookRequest = z.infer<typeof CosmosSecondLookRequest>

/** Pointer to a stored session clip. Jeremiah owns this shape. */
export const ClipRef = z.object({
  sessionId: z.string(),
  riseId: z.string(),
  store: z.enum(["vast", "local"]),
  /** VAST object id, or a path under the local fallback dir. */
  key: z.string(),
  /** URL the console can play (may be a local /api route). */
  url: z.string(),
  mimeType: z.string(),
  durationMs: z.number().int().nonnegative(),
  uploadedAt: At,
  demoData: z.boolean(),
})
export type ClipRef = z.infer<typeof ClipRef>

/** One semantic-search match: a moment inside a clip. Jeremiah owns this shape. */
export const SearchHit = z.object({
  riseId: z.string(),
  sessionId: z.string(),
  clip: ClipRef,
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  label: z.string(),
  score: z.number(),
  thumbnailUrl: z.string().optional(),
  /** True when served from pre-indexed seed moments. */
  demoData: z.boolean(),
})
export type SearchHit = z.infer<typeof SearchHit>

export const ApprovalState = z.enum(["pending", "approved", "edited", "downgraded"])
export type ApprovalState = z.infer<typeof ApprovalState>

/** The console's triage card (C3). Built server-side from SessionResult + TriageDecision + Cosmos + agent. */
export const TriageCard = TriageDecision.extend({
  sessionId: z.string(),
  riseId: z.string(),
  metrics: z.object({
    rawStands: z.number().int(),
    steadiScore: z.number().int(),
    previousRawStands: z.number().int().nullable(),
    previousSteadiScore: z.number().int().nullable(),
    /** CDC below-average cutoff for the patient's age and sex, or null outside 60-94. */
    cdcCutoff: z.number().int().nullable(),
    armsUsed: z.boolean(),
    armsFromRep: z.number().int().optional(),
    asymmetryPct: z.number(),
    pausesOver3s: z.number().int(),
    tandemHoldS: z.number().optional(),
  }),
  symptoms: Symptoms,
  patientNote: z.string().optional(),
  /** Phrase screen hit on the patient note ("chest pain", "fell", ...) -> amber "Note needs review". */
  noteNeedsReview: z.boolean(),
  observation: CosmosObservation.optional(),
  careTeamNote: z.string().optional(),
  clip: ClipRef.optional(),
  evidenceFrameUrls: z.array(z.string()),
  tier: PoseTier,
  approval: ApprovalState,
  warnings: z.array(z.string()),
  demoData: z.boolean(),
})
export type TriageCard = z.infer<typeof TriageCard>

/** One tile on the live board (C2), pushed over SSE on every change. */
export const SessionSnapshot = z.object({
  sessionId: z.string(),
  riseId: z.string(),
  status: SessionStatus,
  count: z.number().int().min(0),
  armsUsed: z.boolean(),
  tier: PoseTier.nullable(),
  card: TriageCard.optional(),
  updatedAt: At,
  demoData: z.boolean(),
})
export type SessionSnapshot = z.infer<typeof SessionSnapshot>

export interface OverrideLogEntry {
  setting: string
  oldValue: unknown
  newValue: unknown
  reasonCode: string
  freeText?: string
  user: string
  at: string
}
