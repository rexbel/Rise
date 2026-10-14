import { LiveBoard } from "@/components/clinic/live-board"
import { PatientList } from "@/components/clinic/patient-list"
import { TodayList } from "@/components/clinic/today-list"

/** C1 + C2. Today's follow-ups, then the board, so open work and live changes stay in view on a 1280x720 projector. */
export default function ClinicPage() {
  return (
    <main className="mx-auto grid w-full max-w-[1400px] gap-10 px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="sr-only">Clinic console</h1>
      <TodayList />
      <LiveBoard />
      <PatientList />
    </main>
  )
}
