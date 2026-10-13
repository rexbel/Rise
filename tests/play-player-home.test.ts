import { describe, expect, it, beforeEach } from "vitest"
import { getPatient } from "@/lib/seed"
import {
  clearPlayerHomeCache,
  missionDose,
  nextSessionLabel,
  playerHome,
  recoveryLabel,
} from "@/lib/play/playerHome"

describe("playerHome", () => {
  beforeEach(() => {
    clearPlayerHomeCache()
  })

  it("builds Ellen’s self-only pre-game model", () => {
    const ellen = getPatient("rise-01")!
    const home = playerHome(ellen)

    expect(home.riseId).toBe("rise-01")
    expect(home.firstName).toBe("Ellen")
    expect(home.avatarSrc).toBe("/play/avatars/rise-01.jpg")
    expect(home.dayLabel).toBe("Day 3")
    expect(home.trackLabel).toBe("Knee track")
    expect(home.recoveryLabel).toBe("Knee recovery")
    expect(home.family).toBe("tka")
    expect(home.checkInsDone).toBe(ellen.checkins.length)
    expect(home.checkInsDone).toBe(2)
    expect(home.sinceSurgeryLabel).toBe("Day 3 since surgery")
    expect(home.trend).toBe("harder")
    expect(home.trendLabel).toBe("Felt harder than last time")
    expect(home.nextSessionDays).toBe(1)
    expect(home.nextSessionLabel).toBe("Tomorrow")
    expect(home.missions).toHaveLength(1)
    expect(home.missions[0]?.id).toBe("sit_to_stand")
  })

  it("carries no rank, peer, score, or stand-count fields", () => {
    const home = playerHome(getPatient("rise-01")!)
    const keys = Object.keys(home).join(" ")
    expect(keys).not.toMatch(/rank|place|peer|score|hits|stand|raw|steadi/i)
    expect(JSON.stringify(home)).not.toMatch(/PLACE|STEADI|below average/i)
  })

  it("formats mission doses in plain words", () => {
    const home = playerHome(getPatient("rise-01")!)
    expect(missionDose(home.missions[0]!)).toMatch(/^\d+ × \d+$/)
  })

  it("memoizes by rise_id", () => {
    const ellen = getPatient("rise-01")!
    expect(playerHome(ellen)).toBe(playerHome(ellen))
  })

  it("maps recovery labels from locked JSON", () => {
    expect(recoveryLabel("tka")).toBe("Knee recovery")
    expect(recoveryLabel("tha")).toBe("Hip recovery")
    expect(recoveryLabel("hip_fracture")).toBe("Fracture recovery")
  })

  it("formats next-session labels", () => {
    expect(nextSessionLabel(0)).toBe("Today")
    expect(nextSessionLabel(-1)).toBe("Today")
    expect(nextSessionLabel(1)).toBe("Tomorrow")
    expect(nextSessionLabel(4)).toBe("In 4 days")
  })

  it("returns multiple missions for a later TKA band", () => {
    const diane = getPatient("rise-05")!
    const home = playerHome(diane)
    expect(home.missions.length).toBeGreaterThanOrEqual(2)
    expect(home.recoveryLabel).toBe("Knee recovery")
    expect(home.trackLabel).toBe("Knee track")
  })
})
