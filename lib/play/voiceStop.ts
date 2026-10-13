/**
 * Optional spoken Stop. Off by default and off in ?demo=1.
 * Recognition is aborted while TTS is playing so the coach saying "Stop" does not pause.
 */

import { isSpeaking, subscribeSpeaking } from "@/lib/play/speak"

type Rec = {
  abort: () => void
  start: () => void
  stop: () => void
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((ev: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void) | null
  onend: (() => void) | null
}

function getRecCtor(): (new () => Rec) | null {
  if (typeof window === "undefined") return null
  const w = window as Window & { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

let rec: Rec | null = null
let wanted = false
let onStop: (() => void) | null = null
let unsub: (() => void) | null = null
let starting = false

function matchesStop(text: string): boolean {
  const t = text.toLowerCase()
  return t.includes("stop") || t.includes("pause")
}

function stopRec() {
  try {
    rec?.abort()
  } catch {
    /* ignore */
  }
}

function startRec() {
  if (!wanted || isSpeaking() || !rec || starting) return
  starting = true
  try {
    rec.start()
  } catch {
    /* already started */
  }
  starting = false
}

export function setVoiceStopEnabled(enabled: boolean, handler: (() => void) | null): void {
  wanted = enabled
  onStop = handler
  const Ctor = getRecCtor()
  if (!enabled || !Ctor) {
    stopRec()
    rec = null
    unsub?.()
    unsub = null
    return
  }
  if (!rec) {
    rec = new Ctor()
    rec.continuous = true
    rec.interimResults = false
    rec.lang = "en-US"
    rec.onresult = (ev) => {
      if (isSpeaking()) return
      const said = ev.results[0]?.[0]?.transcript ?? ""
      if (matchesStop(said)) onStop?.()
    }
    rec.onend = () => {
      if (wanted && !isSpeaking()) startRec()
    }
  }
  if (!unsub) {
    unsub = subscribeSpeaking((speaking) => {
      if (speaking) stopRec()
      else startRec()
    })
  }
  startRec()
}
