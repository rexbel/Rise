import { notFound } from "next/navigation"
import { getPatient } from "@/lib/seed"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

// SCAFFOLD CHECK: P1 placeholder. Day-of: single-use tokens map to a session; never show scores here.

// Live per-session route: keep blocking on the server (Next 16 Cache Components).
export const instant = false
export default async function PatientPage(props: PageProps<"/p/[token]">) {
  const { token } = await props.params
  const patient = getPatient(token)
  if (!patient) notFound()
  const firstName = patient.display_name.split(" ")[0]

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl leading-snug">Hi {firstName}, your care team asked for a 2-minute check-in.</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-lg text-muted-foreground">You can stop at any time.</p>
          <Button size="lg" className="h-14 text-lg" disabled>Start (day-of)</Button>
        </CardContent>
      </Card>
    </main>
  )
}
