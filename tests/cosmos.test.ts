import { describe, expect, it, vi } from "vitest"
import { fallbackSecondLook, parseSecondLook, secondLook } from "../lib/ai/cosmos"
import { initialThrottle, MAX_PER_SET, MIN_GAP_MS, shouldSecondLook } from "../lib/play/cosmosClient"
import { CosmosSecondLookRequest } from "../lib/types"

const frame = `data:image/jpeg;base64,${"A".repeat(200)}`
const req = {
  sessionId: "s1",
  riseId: "rise-01",
  exerciseId: "sit_to_stand",
  trigger: "arms" as const,
  severity: "hard" as const,
  atMs: 9000,
  yolo: { hitCount: 1, targetReps: 6, trackingOk: true, tier: "yolo-onnx" },
  frames: [frame, frame, frame, frame],
  frameSpanMs: 1500,
}
const look = {
  verdict: "confirms",
  observation: "She pushes on both thighs to stand.",
  compensations: ["hands on thighs"],
  steadiness: "steady",
  safetyConcern: false,
  uncertainty: "none",
}
const cfg = { baseUrl: "https://cosmos.test/v1", apiKey: "k", model: "nvidia/Cosmos-Reason2-8B" }
const reply = (content: string, status = 200) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status, headers: { "content-type": "application/json" } })

describe("cosmos throttle", () => {
  it("allows the first look, then waits for the gap", () => {
    const s = initialThrottle()
    expect(shouldSecondLook(s, 0, "soft")).toBe(true)
    const sent = { ...s, lastSentAt: 0, sentThisSet: 1 }
    expect(shouldSecondLook(sent, MIN_GAP_MS - 1, "soft")).toBe(false)
    expect(shouldSecondLook(sent, MIN_GAP_MS, "soft")).toBe(true)
  })
  it("holds while a look is in flight, except a hard finding over a soft one", () => {
    const soft = { inFlight: true, inFlightSeverity: "soft" as const, lastSentAt: 0, sentThisSet: 1 }
    expect(shouldSecondLook(soft, 100, "soft")).toBe(false)
    expect(shouldSecondLook(soft, 100, "hard")).toBe(true)
    expect(shouldSecondLook({ ...soft, inFlightSeverity: "hard" }, 100, "hard")).toBe(false)
  })
  it("caps looks per set", () => {
    expect(shouldSecondLook({ ...initialThrottle(), sentThisSet: MAX_PER_SET }, 1e6, "hard")).toBe(false)
  })
})

describe("cosmos reply parsing", () => {
  it("reads plain JSON, <answer> tags, fenced JSON, and drops <think>", () => {
    expect(parseSecondLook(JSON.stringify(look))).toMatchObject({ verdict: "confirms" })
    expect(parseSecondLook(`<think>knees, hands…</think>\n<answer>${JSON.stringify(look)}</answer>`)).toMatchObject({ verdict: "confirms" })
    expect(parseSecondLook("Here you go:\n```json\n" + JSON.stringify(look) + "\n```")).toMatchObject({ steadiness: "steady" })
  })
  it("rejects prose and wrong shapes", () => {
    expect(parseSecondLook("Looks fine to me.")).toBeNull()
    expect(parseSecondLook(JSON.stringify({ ...look, verdict: "maybe" }))).toBeNull()
  })
})

describe("cosmos adapter", () => {
  it("returns Cosmos's look with model and latency", async () => {
    const fetchImpl = vi.fn(async () => reply(JSON.stringify(look)))
    const r = await secondLook(req, cfg, fetchImpl as unknown as typeof fetch)
    expect(r).toMatchObject({ verdict: "confirms", demoData: false, model: cfg.model })
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(body.messages[1].content.filter((p: { type: string }) => p.type === "image_url")).toHaveLength(4)
  })
  it("retries once on unreadable output, then falls back", async () => {
    const fetchImpl = vi.fn(async () => reply("no json here"))
    const r = await secondLook(req, cfg, fetchImpl as unknown as typeof fetch)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(r.demoData).toBe(true)
  })
  it("falls back without retrying on an HTTP error, and without config", async () => {
    const fetchImpl = vi.fn(async () => reply("", 404))
    expect((await secondLook(req, cfg, fetchImpl as unknown as typeof fetch)).demoData).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect((await secondLook(req, null)).model).toBe("fallback")
  })
  it("fallback never claims a verdict or a safety concern", () => {
    const f = fallbackSecondLook(req)
    expect(f).toMatchObject({ verdict: "unclear", safetyConcern: false, demoData: true })
  })
})

describe("second-look request validation", () => {
  it("accepts a normal window", () => {
    expect(CosmosSecondLookRequest.safeParse(req).success).toBe(true)
  })
  it("rejects too many frames, oversized frames, and non-JPEG", () => {
    expect(CosmosSecondLookRequest.safeParse({ ...req, frames: Array(7).fill(frame) }).success).toBe(false)
    expect(CosmosSecondLookRequest.safeParse({ ...req, frames: [`data:image/jpeg;base64,${"A".repeat(300_000)}`] }).success).toBe(false)
    expect(CosmosSecondLookRequest.safeParse({ ...req, frames: ["data:image/png;base64,AAAA"] }).success).toBe(false)
  })
})
