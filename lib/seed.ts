import raw from "@/seed/patients.json"
import { SeedFile, type SeedPatient } from "@/lib/types"

const parsed = SeedFile.parse(raw)

export const patients: SeedPatient[] = parsed.patients

export function getPatient(riseId: string): SeedPatient | undefined {
  return patients.find((p) => p.rise_id === riseId)
}
