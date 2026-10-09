import { describe, expect, it } from "vitest"
import { patients } from "@/lib/seed"
import { exerciseById, podBand, procedureFamily, targetReps, todaysProgram } from "@/lib/play/programs"

describe("programs", () => {
  it("maps Ellen TKA early POD to sit_to_stand", () => {
    const ellen = patients.find((p) => p.rise_id === "rise-01")!
    expect(procedureFamily(ellen)).toBe("tka")
    expect(podBand(ellen.episode.post_op_day_today)).toBe("0_3")
    const today = todaysProgram(ellen)
    expect(today[0].id).toBe("sit_to_stand")
    expect(targetReps(today[0])).toBe(6)
  })

  it("resolves all exercise ids", () => {
    for (const id of ["sit_to_stand", "mini_squat", "single_leg_balance"] as const) {
      expect(exerciseById(id).id).toBe(id)
    }
  })
})
