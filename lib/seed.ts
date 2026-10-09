import raw from "@/seed/patients.json"
import { SeedFile, type SeedPatient, type SessionResult } from "@/lib/types"

const parsed = SeedFile.parse(raw)

export const patients: SeedPatient[] = parsed.patients

export function getPatient(riseId: string): SeedPatient | undefined {
  return patients.find((p) => p.rise_id === riseId)
}

/** The patient's scripted session as a SessionResult (seeded fallback, tests, console before live data). */
export function scriptedResult(p: SeedPatient, overrides: Partial<SessionResult> = {}): SessionResult {
  const t = p.scripted_today
  return {
    sessionId: `seed-${p.rise_id}`,
    riseId: p.rise_id,
    rawStands: t.raw,
    armsUsed: t.arms,
    armsFromRep: t.arms ? t.arms_from_rep : undefined,
    steadiScore: t.steadi_score,
    asymmetryPct: t.asymmetry_pct,
    favoring: t.favoring === "left" || t.favoring === "right" ? t.favoring : null,
    pausesOver3s: t.pauses_over_3s_after_standing ?? 0,
    stoppedEarly: false,
    resumedAfterPause: false,
    tandemHoldS: t.balance_tandem_hold_s,
    gaitObservations: t.gait_observations ?? [],
    symptoms: t.symptoms,
    tier: "seeded",
    demoData: true,
    startedAt: 0,
    finishedAt: 30_000,
    ...overrides,
  }
}

export function lastCheckIn(p: SeedPatient) {
  return p.checkins[p.checkins.length - 1]
}
