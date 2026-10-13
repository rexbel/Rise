/**
 * Speech for locked strings only. Captions are the source of truth if audio is muted.
 * Plays the pre-rendered ElevenLabs line from public/voice/play (manifest written by `npm run voice`)
 * when one exists for the exact text; otherwise falls back to the browser's speechSynthesis.
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
let manifest: Record<string, string> | null = null
let manifestLoad: Promise<void> | null = null
let clip: HTMLAudioElement | null = null
/** Bumped by every speak/cancel so a line whose manifest lookup finishes late never plays. */
let gen = 0

/** text -> file in /voice/play. Loaded once; a missing manifest just means browser speech. */
function loadManifest(): Promise<void> {
  if (!manifestLoad) {
    manifestLoad = fetch("/voice/play/manifest.json")
      .then((r) => (r.ok ? r.json() : {}))
      .then((m: Record<string, string>) => void (manifest = m))
      .catch(() => void (manifest = {}))
  }
  return manifestLoad
}

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
  void loadManifest()
}

function speakWithBrowser(text: string) {
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

export function speak(text: string): void {
  if (typeof window === "undefined") return
  cancel()
  const my = gen
  emitCaption(text)
  void loadManifest().then(() => {
    // A newer line (or cancel) took over while the manifest loaded.
    if (my !== gen) return
    const file = manifest?.[text]
    if (!file) return speakWithBrowser(text)
    const a = new Audio(`/voice/play/${file}`)
    clip = a
    a.onplay = () => emitSpeaking(true)
    a.onended = () => {
      if (clip === a) clip = null
      emitSpeaking(false)
    }
    a.onerror = () => {
      if (clip === a) clip = null
      speakWithBrowser(text)
    }
    a.play().catch(() => {
      if (clip === a) clip = null
      speakWithBrowser(text)
    })
  })
}

export function cancel(): void {
  if (typeof window === "undefined") return
  gen++
  window.speechSynthesis.cancel()
  if (clip) {
    clip.onended = clip.onerror = null
    clip.pause()
    clip = null
  }
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
