import { patients } from "@/lib/seed"
import { belowAverageCutoff } from "@/lib/steadi"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

// SCAFFOLD CHECK: proves seed + shadcn wiring. Replace with C1 (patient list + Send check-in) day-of.
export default function ClinicPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Patients</h1>
        <Badge variant="secondary">Synthetic data</Badge>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Procedure</TableHead>
            <TableHead>POD</TableHead>
            <TableHead>Episode</TableHead>
            <TableHead>Last STEADI</TableHead>
            <TableHead>CDC cutoff</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {patients.map((p) => {
            const last = p.checkins[p.checkins.length - 1]
            return (
              <TableRow key={p.rise_id}>
                <TableCell className="font-medium">{p.display_name}</TableCell>
                <TableCell>{p.episode.procedure}</TableCell>
                <TableCell>{p.episode.post_op_day_today}</TableCell>
                <TableCell>
                  {p.monitoring_episode.type === "reactivated" ? "Reactivated" : "Post-discharge"} · day {p.monitoring_episode.day_in_episode}/30
                </TableCell>
                <TableCell>{last.steadi_score}{last.arms_used ? " (arms)" : ""}</TableCell>
                <TableCell>&lt; {belowAverageCutoff(p.demographics.age, p.demographics.sex) ?? "n/a"}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </main>
  )
}
