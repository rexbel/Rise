/**
 * NVIDIA Cosmos second look (server only). YOLO flags a form break on-device; this asks Cosmos Reason whether the
 * frames show it. OpenAI-compatible chat completions with frames as ordered base64 JPEG image_url parts.
 * 8 s timeout per attempt, one retry on invalid output, then a template built from YOLO's numbers ("Demo data").
 * Env: COSMOS_BASE_URL, COSMOS_API_KEY, COSMOS_MODEL. Never patient-facing; never sets the recommendation.
 */
import { secondLookPrompt, SECOND_LOOK_SYSTEM } from "@/lib/ai/prompts"
import {
  CosmosSecondLook,
  type CosmosSecondLookRequest,
  type CosmosSecondLookResult,
  type CosmosTrigger,
} from "@/lib/types"

const TIMEOUT_MS = 8000
const DEFAULT_MODEL = "nvidia/cosmos3-nano-reasoner"

export interface CosmosConfig {
  baseUrl: string
  apiKey: string
  model: string
}

export function cosmosConfig(env: NodeJS.ProcessEnv = process.env): CosmosConfig | null {
  const baseUrl = env.COSMOS_BASE_URL?.replace(/\/+$/, "")
  const apiKey = env.COSMOS_API_KEY
  if (!baseUrl || !apiKey) return null
  return { baseUrl, apiKey, model: env.COSMOS_MODEL || DEFAULT_MODEL }
}

/** Pulls the JSON object out of a model reply: drops <think>, unwraps <answer> or ```json fences. */
export function parseSecondLook(text: string): CosmosSecondLook | null {
  let s = text.replace(/<think>[\s\S]*?<\/think>/gi, "")
  const answer = s.match(/<answer>([\s\S]*?)<\/answer>/i)
  if (answer) s = answer[1]
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1]
  const start = s.indexOf("{"), end = s.lastIndexOf("}")
  if (start < 0 || end <= start) return null
  try {
    const parsed = CosmosSecondLook.safeParse(JSON.parse(s.slice(start, end + 1)))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

const FALLBACK_WHAT: Record<CosmosTrigger, string> = {
  valgus: "a knee moving inward",
  speed: "a rep faster than the target tempo",
  arms: "the hands pushing off to help stand",
  asymmetry: "weight shifting onto one leg",
  tracking_lost: "the body leaving the camera frame",
}

/** Template answer from YOLO's own numbers, used when Cosmos is unavailable or unreadable. */
export function fallbackSecondLook(req: Pick<CosmosSecondLookRequest, "trigger" | "yolo" | "atMs">, latencyMs = 0): CosmosSecondLookResult {
  return {
    verdict: "unclear",
    observation: `The pose tracker saw ${FALLBACK_WHAT[req.trigger]} at ${(req.atMs / 1000).toFixed(1)} s (${req.yolo.hitCount} clean reps so far). No Cosmos second look was available.`,
    compensations: [],
    steadiness: "unclear",
    safetyConcern: false,
    uncertainty: "Cosmos unavailable; based on pose tracking only",
    model: "fallback",
    latencyMs,
    demoData: true,
  }
}

async function callOnce(cfg: CosmosConfig, req: CosmosSecondLookRequest, fetchImpl: typeof fetch): Promise<string> {
  const res = await fetchImpl(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.2,
      max_tokens: 300,
      messages: [
        { role: "system", content: SECOND_LOOK_SYSTEM },
        {
          role: "user",
          content: [
            ...req.frames.map((url) => ({ type: "image_url", image_url: { url } })),
            { type: "text", text: secondLookPrompt(req) },
          ],
        },
      ],
    }),
  })
  if (!res.ok) throw new Error(`cosmos ${res.status}`)
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return body.choices?.[0]?.message?.content ?? ""
}

/** Second look with timeout, one retry on unreadable output, and the template fallback. Never throws. */
export async function secondLook(
  req: CosmosSecondLookRequest,
  cfg: CosmosConfig | null = cosmosConfig(),
  fetchImpl: typeof fetch = fetch,
): Promise<CosmosSecondLookResult> {
  const t0 = Date.now()
  if (!cfg) return fallbackSecondLook(req)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const look = parseSecondLook(await callOnce(cfg, req, fetchImpl))
      if (look) return { ...look, model: cfg.model, latencyMs: Date.now() - t0, demoData: false }
    } catch (e) {
      // Timeouts and HTTP errors don't get a retry: the moment has passed.
      console.warn("[cosmos] second look failed:", (e as Error).message)
      break
    }
  }
  return fallbackSecondLook(req, Date.now() - t0)
}
