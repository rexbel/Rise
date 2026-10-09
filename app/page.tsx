import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-4 py-16">
      <Badge variant="secondary" className="w-fit">Synthetic data · demo build</Badge>
      <h1 className="text-4xl font-semibold tracking-tight">Rise</h1>
      <p className="text-lg text-muted-foreground">
        CDC-standard mobility check-ins on the patient&apos;s own phone, scored live by a video agent and routed to the right clinician.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button asChild size="lg"><Link href="/clinic">Clinic console</Link></Button>
        <Button asChild size="lg" variant="outline"><Link href="/p/rise-01">Patient phone (Ellen)</Link></Button>
      </div>
    </main>
  )
}
