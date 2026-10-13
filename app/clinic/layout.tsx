import type { Metadata } from "next"
import { patients } from "@/lib/seed"
import { clinicFontClass } from "@/components/clinic/fonts"
import { ClinicFooter } from "@/components/clinic/footer"
import type { PatientSummary } from "@/components/clinic/format"
import { ClinicHeader } from "@/components/clinic/header"
import { ClinicProvider } from "@/components/clinic/store"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Rise · Clinic",
  description: "Care-team console: send check-ins, watch sessions live, decide triage cards. Synthetic data.",
}

/** Seed data is static, so this summary is part of the prerendered shell; live sessions load in the browser. */
const summaries: PatientSummary[] = patients.map((p) => {
  const last = p.checkins[p.checkins.length - 1]
  return {
    riseId: p.rise_id,
    name: p.display_name,
    age: p.demographics.age,
    sex: p.demographics.sex,
    procedure: p.episode.procedure,
    postOpDay: p.episode.post_op_day_today,
    episodeType: p.monitoring_episode.type,
    episodeDay: p.monitoring_episode.day_in_episode,
    episodeLength: p.monitoring_episode.length_days,
    lastCheckIn: { label: last.label, postOpDay: last.post_op_day },
  }
})

export default function ClinicLayout({ children }: LayoutProps<"/clinic">) {
  return (
    <div className={cn(clinicFontClass, "flex min-h-full flex-1 flex-col bg-cl-paper text-base text-cl-ink [color-scheme:light]")}>
      <ClinicProvider patients={summaries}>
        <ClinicHeader />
        <div className="flex-1">{children}</div>
        <ClinicFooter />
      </ClinicProvider>
    </div>
  )
}
