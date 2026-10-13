/**
 * Tier 2: MediaPipe Pose Landmarker (lite) on the phone. 33 landmarks mapped to the same 17 COCO points
 * as YOLO, so the counter never knows which tier ran. Client-only.
 */
import type { PoseLandmarker } from "@mediapipe/tasks-vision"
import type { Keypoints17 } from "@/lib/types"
import type { PoseEstimator } from "@/lib/pose"

const MP_VERSION = "1.1.0"
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"

/** COCO index -> MediaPipe landmark index. */
const COCO_FROM_MP = [0, 2, 5, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]

export class MediaPipeEstimator implements PoseEstimator {
  readonly tier = "mediapipe" as const
  delegate: "GPU" | "CPU" | null = null
  private landmarker: PoseLandmarker | null = null
  private lastTs = 0

  async load() {
    const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision")
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
    for (const delegate of ["GPU", "CPU"] as const) {
      try {
        this.landmarker = await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          runningMode: "VIDEO",
          numPoses: 1,
        })
        this.delegate = delegate
        return
      } catch (e) {
        if (delegate === "CPU") throw e
      }
    }
  }

  async estimate(frame: HTMLVideoElement): Promise<Keypoints17 | null> {
    if (!this.landmarker || !frame.videoWidth) return null
    // detectForVideo needs strictly increasing timestamps.
    const ts = Math.max(performance.now(), this.lastTs + 1)
    this.lastTs = ts
    const lm = this.landmarker.detectForVideo(frame, ts).landmarks[0]
    if (!lm) return null
    return COCO_FROM_MP.map((i) => [lm[i].x, lm[i].y, lm[i].visibility ?? 1])
  }

  dispose() {
    this.landmarker?.close()
    this.landmarker = null
  }
}
