import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import ui from "@/content/play-ui.json"
import { patients } from "@/lib/seed"

/** Journey step 1 — who is playing (synthetic profiles only). */
export default function PlayPickerPage() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-lg flex-col gap-6 bg-[#0a0a0c] px-4 py-10 text-zinc-50">
      <div>
        <p className="text-sm font-medium tracking-wide text-orange-400">{ui.brand}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{ui.picker.title}</h1>
        <p className="mt-2 text-lg text-zinc-400">{ui.picker.body}</p>
      </div>
      <ul className="flex flex-col gap-3">
        {patients.map((p) => {
          const first = p.display_name.split(" ")[0]
          return (
            <li key={p.rise_id}>
              <Link
                href={`/play/${p.rise_id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-4 text-lg transition-colors hover:border-orange-500/50 hover:bg-zinc-900"
              >
                <span>
                  <span className="font-medium text-zinc-50">{first}</span>
                  <span className="mt-1 block text-base text-zinc-400">
                    {p.episode.procedure} · day {p.episode.post_op_day_today}
                  </span>
                </span>
                <Badge className="shrink-0 border-0 bg-zinc-800 text-zinc-300">{ui.synthetic}</Badge>
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
