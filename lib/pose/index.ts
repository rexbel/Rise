/**
 * DAY-OF: one interface, four tiers (plan §6). Pick with a 3 s benchmark on the setup screen:
 * keep YOLO only at >= 15 fps; else MediaPipe (preloaded). Mid-test swap to MediaPipe if YOLO < 12 fps for 2 s.
 * Thresholds: config/protocol.default.json -> pose.
 */
import type { Keypoints17, PoseTier } from "@/lib/types"

export interface PoseEstimator {
  tier: PoseTier
  load(): Promise<void>
  /** Returns 17 COCO keypoints for the largest person, or null if none. */
  estimate(frame: HTMLVideoElement): Promise<Keypoints17 | null>
  dispose(): void
}

// Tier modules to write day-of:
//   yolo-onnx.ts   onnxruntime-web (WebGPU -> WASM), public/models/pose.onnx (scripts/export_pose_onnx.py)
//   mediapipe.ts   @mediapipe/tasks-vision PoseLandmarker, map 33 -> 17 COCO points
//   remote.ts      WebSocket frames to services/rise-pose through the tunnel
//   seeded.ts      replay a recorded fixture (fixtures/<riseId>-<variant>.json) through the same counter; "Demo data" badge
