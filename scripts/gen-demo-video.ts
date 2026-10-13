/**
 * AI-generated demo footage for "Use demo recording" (Runway API). One 30 s portrait video of a synthetic older adult
 * doing a CDC STEADI chair stand, built from a still plus three 10 s segments, each starting on the last frame of the
 * one before. Used by both the classic check-in (plays once) and RehabNinja (loops).
 *
 *   npx tsx scripts/gen-demo-video.ts still            dry run: show the request and credit cost
 *   npx tsx scripts/gen-demo-video.ts still --run      generate 4 still options (4 x 5 credits)
 *   npx tsx scripts/gen-demo-video.ts segment 1 --image .demo-work/still-123.png [--run]   (50 credits)
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
const COST = { still: 5, segmentPerSecond: 5 } // gen4_image 720p; gen4_turbo per second (pricing guide)
const SEGMENT_SECONDS = 10
const RATIO_IMAGE = "720:1280"
const RATIO_VIDEO = "720:1280"

const CAMERA = "Static camera resting on the floor; the whole body stays in frame from head to feet. No camera movement, no cuts, no zoom."

const STILL_PROMPT =
  "Photorealistic vertical photo taken by a phone propped on the floor about 2.5 meters away, slightly low angle, " +
  "showing the full body from head to feet of a 70-year-old person in plain comfortable clothes (gray sweatpants, " +
  "navy long-sleeve top, white sneakers) sitting upright in the middle of a sturdy wooden chair without armrests, " +
  "pushed back against a plain light wall. Arms crossed at the wrists over the chest, hands on opposite shoulders, " +
  "feet flat on the floor. Bright even daylight in a tidy living room, uncluttered, no other people, no text."

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
  if (cmd === "still") return still(run, 4)
  if (cmd === "segment") {
    const imgIdx = args.indexOf("--image")
    return segment(run, Number(args[0]) as 1 | 2 | 3, imgIdx >= 0 ? args[imgIdx + 1] : "")
  }
  if (cmd === "lastframe") return lastframe(args[0])
  if (cmd === "stitch") return stitch(args)
  if (cmd === "ledger") return console.log(JSON.stringify(ledger(), null, 2))
  console.log("usage: still | segment <1|2|3> --image <file> | lastframe <mp4> | stitch <mp4...> | ledger   (add --run to spend)")
}

main().catch((e) => {
  console.error((e as Error).message)
  process.exit(1)
})
