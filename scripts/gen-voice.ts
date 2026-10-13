/**
 * Render the voice coach with ElevenLabs. Two sets:
 *   1. Phone check-in (/p): content/voice-lines.json -> public/voice/<id>.mp3
 *   2. RehabNinja (/play): every locked line the play surface speaks -> public/voice/play/<hash>.mp3,
 *      with public/voice/play/manifest.json mapping text -> file (lib/play/speak.ts reads it).
 * Each render is keyed by a hash of voice + model + settings + text, so editing a line, or switching voice or
 * model, re-renders exactly the affected files; unchanged lines are skipped. Unused /play files are removed.
 *
 *   npm run voice            render what changed (reads ELEVENLABS_* from the environment or .env.local)
 *   npm run voice -- --check report what would change, render nothing (exit 1 if stale)
 *   npm run voice -- --force re-render everything
 */
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs"
import path from "node:path"
import protocol from "../config/protocol.default.json"
import corrections from "../content/form-corrections.json"
import patientLines from "../content/patient-lines.json"
import playUi from "../content/play-ui.json"
import data from "../content/voice-lines.json"

if (existsSync(".env.local")) process.loadEnvFile(".env.local")

const key = process.env.ELEVENLABS_API_KEY
const voice = process.env.ELEVENLABS_VOICE_ID
const model = process.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2"
const clinic = process.env.CLINIC_NAME ?? "Riverside Ortho"
const force = process.argv.includes("--force")
const checkOnly = process.argv.includes("--check")
const SETTINGS = { stability: 0.6, similarity_boost: 0.75 }

const voiceDir = path.join(process.cwd(), "public", "voice")
const playDir = path.join(voiceDir, "play")
const phoneManifestPath = path.join(voiceDir, "manifest.json")
const playManifestPath = path.join(playDir, "manifest.json")

const hashOf = (voiceId: string, text: string) =>
  createHash("sha1").update(JSON.stringify([voiceId, model, SETTINGS, text])).digest("hex").slice(0, 16)

const readJson = <T>(p: string, fallback: T): T => (existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : fallback)

/** Every line lib/play/speak.ts can be asked to say (see its call sites in components/play). */
function playLines(): string[] {
  const out = new Set<string>()
  const add = (s: unknown) => typeof s === "string" && s.trim() && out.add(s.replace("{clinic}", clinic))
  playUi.countdown.forEach(add)
  add(playUi.frame.continue)
  Object.values(playUi.live.coach).forEach(add)
  add(playUi.live.step_back)
  add(playUi.live.stop)
  protocol.symptom_questions.forEach((q) => add(q.text))
  Object.values(patientLines.trend).forEach(add)
  add(patientLines.emergency.line)
  const walk = (o: unknown) => {
    if (!o || typeof o !== "object") return
    for (const [k, v] of Object.entries(o)) {
      if (k === "what") add(v)
      else walk(v)
    }
  }
  walk(corrections)
  return [...out].filter((s) => !s.includes("{"))
}

async function render(apiKey: string, voiceId: string, text: string, file: string) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: model, voice_settings: SETTINGS }),
  })
  if (!res.ok) {
    console.error(`${path.basename(file)}: ${res.status} ${await res.text()}`)
    process.exit(1)
  }
  writeFileSync(file, Buffer.from(await res.arrayBuffer()))
}

async function main(apiKey: string, voiceId: string) {
  mkdirSync(playDir, { recursive: true })
  let stale = 0, rendered = 0, adopted = 0

  // 1. Phone check-in lines, by id.
  const phoneManifest = readJson<Record<string, string>>(phoneManifestPath, {})
  for (const { id, text } of data.lines) {
    const file = path.join(voiceDir, `${id}.mp3`)
    const h = hashOf(voiceId, text)
    if (!force && existsSync(file) && phoneManifest[id] === h) continue
    // Files rendered before the manifest existed: adopt them once (their text was checked against git history).
    if (!force && existsSync(file) && phoneManifest[id] === undefined) {
      phoneManifest[id] = h
      adopted++
      continue
    }
    stale++
    console.log(`${checkOnly ? "stale" : "render"} ${id}`)
    if (checkOnly) continue
    await render(apiKey, voiceId, text, file)
    phoneManifest[id] = h
    rendered++
  }

  // 2. RehabNinja lines, by hash of the text.
  const playManifest: Record<string, string> = {}
  for (const text of playLines()) {
    const name = `${hashOf(voiceId, text)}.mp3`
    playManifest[text] = name
    const file = path.join(playDir, name)
    if (!force && existsSync(file)) continue
    stale++
    console.log(`${checkOnly ? "stale" : "render"} play: ${text.slice(0, 70)}`)
    if (checkOnly) continue
    await render(apiKey, voiceId, text, file)
    rendered++
  }

  const keep = new Set(Object.values(playManifest))
  const orphans = readdirSync(playDir).filter((f) => f.endsWith(".mp3") && !keep.has(f))
  if (checkOnly) {
    console.log(`${stale} stale, ${orphans.length} unused /play files, ${adopted} pre-manifest files to adopt`)
    process.exit(stale || orphans.length ? 1 : 0)
  }
  for (const f of orphans) unlinkSync(path.join(playDir, f))
  writeFileSync(phoneManifestPath, JSON.stringify(phoneManifest, null, 2) + "\n")
  writeFileSync(playManifestPath, JSON.stringify(playManifest, null, 2) + "\n")
  console.log(
    `done: ${rendered} rendered, ${adopted} adopted, ${orphans.length} unused removed; ` +
      `${data.lines.length} phone lines, ${keep.size} play lines`,
  )
}

if (!key || !voice) {
  console.error("Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID (see .env.example).")
  process.exit(1)
}
void main(key, voice)
