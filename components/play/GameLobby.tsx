"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

/** Full-viewport Keep the Line entry — one CTA, not a three-button toolkit menu. */
export function GameLobby() {
  return (
    <main className="relative flex min-h-full flex-1 flex-col overflow-hidden bg-[#0a0a0c] text-zinc-50">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_#1c1917_0%,_#0a0a0c_65%)]" />
        <div className="lobby-rails absolute inset-x-[18%] top-[12%] bottom-[18%] border-x-2 border-zinc-100/25" />
        <div className="lobby-pulse absolute left-1/2 top-[22%] size-40 -translate-x-1/2 rounded-full border border-emerald-400/30" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/80 to-transparent" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-8 px-6 py-16">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium tracking-wide text-orange-400">Rise · Keep the Line</p>
          <Badge className="border-0 bg-orange-500 text-white hover:bg-orange-500">Live play</Badge>
          <Badge variant="secondary" className="bg-zinc-800 text-zinc-300">
            Synthetic data
          </Badge>
        </div>

        <div className="space-y-4">
          <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">Keep the Line</h1>
          <p className="max-w-md text-xl leading-snug text-zinc-400">
            Mirror the ghost. Score hits when your knee stays over your foot. Misses flash on the joint — like a
            rhythm game for rehab.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            asChild
            size="lg"
            className="h-16 min-h-16 flex-1 bg-orange-500 text-xl text-white hover:bg-orange-400 sm:flex-none sm:px-10"
          >
            <Link href="/play/rise-01?demo=1">Play Ellen demo</Link>
          </Button>
          <p className="text-sm text-zinc-500">Begin unlocks sound · captions always on</p>
        </div>

        <nav className="flex flex-wrap gap-x-5 gap-y-2 border-t border-zinc-800 pt-6 text-sm text-zinc-500">
          <Link href="/play" className="hover:text-zinc-300">
            All patients
          </Link>
          <Link href="/clinic" className="hover:text-zinc-300">
            Clinic console
          </Link>
          <Link href="/p/rise-01" className="hover:text-zinc-300">
            STEADI phone (Ellen)
          </Link>
        </nav>
      </div>
    </main>
  )
}
