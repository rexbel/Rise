import { notFound } from "next/navigation"
import { InvalidLink } from "@/components/patient/InvalidLink"
import { PlaySessionView } from "@/components/play/PlaySessionView"
import { getPatient } from "@/lib/seed"
import { resolveInvite } from "@/lib/sessions"

// Live per-session route (reads ?i= and ?demo=): keep blocking on the server (Next 16 Cache Components).
// ?i= is the console invite's token; the server resolves it and decides demo or real. ?demo=1 only applies to an
// unlinked visit (the lobby's Try a demo).
export const instant = false

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

export default async function PlaySessionPage(props: PageProps<"/play/[riseId]">) {
  const { riseId } = await props.params
  const search = await props.searchParams
  const patient = getPatient(riseId)
  if (!patient) notFound()
  const clinicName = process.env.CLINIC_NAME ?? "Riverside Ortho"
  const token = first(search.i)
  const invite = resolveInvite(patient.rise_id, token)
  if (token && (!invite || invite.surface !== "play")) return <InvalidLink clinicName={clinicName} />
  return <PlaySessionView patient={patient} demo={first(search.demo) === "1"} invite={invite} clinicName={clinicName} />
}
