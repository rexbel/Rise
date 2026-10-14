import { TriangleAlert } from "lucide-react"

/**
 * A check-in link whose invite token isn't valid (mistyped, from another patient, or from before a demo reset).
 * The patient is never dropped into a demo or an unlinked session in its place. Patient sizing: 20px+ text.
 */
export function InvalidLink({ clinicName }: { clinicName: string }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-5 bg-pt-bg px-5 py-10 text-xl text-pt-ink">
      <TriangleAlert aria-hidden className="size-12 text-pt-accent" />
      <h1 className="text-3xl font-semibold leading-snug">This check-in link doesn&apos;t work anymore.</h1>
      <p className="leading-snug text-pt-muted">Please ask your care team at {clinicName} to send you a new one.</p>
    </main>
  )
}
