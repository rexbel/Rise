/**
 * Check the Cosmos endpoint before the stage: lists models, then runs one second look on a frame window.
 *   npm run cosmos:probe                 uses docs/images/04-live-fruit.jpg x4 as the "frames"
 *   npm run cosmos:probe -- a.jpg b.jpg  your own JPEG frames, oldest first
 * Reads COSMOS_BASE_URL / COSMOS_API_KEY / COSMOS_MODEL from the environment or .env.local. Prints no secrets.
 */
import { existsSync, readFileSync } from "node:fs"
import { cosmosConfig, secondLook } from "../lib/ai/cosmos"

if (existsSync(".env.local")) process.loadEnvFile(".env.local")

async function main() {
  const cfg = cosmosConfig()
  if (!cfg) {
    console.error("Set COSMOS_BASE_URL and COSMOS_API_KEY in .env.local.")
    process.exit(1)
  }
  console.log(`endpoint ${cfg.baseUrl}  model ${cfg.model}`)

  const res = await fetch(`${cfg.baseUrl}/models`, { headers: { Authorization: `Bearer ${cfg.apiKey}` }, signal: AbortSignal.timeout(15_000) })
  const ids: string[] = res.ok ? (((await res.json()) as { data?: { id: string }[] }).data ?? []).map((m) => m.id) : []
  console.log(`/models: ${res.status}, ${ids.length} models`)
  const cosmos = ids.filter((id) => /cosmos/i.test(id))
  console.log(cosmos.length ? `Cosmos models: ${cosmos.join(", ")}` : "No model with 'cosmos' in its id is listed.")
  if (ids.length && !ids.includes(cfg.model)) console.log(`Note: COSMOS_MODEL "${cfg.model}" is not in the list.`)

  const paths = process.argv.slice(2).filter((a) => a.endsWith(".jpg") || a.endsWith(".jpeg"))
  const files = paths.length ? paths : Array(4).fill("docs/images/04-live-fruit.jpg")
  const frames = files.map((f) => `data:image/jpeg;base64,${readFileSync(f).toString("base64")}`)
  const look = await secondLook({
    sessionId: "probe",
    riseId: "rise-01",
    exerciseId: "sit_to_stand",
    trigger: "arms",
    severity: "hard",
    atMs: 9000,
    yolo: { hitCount: 1, targetReps: 6, trackingOk: true, tier: "probe" },
    frames,
    frameSpanMs: 1500,
  }, cfg)
  console.log(JSON.stringify(look, null, 2))
  if (look.demoData) {
    console.log("Fell back to the template: Cosmos did not answer with usable JSON (see warning above).")
    process.exit(1)
  }
}

void main()
