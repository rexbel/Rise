"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { LobbyStage } from "@/components/play/LobbyStage"
import { playBody, playDisplay } from "@/components/play/playTheme"
import ui from "@/content/play-ui.json"

function NinjaMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" aria-hidden>
      <circle cx="20" cy="20" r="20" fill="#0a0a0c" />
      <rect x="8" y="14" width="24" height="5" rx="1" fill="#f97316" />
      <path d="M8 14 L3 10 L6 18 Z" fill="#f97316" />
      <path d="M8 16 L4 22 L10 18 Z" fill="#f97316" />
      <circle cx="26" cy="22" r="2.5" fill="white" />
    </svg>
  )
}

/** Centered sky chrome; continuous ninja stage below. */
export function GameLobby() {
  const chromeRef = useRef<HTMLDivElement>(null)
  const [topReserve, setTopReserve] = useState(280)

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
      className={`relative min-h-full flex-1 overflow-hidden bg-[#FEF1E1] text-zinc-900 ${playBody.className}`}
    >
      <LobbyStage topReserve={topReserve} bottomReserve={0} />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center px-5 pt-8 sm:pt-10">
        <div
          ref={chromeRef}
          className="pointer-events-auto flex w-full max-w-sm flex-col items-center gap-4 text-center"
        >
          <div className="flex flex-col items-center gap-3">
            <NinjaMark className="size-14 drop-shadow-sm sm:size-16" />
            <h1
              className={`${playDisplay.className} text-4xl font-extrabold tracking-tight text-zinc-900 sm:text-5xl`}
            >
              RehabNinja
            </h1>
            <p className="max-w-xs text-base font-semibold leading-snug text-zinc-700 sm:text-lg">
              {ui.lobby.tagline}
            </p>
          </div>

          <div className="flex w-full flex-col gap-2.5">
            <Button
              asChild
              size="lg"
              className={`${playDisplay.className} h-14 min-h-14 w-full bg-orange-500 text-lg font-bold text-white shadow-md hover:bg-orange-400`}
            >
              <Link href="/play">{ui.lobby.play}</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className={`${playBody.className} h-12 min-h-12 w-full border-zinc-800/35 bg-white/90 text-base font-semibold text-zinc-900 hover:bg-white`}
            >
              <Link href="/play/rise-01?demo=1">{ui.lobby.pitch_demo}</Link>
            </Button>
          </div>

          <nav className="pt-1 text-xs text-zinc-500">
            <Link href="/clinic" className="underline-offset-2 hover:text-zinc-800 hover:underline">
              Clinic
            </Link>
          </nav>
        </div>
      </div>
    </main>
  )
}
