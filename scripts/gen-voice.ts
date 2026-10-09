/**
 * Pre-event: render every coach/closing line to public/voice/<id>.mp3 with ElevenLabs.
 *   ELEVENLABS_API_KEY=... ELEVENLABS_VOICE_ID=... npm run voice
 * Re-runs skip files that already exist (pass --force to re-render).
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import data from "../content/voice-lines.json"

const key = process.env.ELEVENLABS_API_KEY
const voice = process.env.ELEVENLABS_VOICE_ID
const model = process.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2"
const force = process.argv.includes("--force")
if (!key || !voice) {
  console.error("Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID (see .env.example).")
  process.exit(1)
}

const outDir = path.join(process.cwd(), "public", "voice")
mkdirSync(outDir, { recursive: true })

for (const { id, text } of data.lines) {
  const file = path.join(outDir, `${id}.mp3`)
  if (existsSync(file) && !force) continue
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: model, voice_settings: { stability: 0.6, similarity_boost: 0.75 } }),
  })
  if (!res.ok) {
    console.error(`${id}: ${res.status} ${await res.text()}`)
    process.exit(1)
  }
  writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  console.log(`rendered ${id}`)
}
console.log(`done: ${data.lines.length} lines in public/voice/`)
