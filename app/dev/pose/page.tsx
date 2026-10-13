import type { Metadata } from "next"
import { PoseBench } from "./pose-bench"

export const metadata: Metadata = { title: "Pose benchmark · Rise dev" }

/** Pre-event fps benchmark (plan §7, PREFLIGHT). Open through the tunnel on the phone, whole body in frame. */
export default function PoseBenchPage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-semibold">Pose benchmark</h1>
      <p className="text-muted-foreground">
        Prop the phone side-on at floor level with your whole body in frame, then run the benchmark. YOLO is kept only at 15 fps or more; otherwise
        MediaPipe is the default tier.
      </p>
      <PoseBench />
    </main>
  )
}
