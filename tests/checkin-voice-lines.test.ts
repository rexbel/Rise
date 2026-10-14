import { describe, expect, it } from "vitest"
import voice from "../content/voice-lines.json"
import { Recommendation, Trend } from "../lib/types"

/**
 * The classic check-in prints each setup and closing screen's spoken line as its heading (voice.text(id)), so a
 * missing id would leave a blank screen and a silent coach. Every id the flow can reach must exist with text.
 */
const text = new Map(voice.lines.map((l) => [l.id, l.text]))

const nextId = (r: Recommendation) => (r === "human_confirm" ? "next_finished_early" : `next_${r}`)

describe("classic check-in voice lines", () => {
  const ids = [
    "setup_chair",
    "setup_helper",
    "setup_phone",
    "framing_ok",
    "framing_back",
    "countdown",
    "time_up",
    "note_prompt",
    "closure",
    "next_finished_early",
    ...[...Trend.options, "first", "finished_early"].map((t) => `trend_${t}`),
    ...Recommendation.options.map(nextId),
  ]

  it.each(ids)("%s exists and has text", (id) => {
    expect(text.get(id)?.trim()).toBeTruthy()
  })
})
