import { notFound } from "next/navigation"
import { PlaySessionView } from "@/components/play/PlaySessionView"
import { getPatient } from "@/lib/seed"

export const instant = false

export default async function PlaySessionPage(props: PageProps<"/play/[riseId]">) {
  const { riseId } = await props.params
  const search = await props.searchParams
  const patient = getPatient(riseId)
  if (!patient) notFound()
  const demoFlag = search.demo
  const demo = demoFlag === "1" || (Array.isArray(demoFlag) && demoFlag[0] === "1")
  return <PlaySessionView patient={patient} demo={demo} />
}
