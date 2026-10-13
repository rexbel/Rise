"use client"

import Link from "next/link"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { Button } from "@/components/ui/button"
import { LobbyStage } from "@/components/play/LobbyStage"
import { playBody, playDisplay, ptCta } from "@/components/play/playTheme"
import { cn } from "@/lib/utils"
import ui from "@/content/play-ui.json"
import { sceneFor, type LobbyScene } from "@/lib/play/lobbyScene"

/** Re-check once a minute so a lobby left open switches at dusk and dawn. */
function subscribeMinute(onChange: () => void) {
  const id = window.setInterval(onChange, 60_000)
  return () => window.clearInterval(id)
}

/** ?scene=gym|rooftops overrides the clock (handy for a daytime pitch of the night scene). */
function currentScene(): LobbyScene {
  const forced = new URLSearchParams(window.location.search).get("scene")
  return forced === "gym" || forced === "rooftops" ? forced : sceneFor(new Date())
}

/** Chrome colors per scene: dark text on the bright gym, light text on the night sky. */
const CHROME: Record<LobbyScene, { main: string; ink: string; demo: string; ring: string }> = {
  gym: {
    main: "bg-[#F3EEE6] text-[var(--rn-ink)]",
    ink: "text-[var(--rn-ink)]",
    demo: "border-2 border-[var(--rn-ink)]/40 bg-white/90 text-[var(--rn-ink)] hover:bg-white focus-visible:ring-[var(--rn-ink)] focus-visible:ring-offset-[#F3EEE6]",
    ring: "focus-visible:ring-[var(--rn-ink)] focus-visible:ring-offset-[#F3EEE6]",
  },
  rooftops: {
    main: "bg-[#2B3554] text-white",
    ink: "text-white",
    demo: "border-2 border-white/60 bg-[#1F2742]/90 text-white hover:bg-[#1F2742] focus-visible:ring-white focus-visible:ring-offset-[#2B3554]",
    ring: "focus-visible:ring-white focus-visible:ring-offset-[#2B3554]",
  },
}

/** Medic ninja mark: black hood, green band with a white cross, blue mask, white coat collar. Same art as app/icon.svg. */
function NinjaMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" aria-hidden>
      <circle cx="20" cy="20" r="19.5" fill="#ffffff" stroke="#111111" />
      <path d="M3 26 Q3 4 20 4 Q37 4 37 26 Z" fill="#111111" />
      <rect x="3" y="11" width="34" height="5" fill="#1D9E75" />
      <path d="M18 13.5 H22 M20 11.6 V15.4" stroke="#ffffff" strokeWidth="1.4" />
      <circle cx="26" cy="20" r="2.6" fill="#ffffff" />
      <path d="M9 23 H33 Q32 30 20 30 Q10 30 9 23 Z" fill="#85B7EB" />
      <path d="M12 32 L20 38 L28 32" stroke="#D3D1C7" strokeWidth="1.2" />
    </svg>
  )
}

/** Centered sky chrome; continuous ninja stage below. */
export function GameLobby() {
  const chromeRef = useRef<HTMLDivElement>(null)
  const [topReserve, setTopReserve] = useState(280)
  // Server and first paint use the gym; the client switches to the right scene right after hydration.
  const scene = useSyncExternalStore(subscribeMinute, currentScene, () => "gym" as LobbyScene)
  const c = CHROME[scene]

  useEffect(() => {
    const el = chromeRef.current
    if (!el) return
    const measure = () => setTopReserve(Math.ceil(el.getBoundingClientRect().height) + 24)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <main
      className={`relative min-h-full flex-1 overflow-hidden ${c.main} ${playBody.className}`}
      data-scene={scene}
    >
      <LobbyStage topReserve={topReserve} bottomReserve={0} scene={scene} />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center px-5 pt-8 sm:pt-10">
        <div
          ref={chromeRef}
          className="pointer-events-auto flex w-full max-w-sm flex-col items-center gap-4 text-center"
        >
          <div className="flex flex-col items-center gap-3">
            <NinjaMark className="size-14 drop-shadow-sm sm:size-16" />
            <h1
              className={`${playDisplay.className} text-4xl font-extrabold tracking-tight ${c.ink} sm:text-5xl`}
            >
              RehabNinja
            </h1>
            <p className={`max-w-xs text-xl font-semibold leading-snug ${c.ink}`}>
              {ui.lobby.tagline}
            </p>
          </div>

          <div className="flex w-full flex-col gap-2.5">
            <Button
              asChild
              size="lg"
              className={cn(ptCta, playDisplay.className, "shadow-md", c.ring)}
            >
              <Link href="/play">{ui.lobby.play}</Link>
            </Button>
            <Button
              asChild
              size="lg"
              className={cn(ptCta, c.demo)}
            >
              <Link href="/play/rise-01?demo=1">{ui.lobby.pitch_demo}</Link>
            </Button>
          </div>

          <nav className="pt-1 text-xl">
            <Link
              href="/clinic"
              className={cn("inline-flex min-h-11 items-center rounded-md px-2 underline underline-offset-4 outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--rn-orange)]", c.ink)}
            >
              Clinic
            </Link>
          </nav>
        </div>
      </div>
    </main>
  )
}
