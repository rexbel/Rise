import { notFound } from "next/navigation"
import { getPatient } from "@/lib/seed"
import { CheckIn } from "./check-in"

// The token is the Rise ID; ?s= ties the run to the console's invite, ?demo=1 starts on the demo recording.
// Live per-session route: keep blocking on the server (Next 16 Cache Components).
export const instant = false

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

export default async function PatientPage(props: PageProps<"/p/[token]">) {
  const { token } = await props.params
  const search = await props.searchParams
  const patient = getPatient(token)
  if (!patient) notFound()
  return (
    // Patient shell on the pt-* tokens so the page edges match the phone column on any theme.
    <div className="flex min-h-dvh flex-1 flex-col bg-pt-bg text-pt-ink">
      <CheckIn
        patient={patient}
        clinicName={process.env.CLINIC_NAME ?? "Riverside Ortho"}
        sessionParam={first(search.s)}
        demoParam={first(search.demo) === "1"}
      />
    </div>
  )
}
