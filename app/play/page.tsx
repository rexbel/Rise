"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { playBody, playDisplay } from "@/components/play/playTheme"
import ui from "@/content/play-ui.json"
import { patients } from "@/lib/seed"

/** Journey step 1 — who is playing. */
export default function PlayPickerPage() {
  return (
    <main
      className={`mx-auto flex min-h-full w-full max-w-lg flex-1 flex-col gap-6 bg-[#0c0a09] px-4 py-10 text-zinc-50 ${playBody.className}`}
    >
      <div>
        <p className="text-sm font-semibold tracking-wide text-orange-400">{ui.brand}</p>
        <h1 className={`${playDisplay.className} mt-2 text-3xl font-extrabold tracking-tight`}>
          {ui.picker.title}
        </h1>
        <p className="mt-2 text-lg text-zinc-400">{ui.picker.body}</p>
      </div>
      <ul className="flex flex-col gap-3">
        {patients.map((p) => {
          const first = p.display_name.split(" ")[0]
          return (
            <li key={p.rise_id}>
              <Link
                href={`/play/${p.rise_id}`}
                className="flex min-h-16 items-center justify-between gap-3 rounded-2xl border border-zinc-700 bg-zinc-950 px-5 py-5 text-lg transition-colors hover:border-orange-500 hover:bg-zinc-900"
              >
                <span>
                  <span className={`${playDisplay.className} block text-xl font-bold text-zinc-50`}>
                    {first}
                  </span>
                  <span className="mt-1 block text-base text-zinc-400">
                    {p.episode.procedure} · day {p.episode.post_op_day_today}
                  </span>
                </span>
                <span className="shrink-0 text-orange-400">Play →</span>
              </Link>
            </li>
          )
        })}
      </ul>
      <Button asChild variant="outline" className="h-12 border-zinc-700 bg-transparent text-zinc-200">
        <Link href="/">Back</Link>
      </Button>
    </main>
  )
}
