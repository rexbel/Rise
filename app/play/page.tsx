import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { patients } from "@/lib/seed"

export default function PlayPickerPage() {
  return (
    <main className="mx-auto w-full max-w-lg px-4 py-10">
      <h1 className="text-2xl font-semibold">Keep the Line</h1>
      <p className="mt-2 text-lg text-muted-foreground">Backup picker. Demo landing is Ellen.</p>
      <ul className="mt-6 flex flex-col gap-3">
        {patients.map((p) => {
          const first = p.display_name.split(" ")[0]
          return (
            <li key={p.rise_id}>
              <Link
                href={`/play/${p.rise_id}`}
                className="flex items-center justify-between rounded-md border bg-card px-4 py-3 text-lg hover:bg-accent"
              >
                <span>
                  <span className="font-medium">{first}</span>
                  <span className="mt-1 block text-base text-muted-foreground">
                    {p.episode.procedure} · day {p.episode.post_op_day_today}
                  </span>
                </span>
                <Badge variant="secondary">Synthetic</Badge>
              </Link>
            </li>
          )
        })}
      </ul>
    </main>
  )
}
