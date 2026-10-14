/**
 * AI-generated demo footage for "Use demo recording" (Runway API). One 30 s portrait video of a synthetic older adult
 * doing a CDC STEADI chair stand, built from a still plus three 10 s segments, each starting on the last frame of the
 * one before. Used by both the classic check-in (plays once) and RehabNinja (loops).
 *
 *   npx tsx scripts/gen-demo-video.ts still            dry run: show the request and credit cost
 *   npx tsx scripts/gen-demo-video.ts still --run      generate 4 still options (4 x 5 credits)
 *   npx tsx scripts/gen-demo-video.ts edit --image <png> [--preset chair|zoom] [--count n] [--run]   (n x 2 credits)
 *   npx tsx scripts/gen-demo-video.ts segment 1 --image .demo-work/still-123.png [--run]   (50 credits)
 *   npx tsx scripts/gen-demo-video.ts clip a|b --image .demo-work/still-123.png [--run]      (veo3.1_fast 8 s, 80 credits)
 *   npx tsx scripts/gen-demo-video.ts lastframe .demo-work/seg1-....mp4                    (ffmpeg, free)
 *   npx tsx scripts/gen-demo-video.ts stitch seg1.mp4 seg2.mp4 seg3.mp4                    (ffmpeg, free)
 *   npx tsx scripts/gen-demo-video.ts ledger                                               (credits spent)
 *
 * Paid calls need --run and are recorded in .demo-work/ledger.json; the script refuses to pass BUDGET_CAP credits.
 * Key: RUNWAYML_API_SECRET in .env.local (never printed). Outputs are downloaded at once (Runway URLs expire).
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

if (existsSync(".env.local")) process.loadEnvFile(".env.local")

const API = "https://api.dev.runwayml.com"
const VERSION = "2024-11-06"
const WORK = path.join(process.cwd(), ".demo-work")
const LEDGER = path.join(WORK, "ledger.json")
const OUT = path.join(process.cwd(), "public", "demo", "sit-to-stand.mp4")
const BUDGET_CAP = 700
const COST = { still: 5, edit: 2, segmentPerSecond: 5, clipPerSecond: 10 } // gen4_image 720p; gen4_turbo and veo3.1_fast (no audio) per second
const CLIP_SECONDS = 8
const SEGMENT_SECONDS = 10
const RATIO_IMAGE = "720:1280"
const RATIO_VIDEO = "720:1280"

const CAMERA = "Static camera resting on the floor; the whole body stays in frame from head to feet. No camera movement, no cuts, no zoom."

const STILL_PROMPT =
  "Photorealistic vertical photo. A plain gray metal folding chair with no arms, open at both sides, stands pushed " +
  "back against a plain light wall. On it sits a 70-year-old woman with short white hair and glasses, navy " +
  "long-sleeve top, gray sweatpants and white sneakers, sitting upright in the middle of the seat, arms crossed at " +
  "the wrists over the chest with hands on opposite shoulders, knees bent at a right angle, feet flat on the floor. " +
  "Her elbows and both sides of the seat are clearly visible with empty space beside the chair. Wide shot taken by a " +
  "phone propped on the floor about 4 meters away: she and the chair fill only the lower half of the frame, with a " +
  "large area of empty wall above her head (room for her to stand up fully and stay in frame), feet well above the " +
  "bottom edge. Bright even daylight, light wood floor, uncluttered, no other chairs, no other people, no text."

/**
 * Keep the person, pose, room and camera; replace only the chair (the CDC test needs a chair without armrests).
 * "No armrests" alone was ignored twice (models default to armchairs for a seated older adult); a folding chair has
 * no arms by nature, so the model's own bias works for us.
 */
const EDIT_PROMPT =
  "Photorealistic. Recreate @scene exactly: the same person, face, hair, glasses, clothes, sitting pose with arms " +
  "crossed over the chest, feet flat on the floor, the same room, wall, floor, lighting and low camera angle, full body " +
  "from head to feet. Replace only the chair with a plain gray metal folding chair (a simple armless folding chair " +
  "with a flat seat and backrest), pushed back against the wall. The person's elbows and the sides of the seat are " +
  "clearly visible with empty space beside them. No other changes, no text."

/** Pull the camera back on an approved still so a full stand stays in frame. Same scene, more wall above the head. */
const ZOOM_PROMPT =
  "Photorealistic. The exact same scene as @scene: the same woman, face, glasses, clothes, the same armless gray metal " +
  "folding chair, the same pose with arms crossed and feet flat, the same wall, floor and daylight, the same front-on " +
  "camera height. Pull the camera back so the whole scene is smaller: she and the chair occupy only the lower half " +
  "of the frame, with a tall area of plain empty wall above her head and visible floor below her feet. No other " +
  "changes, no text."

const EDIT_PRESETS = { chair: EDIT_PROMPT, zoom: ZOOM_PROMPT } as const

const SEGMENTS: Record<1 | 2 | 3, string> = {
  1:
    "The seated older adult keeps the arms crossed over the chest and slowly rises to a full standing position, " +
    "stands upright for a moment, then slowly sits back down in the middle of the chair. Careful, realistic pace. " +
    CAMERA,
  2:
    "The older adult uncrosses the arms, places both hands on the thighs and pushes off with the hands to slowly rise " +
    "to standing, stands upright briefly, then slowly sits back down with the hands resting on the thighs. " +
    CAMERA,
  3:
    "The older adult pushes off the thighs with both hands to slowly rise to standing, then sits back down, settles " +
    "upright and crosses the arms over the chest with hands on opposite shoulders, and stays still. " +
    CAMERA,
}

/**
 * One stand and sit per clip, on veo3.1_fast with the same still as first and last frame, so she must end seated
 * exactly where she began and clips join without a jump. gen4_turbo (first frame only) let her uncross her arms,
 * bend over and walk out of frame. A = arms crossed (the CDC test); B = pushes off her thighs (the "used arms" case).
 */
const CLIPS: Record<"a" | "b", string> = {
  a:
    "The seated older woman keeps her arms crossed over her chest the whole time. She leans forward slightly and " +
    "slowly rises straight up to a full upright stand, pauses standing tall for a moment, then slowly lowers herself " +
    "back down to sit in the middle of the same chair, arms still crossed. She stays facing the camera in the same " +
    "spot. Careful, realistic pace for a 70-year-old. " + CAMERA,
  b:
    "The seated older woman uncrosses her arms, places both hands on her thighs and pushes off them to slowly rise to " +
    "a full upright stand, pauses standing tall, then slowly sits back down in the middle of the same chair and " +
    "crosses her arms over her chest again. She stays facing the camera in the same spot. Careful, realistic pace " +
    "for a 70-year-old. " + CAMERA,
}

const CLIP_NEGATIVE =
  "walking away, leaving the frame, turning around, bending down, touching shoes, camera movement, zoom, cut, " +
  "head cropped, extra people, text, captions"

type Ledger = { spent: number; entries: { at: string; kind: string; credits: number; taskId?: string; file?: string }[] }

function ledger(): Ledger {
  return existsSync(LEDGER) ? (JSON.parse(readFileSync(LEDGER, "utf8")) as Ledger) : { spent: 0, entries: [] }
}

function record(kind: string, credits: number, taskId?: string, file?: string) {
  const l = ledger()
  l.spent += credits
  l.entries.push({ at: new Date().toISOString(), kind, credits, taskId, file })
  writeFileSync(LEDGER, JSON.stringify(l, null, 2))
}

function guard(cost: number) {
  const { spent } = ledger()
  if (spent + cost > BUDGET_CAP) {
    throw new Error(`Refusing: ${spent} credits spent + ${cost} would pass the ${BUDGET_CAP}-credit cap. Ask Rex first.`)
  }
  return spent
}

function key(): string {
  const k = process.env.RUNWAYML_API_SECRET
  if (!k) throw new Error("Set RUNWAYML_API_SECRET in .env.local")
  return k
}

async function api(method: "GET" | "POST", route: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}${route}`, {
    method,
    headers: { Authorization: `Bearer ${key()}`, "X-Runway-Version": VERSION, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${route} -> ${res.status}: ${text.slice(0, 400)}`)
  return JSON.parse(text) as Record<string, unknown>
}

/** Poll with backoff until the task finishes (10 min cap). */
async function waitFor(taskId: string): Promise<string[]> {
  const started = Date.now()
  let delay = 4000
  for (;;) {
    await new Promise((r) => setTimeout(r, delay))
    const t = await api("GET", `/v1/tasks/${taskId}`)
    const status = String(t.status)
    process.stdout.write(`  ${status}\n`)
    if (status === "SUCCEEDED") return t.output as string[]
    if (status === "FAILED" || status === "CANCELLED") throw new Error(`Task ${taskId} ${status}: ${String(t.failure ?? "")} ${String(t.failureCode ?? "")}`)
    if (Date.now() - started > 10 * 60_000) throw new Error(`Task ${taskId} still ${status} after 10 minutes`)
    delay = Math.min(15_000, delay * 1.4)
  }
}

async function download(url: string, file: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) })
  if (!res.ok) throw new Error(`download ${res.status}`)
  writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  return file
}

function dataUri(file: string): string {
  const ext = path.extname(file).slice(1).toLowerCase()
  const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png"
  return `data:${mime};base64,${readFileSync(file).toString("base64")}`
}

function ffmpeg(args: string[]) {
  const bin = process.env.FFMPEG ?? "ffmpeg"
  try {
    execFileSync(bin, args, { stdio: "inherit" })
  } catch (e) {
    throw new Error(`ffmpeg failed or is not installed (set FFMPEG=/path/to/ffmpeg): ${(e as Error).message}`)
  }
}

async function still(run: boolean, count: number) {
  const cost = COST.still * count
  const spent = guard(cost)
  console.log(`still: gen4_image ${RATIO_IMAGE} x ${count} = ${cost} credits (spent so far ${spent}/${BUDGET_CAP})`)
  console.log(`prompt: ${STILL_PROMPT}`)
  if (!run) return console.log("dry run: add --run to generate")
  for (let i = 0; i < count; i++) {
    const seed = Math.floor(Math.random() * 4_000_000_000)
    const task = await api("POST", "/v1/text_to_image", { model: "gen4_image", promptText: STILL_PROMPT, ratio: RATIO_IMAGE, seed })
    const id = String(task.id)
    record("still", COST.still, id)
    const [url] = await waitFor(id)
    const file = await download(url, path.join(WORK, `still-${seed}.png`))
    console.log(`saved ${path.relative(process.cwd(), file)}`)
  }
}

/** Edit a still with gen4_image_turbo (reference image), 3 variations. */
async function edit(run: boolean, image: string, count = 3, preset: keyof typeof EDIT_PRESETS = "chair") {
  const prompt = EDIT_PRESETS[preset]
  if (!existsSync(image)) throw new Error(`no such image: ${image}`)
  const cost = COST.edit * count
  const spent = guard(cost)
  console.log(`edit: gen4_image_turbo ${RATIO_IMAGE} x ${count} from ${image} = ${cost} credits (spent so far ${spent}/${BUDGET_CAP})`)
  console.log(`prompt (${preset}): ${prompt}`)
  if (!run) return console.log("dry run: add --run to generate")
  const base = path.basename(image, path.extname(image))
  for (let i = 0; i < count; i++) {
    const seed = Math.floor(Math.random() * 4_000_000_000)
    const task = await api("POST", "/v1/text_to_image", {
      model: "gen4_image_turbo",
      promptText: prompt,
      ratio: RATIO_IMAGE,
      seed,
      referenceImages: [{ uri: dataUri(image), tag: "scene" }],
    })
    const id = String(task.id)
    record("edit", COST.edit, id)
    const [url] = await waitFor(id)
    const file = await download(url, path.join(WORK, `${base}-${preset}-${seed}.png`))
    console.log(`saved ${path.relative(process.cwd(), file)}`)
  }
}

async function segment(run: boolean, n: 1 | 2 | 3, image: string) {
  if (!SEGMENTS[n]) throw new Error("segment must be 1, 2, or 3")
  if (!existsSync(image)) throw new Error(`no such image: ${image}`)
  const cost = COST.segmentPerSecond * SEGMENT_SECONDS
  const spent = guard(cost)
  console.log(`segment ${n}: gen4_turbo ${RATIO_VIDEO} ${SEGMENT_SECONDS}s from ${image} = ${cost} credits (spent so far ${spent}/${BUDGET_CAP})`)
  console.log(`prompt: ${SEGMENTS[n]}`)
  if (!run) return console.log("dry run: add --run to generate")
  const task = await api("POST", "/v1/image_to_video", {
    model: "gen4_turbo",
    promptImage: dataUri(image),
    promptText: SEGMENTS[n],
    ratio: RATIO_VIDEO,
    duration: SEGMENT_SECONDS,
  })
  const id = String(task.id)
  record(`segment-${n}`, cost, id)
  const [url] = await waitFor(id)
  const file = await download(url, path.join(WORK, `seg${n}-${Date.now()}.mp4`))
  console.log(`saved ${path.relative(process.cwd(), file)}`)
}

async function clip(run: boolean, which: "a" | "b", image: string) {
  if (!CLIPS[which]) throw new Error("clip must be a or b")
  if (!existsSync(image)) throw new Error(`no such image: ${image}`)
  const cost = COST.clipPerSecond * CLIP_SECONDS
  const spent = guard(cost)
  console.log(`clip ${which}: veo3.1_fast ${RATIO_VIDEO} ${CLIP_SECONDS}s, first+last frame ${image}, no audio = ${cost} credits (spent so far ${spent}/${BUDGET_CAP})`)
  console.log(`prompt: ${CLIPS[which]}`)
  console.log(`negative: ${CLIP_NEGATIVE}`)
  if (!run) return console.log("dry run: add --run to generate")
  const uri = dataUri(image)
  const task = await api("POST", "/v1/image_to_video", {
    model: "veo3.1_fast",
    promptImage: [
      { uri, position: "first" },
      { uri, position: "last" },
    ],
    promptText: CLIPS[which],
    negativePrompt: CLIP_NEGATIVE,
    ratio: RATIO_VIDEO,
    duration: CLIP_SECONDS,
    audio: false,
  })
  const id = String(task.id)
  record(`clip-${which}`, cost, id)
  const [url] = await waitFor(id)
  const file = await download(url, path.join(WORK, `clip-${which}-${Date.now()}.mp4`))
  console.log(`saved ${path.relative(process.cwd(), file)}`)
}

function lastframe(video: string) {
  const out = video.replace(/\.mp4$/, "-last.png")
  ffmpeg(["-y", "-sseof", "-0.1", "-i", video, "-frames:v", "1", "-update", "1", out])
  console.log(`saved ${path.relative(process.cwd(), out)}`)
}

function stitch(files: string[]) {
  if (files.length < 1) throw new Error("give the segment files in order")
  const list = path.join(WORK, "concat.txt")
  writeFileSync(list, files.map((f) => `file '${path.resolve(f)}'`).join("\n"))
  mkdirSync(path.dirname(OUT), { recursive: true })
  // Re-encode: no audio, no metadata, H.264 for every browser, fast start so it plays before fully downloaded.
  ffmpeg([
    "-y", "-f", "concat", "-safe", "0", "-i", list,
    "-an", "-map_metadata", "-1", "-c:v", "libx264", "-crf", "26", "-preset", "slow",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", OUT,
  ])
  console.log(`saved ${path.relative(process.cwd(), OUT)}`)
}

async function main() {
  mkdirSync(WORK, { recursive: true })
  const [cmd, ...rest] = process.argv.slice(2)
  const run = rest.includes("--run")
  const args = rest.filter((a) => a !== "--run")
  if (cmd === "still") {
    const c = args.indexOf("--count")
    return still(run, c >= 0 ? Math.max(1, Math.min(4, Number(args[c + 1]) || 4)) : 4)
  }
  if (cmd === "edit") {
    const imgIdx = args.indexOf("--image")
    const c = args.indexOf("--count")
    const pr = args.indexOf("--preset")
    const preset = pr >= 0 && args[pr + 1] === "zoom" ? "zoom" : "chair"
    return edit(run, imgIdx >= 0 ? args[imgIdx + 1] : "", c >= 0 ? Math.max(1, Math.min(3, Number(args[c + 1]) || 3)) : 3, preset)
  }
  if (cmd === "segment") {
    const imgIdx = args.indexOf("--image")
    return segment(run, Number(args[0]) as 1 | 2 | 3, imgIdx >= 0 ? args[imgIdx + 1] : "")
  }
  if (cmd === "clip") {
    const imgIdx = args.indexOf("--image")
    return clip(run, args[0] as "a" | "b", imgIdx >= 0 ? args[imgIdx + 1] : "")
  }
  if (cmd === "lastframe") return lastframe(args[0])
  if (cmd === "stitch") return stitch(args)
  if (cmd === "ledger") return console.log(JSON.stringify(ledger(), null, 2))
  console.log("usage: still | edit --image <file> | segment <1|2|3> --image <file> | clip a|b --image <file> | lastframe <mp4> | stitch <mp4...> | ledger   (add --run to spend)")
}

main().catch((e) => {
  console.error((e as Error).message)
  process.exit(1)
})
