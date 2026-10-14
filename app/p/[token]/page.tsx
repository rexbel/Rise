import { notFound } from "next/navigation"
import { InvalidLink } from "@/components/patient/InvalidLink"
import { getPatient } from "@/lib/seed"
import { resolveInvite } from "@/lib/sessions"
import { CheckIn } from "./check-in"

// The path segment is the Rise ID. ?i= is the console invite's token: the server resolves it and decides demo or
// real. ?demo=1 only applies to an unlinked visit.
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
  const clinicName = process.env.CLINIC_NAME ?? "Riverside Ortho"
  const inviteToken = first(search.i)
  const invite = resolveInvite(patient.rise_id, inviteToken)
  if (inviteToken && (!invite || invite.surface !== "classic")) return <InvalidLink clinicName={clinicName} />
  return (
    // Patient shell on the pt-* tokens so the page edges match the phone column on any theme.
    <div className="flex min-h-dvh flex-1 flex-col bg-pt-bg text-pt-ink">
      <CheckIn patient={patient} clinicName={clinicName} invite={invite} demoParam={first(search.demo) === "1"} />
    </div>
  )
}
