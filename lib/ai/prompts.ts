/** Prompt builders only. No provider calls here. */
import type { CosmosSecondLookRequest, CosmosTrigger } from "@/lib/types"

/** What YOLO's trigger means, in words Cosmos can check against the frames. */
const TRIGGER_MEANING: Record<CosmosTrigger, string> = {
  valgus: "a knee moved inward past the foot (knee valgus) during the movement",
  speed: "the movement was faster than the controlled tempo for this exercise",
  arms: "the hands left the chest and pushed off the chair or thighs to help stand",
  asymmetry: "weight shifted noticeably onto one leg",
  tracking_lost: "the body left the camera frame or could no longer be tracked",
}

const EXERCISE_NAME: Record<string, string> = {
  sit_to_stand: "chair sit-to-stand",
  mini_squat: "mini squat",
  single_leg_balance: "single-leg balance",
}

export const SECOND_LOOK_SYSTEM = [
  "You review short camera clips from a home rehab session after knee or hip surgery, for the care team.",
  "An on-device pose tracker (YOLO) already flagged a possible form problem. Your job is a second look:",
  "say whether the frames show what the tracker flagged, describe the movement briefly and concretely,",
  "and flag any moment that looks unsafe (near-fall, loss of balance, grabbing for support).",
  "You do not diagnose, score, or recommend treatment. Describe only what is visible.",
].join(" ")

export function secondLookPrompt(req: Pick<CosmosSecondLookRequest, "trigger" | "exerciseId" | "atMs" | "frames" | "frameSpanMs" | "yolo">): string {
  const exercise = EXERCISE_NAME[req.exerciseId] ?? req.exerciseId.replace(/_/g, " ")
  const spacing = req.frames.length > 1 ? Math.round(req.frameSpanMs / (req.frames.length - 1)) : 0
  return [
    `Exercise: ${exercise}.`,
    `The ${req.frames.length} images are consecutive camera frames, oldest first, about ${spacing} ms apart, ending ${(req.atMs / 1000).toFixed(1)} s into the set.`,
    `The pose tracker flagged that ${TRIGGER_MEANING[req.trigger]}.`,
    `Tracker context: ${req.yolo.hitCount} clean reps so far${req.yolo.targetReps ? ` of ${req.yolo.targetReps}` : ""}; tracking ${req.yolo.trackingOk ? "ok" : "lost"}.`,
    "",
    "Reply with only a JSON object, no other text:",
    '{"verdict": "confirms" | "disagrees" | "unclear",',
    ' "observation": one or two plain sentences on what the person does in these frames,',
    ' "compensations": short phrases for any compensations you see (empty array if none),',
    ' "steadiness": "steady" | "unsteady" | "unclear",',
    ' "safetyConcern": true only if the frames show a near-fall, loss of balance, or grabbing for support,',
    ' "uncertainty": what limits your view (blur, angle, occlusion), or "none"}',
  ].join("\n")
}
