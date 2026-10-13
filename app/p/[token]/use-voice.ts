"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import voice from "@/content/voice-lines.json"

const TEXT: Record<string, string> = Object.fromEntries(voice.lines.map((l) => [l.id, l.text]))

/** Reading time for a caption when the mp3 is missing or blocked. */
const readMs = (text: string) => Math.max(1400, text.split(/\s+/).length * 380)

/**
 * Voice coach: plays public/voice/<id>.mp3 (pre-rendered by `npm run voice`) and always shows the caption.
 * If the mp3 is missing or autoplay is blocked, the caption stays up for its reading time instead.
 * `say` resolves when the line has finished, so steps can be sequenced with await.
 */
export function useVoice() {
  const audio = useRef<HTMLAudioElement | null>(null)
  const gen = useRef(0)
  const [caption, setCaption] = useState("")
  const [muted, setMuted] = useState(false)

  useEffect(() => () => audio.current?.pause(), [])

  /** `caption: false` plays audio only (e.g. spoken stand counts: no number ever appears on the phone). */
  const say = useCallback(
    (id: string, text = TEXT[id] ?? "", opts: { caption?: boolean } = {}) =>
      new Promise<void>((resolve) => {
        const my = ++gen.current
        const showCaption = opts.caption !== false
        if (showCaption) setCaption(text)
        const a = (audio.current ??= new Audio())
        a.pause()
        let settled = false
        const done = () => {
          if (settled) return
          settled = true
          a.onended = a.onerror = null
          resolve()
        }
        const fallback = () => (showCaption ? setTimeout(done, readMs(text)) : done())
        if (muted) return fallback()
        a.src = `/voice/${id}.mp3`
        a.onended = done
        a.onerror = fallback
        a.play().catch(fallback)
        // A newer line interrupts this one.
        const check = setInterval(() => {
          if (gen.current !== my) {
            clearInterval(check)
            done()
          } else if (settled) clearInterval(check)
        }, 200)
      }),
    [muted],
  )

  const stop = useCallback(() => {
    gen.current++
    audio.current?.pause()
  }, [])

  return { say, stop, caption, setCaption, muted, setMuted, text: (id: string) => TEXT[id] ?? "" }
}
