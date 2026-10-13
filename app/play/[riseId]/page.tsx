import { notFound } from "next/navigation"
import { PlaySessionView } from "@/components/play/PlaySessionView"
import { getPatient } from "@/lib/seed"

// Live per-session route (reads ?s= and ?demo=): keep blocking on the server (Next 16 Cache Components).
export const instant = false

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

export default async function PlaySessionPage(props: PageProps<"/play/[riseId]">) {
  const { riseId } = await props.params
  const search = await props.searchParams
  const patient = getPatient(riseId)
  if (!patient) notFound()
  const demo = first(search.demo) === "1"
  return (
    <PlaySessionView
      patient={patient}
      demo={demo}
      sessionParam={first(search.s)}
      clinicName={process.env.CLINIC_NAME ?? "Riverside Ortho"}
    />
  )
}
