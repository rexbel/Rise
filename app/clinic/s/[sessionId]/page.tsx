import type { Metadata } from "next"
import { TriageView } from "@/components/clinic/triage-view"

// Live per-session route: the id comes from the request and the card arrives over the stream (Cache Components).
export const instant = false

export const metadata: Metadata = { title: "Triage card · Rise · Clinic" }

export default async function TriagePage(props: PageProps<"/clinic/s/[sessionId]">) {
  const { sessionId } = await props.params
  return <TriageView sessionId={sessionId} />
}
