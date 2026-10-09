/**
 * Browser speech for locked strings only. Captions are the source of truth if audio is muted.
 * No microphone. Voice recognition is not started here.
 */

export type CaptionListener = (text: string | null) => void
export type SpeakingListener = (speaking: boolean) => void

let audioCtx: AudioContext | null = null
let speaking = false
let caption: string | null = null
const captionListeners = new Set<CaptionListener>()
const speakingListeners = new Set<SpeakingListener>()
let voicesReady: Promise<void> | null = null

function emitCaption(text: string | null) {
  caption = text
  for (const l of captionListeners) l(text)
}

function emitSpeaking(value: boolean) {
  speaking = value
  for (const l of speakingListeners) l(value)
}

function waitForVoices(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve()
  const synth = window.speechSynthesis
  if (synth.getVoices().length > 0) return Promise.resolve()
  if (!voicesReady) {
    voicesReady = new Promise((resolve) => {
      const done = () => {
        synth.removeEventListener("voiceschanged", done)
        resolve()
      }
      synth.addEventListener("voiceschanged", done)
      window.setTimeout(done, 500)
    })
  }
  return voicesReady
}

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices()
  return voices.find((v) => v.lang.toLowerCase().startsWith("en")) ?? voices[0]
}

/** User-gesture unlock: AudioContext + speechSynthesis. */
export function getAudioContext(): AudioContext | null {
  return audioCtx
}

export function unlockPlayback(): void {
  if (typeof window === "undefined") return
  if (!audioCtx) audioCtx = new AudioContext()
  void audioCtx.resume()
  window.speechSynthesis.cancel()
  const prime = new SpeechSynthesisUtterance(" ")
  prime.volume = 0
  window.speechSynthesis.speak(prime)
  void waitForVoices()
}

export function speak(text: string): void {
  if (typeof window === "undefined") return
  cancel()
  emitCaption(text)
  const utter = new SpeechSynthesisUtterance(text)
  utter.onstart = () => emitSpeaking(true)
  utter.onend = () => emitSpeaking(false)
  utter.onerror = () => emitSpeaking(false)
  void waitForVoices().then(() => {
    const voice = pickVoice()
    if (voice) utter.voice = voice
    window.speechSynthesis.speak(utter)
  })
}

export function cancel(): void {
  if (typeof window === "undefined") return
  window.speechSynthesis.cancel()
  emitSpeaking(false)
}

export function isSpeaking(): boolean {
  return speaking
}

export function currentCaption(): string | null {
  return caption
}

export function subscribeCaption(listener: CaptionListener): () => void {
  captionListeners.add(listener)
  listener(caption)
  return () => captionListeners.delete(listener)
}

export function subscribeSpeaking(listener: SpeakingListener): () => void {
  speakingListeners.add(listener)
  listener(speaking)
  return () => speakingListeners.delete(listener)
}
