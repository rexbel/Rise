import { describe, expect, it } from "vitest"
import { sceneFor } from "../lib/play/lobbyScene"

const at = (h: number, m = 0) => new Date(2026, 9, 13, h, m)

describe("lobby scene by time of day", () => {
  it("shows the rehab gym from 07:00 through 18:59", () => {
    for (const [h, m] of [[7, 0], [12, 30], [18, 59]]) expect(sceneFor(at(h, m)), `${h}:${m}`).toBe("gym")
  })
  it("shows the hospital rooftops from 19:00 through 06:59", () => {
    for (const [h, m] of [[19, 0], [23, 45], [0, 0], [6, 59]]) expect(sceneFor(at(h, m)), `${h}:${m}`).toBe("rooftops")
  })
})
