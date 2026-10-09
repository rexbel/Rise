import { notFound } from "next/navigation"
import { getPatient } from "@/lib/seed"
import { CheckIn } from "./check-in"

// Day-of: the token is the Rise ID; single-use tokens mapped to a session come with the relay.
// Live per-session route: keep blocking on the server (Next 16 Cache Components).
export const instant = false

export default async function PatientPage(props: PageProps<"/p/[token]">) {
  const { token } = await props.params
  const patient = getPatient(token)
  if (!patient) notFound()
  return <CheckIn patient={patient} clinicName={process.env.CLINIC_NAME ?? "Riverside Ortho"} />
}
