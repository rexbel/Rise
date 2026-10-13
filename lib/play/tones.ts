import { getAudioContext } from "@/lib/play/speak"

/** Fixed pitches — never scaled by stand count. */
const PATH_HZ = 440
const BEND_HZ = 220
const STOP_HZ = 165
const HIT_HZ = 523
const MISS_HZ = 196

export type ToneKind = "path" | "bend" | "stop" | "hit" | "miss"

export function playTone(kind: ToneKind): void {
  const ctx = getAudioContext()
  if (!ctx) return
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  const freq =
    kind === "path"
      ? PATH_HZ
      : kind === "bend"
        ? BEND_HZ
        : kind === "hit"
          ? HIT_HZ
          : kind === "miss"
            ? MISS_HZ
            : STOP_HZ
  osc.frequency.value = freq
  osc.type = kind === "hit" ? "triangle" : "sine"
  const now = ctx.currentTime
  const peak = kind === "hit" ? 0.1 : kind === "miss" ? 0.09 : 0.08
  const dur = kind === "hit" ? 0.22 : 0.2
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(peak, now + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur)
  osc.start(now)
  osc.stop(now + dur + 0.02)
}
