"use client"

/**
 * Patient phone (plan §5): P1 welcome -> P2 safety + setup -> instructions + countdown -> P3 chair stand
 * <-> P3a paused -> P4 four questions -> P5 closing (or the emergency screen alone on a red flag).
 * Never shows a score, a stand count, a norm, or "below average". Every instruction is spoken and captioned.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { AlertTriangle, Check, Phone, Square } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import protocol from "@/config/protocol.default.json"
import lines from "@/content/patient-lines.json"
import { closingLines } from "@/lib/feedback"
import { StandCounter, type CounterSummary } from "@/lib/pose/counter"
import { triage } from "@/lib/rules"
import { sendEvent, sendResult } from "@/lib/session-client"
import { steadiScore } from "@/lib/steadi"
import type { CheckIn as PriorCheckIn, Recommendation, SeedPatient, SessionResult, SessionStatus, Symptoms, Trend } from "@/lib/types"
import { cn } from "@/lib/utils"
import { usePose } from "./use-pose"
import { useVoice } from "./use-voice"

type Step = "welcome" | "setup" | "instructions" | "test" | "paused" | "questions" | "closing" | "emergency"

const DURATION_MS = protocol.test.duration_s * 1000
const RESUME_WINDOW_MS = protocol.thresholds.stop_resume_window_s * 1000
const QUESTIONS = protocol.symptom_questions
const SETUP_CHECKS = [
  { id: "chair", voice: "setup_chair" },
  { id: "helper", voice: "setup_helper" },
  { id: "phone", voice: "setup_phone" },
] as const

/** Easier / same / harder than last time, from the patient's own history (plan §5). */
function trendVsPrevious(s: CounterSummary, prev: PriorCheckIn | undefined, finishedEarly: boolean): Trend | "first" | "finished_early" {
  if (finishedEarly) return "finished_early"
  if (!prev) return "first"
  const newArms = s.armsUsed && !prev.arms_used
  if (s.rawStands < prev.raw_stands || newArms) return "harder"
  if (s.rawStands > prev.raw_stands) return "better"
  return "same"
}

const btn = "h-14 w-full text-xl"

export function CheckIn({ patient, clinicName }: { patient: SeedPatient; clinicName: string }) {
  const firstName = patient.display_name.split(" ")[0]
  const prev = patient.checkins[patient.checkins.length - 1]
  const [sessionId] = useState(() => `${patient.rise_id}-${Date.now().toString(36)}`)

  const [step, setStep] = useState<Step>("welcome")
  const [checks, setChecks] = useState<Record<string, boolean>>({})
  const [facing, setFacing] = useState<"environment" | "user">("environment")
  const [demo, setDemo] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [repPulse, setRepPulse] = useState(0)
  const [qi, setQi] = useState(0)
  const [pain, setPain] = useState(0)
  const [answers, setAnswers] = useState<Partial<Symptoms>>({})
  const [closing, setClosing] = useState<string[]>([])
  const [note, setNote] = useState("")
  const [noteSent, setNoteSent] = useState<"open" | "sent" | "skipped">("open")
  const [result, setResult] = useState<SessionResult | null>(null)

  const voice = useVoice()
  const { videoRef, canvasRef, setFrameHandler, setTierHandler, tier, status: poseStatus, error: poseError, visible, ready, startLive, startSeeded } = usePose()

  // Test clock: ms of active testing since Go (stops while paused). Negative before Go.
  const clockAcc = useRef(0)
  const clockRun = useRef<number | null>(null)
  const clock = useCallback(() => clockAcc.current + (clockRun.current === null ? 0 : performance.now() - clockRun.current), [])
  /** Set the test clock to `ms` and run or hold it. */
  const setClock = useCallback((ms: number, running: boolean) => {
    clockAcc.current = ms
    clockRun.current = running ? performance.now() : null
  }, [])
  const counter = useRef<StandCounter | null>(null)
  const summary = useRef<CounterSummary | null>(null)
  const finishedEarly = useRef(false)
  const resumed = useRef(false)
  const startedAt = useRef(0)
  const halfwaySaid = useRef(false)
  const pausedAt = useRef<number | null>(null)
  const countdownStarted = useRef(false)
  const stepRef = useRef(step)
  useEffect(() => void (stepRef.current = step), [step])

  const status = useCallback((s: SessionStatus) => sendEvent({ type: "status", sessionId, status: s, tier: tier ?? undefined, at: Date.now() }), [sessionId, tier])

  // ---- frames -> counter
  const pauseTest = useCallback(
    (reason: "button" | "no_stand") => {
      if (clockRun.current === null) return
      setClock(clock(), false)
      pausedAt.current = Date.now()
      sendEvent({ type: "stop", sessionId, reason, at: Date.now() })
      status("paused")
      setStep("paused")
      void voice.say("paused")
    },
    [clock, setClock, sessionId, status, voice],
  )

  useEffect(() => {
    setFrameHandler((kp) => {
      const c = counter.current
      if (!c || !kp) return
      if (step === "instructions") {
        c.push({ t: clock(), kp })
        return
      }
      if (step !== "test") return
      for (const e of c.push({ t: clock(), kp })) {
        if (e.type === "rep") {
          setRepPulse((n) => n + 1)
          sendEvent({ type: "rep", sessionId, count: e.count, armsUsed: e.rep.armsUsed, at: Date.now() })
          if (e.count <= 20) void voice.say(`count_${e.count}`, "", { caption: false })
        } else if (e.type === "arm_use") {
          void voice.say("arms_reminder")
        } else if (e.type === "no_stand") {
          pauseTest("no_stand")
        }
      }
    })
  }, [step, clock, setFrameHandler, sessionId, voice, pauseTest])

  useEffect(() => {
    setTierHandler((t, fps) => sendEvent({ type: "tier", sessionId, tier: t, fps, at: Date.now() }))
  }, [setTierHandler, sessionId])

  // ---- test timer
  const finishTest = useCallback(
    (early: boolean) => {
      const c = counter.current
      if (!c || summary.current) return
      const t = early ? clock() : DURATION_MS
      setClock(t, false)
      finishedEarly.current = early
      summary.current = c.finish(t)
      if (early) sendEvent({ type: "finished_early", sessionId, at: Date.now() })
      status("questions")
      setStep("questions")
      if (!early) void voice.say("time_up").then(() => voice.say(`q_${QUESTIONS[0].id}`))
      else void voice.say(`q_${QUESTIONS[0].id}`)
    },
    [clock, setClock, sessionId, status, voice],
  )

  useEffect(() => {
    if (step !== "test") return
    let raf = 0
    const tick = () => {
      const t = clock()
      setElapsed(t)
      if (!halfwaySaid.current && t >= DURATION_MS / 2) {
        halfwaySaid.current = true
        void voice.say("halfway")
      }
      if (t >= DURATION_MS) finishTest(false)
      else raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [step, clock, finishTest, voice])

  // Paused with no answer: treat as finished early after the resume window.
  useEffect(() => {
    if (step !== "paused") return
    const id = setTimeout(() => finishTest(true), RESUME_WINDOW_MS)
    return () => clearTimeout(id)
  }, [step, finishTest])

  // ---- step actions
  const begin = () => {
    setStep("setup")
    status("setting_up")
    void voice.say("setup_chair")
  }

  const startCamera = (f: "environment" | "user") => {
    setDemo(false)
    void startLive(f)
  }

  const toggleDemo = (on: boolean) => {
    setDemo(on)
    if (on) startSeeded(patient, clock)
    else void startLive(facing)
  }

  const allChecked = SETUP_CHECKS.every((c) => checks[c.id])
  const framed = demo || visible
  const canStart = allChecked && ready && framed

  const startInstructions = async () => {
    counter.current = new StandCounter({ stopNoStandS: protocol.thresholds.stop_no_stand_s, pauseS: protocol.thresholds.orthostatic_pause_s })
    setClock(-60_000, true)
    setStep("instructions")
    for (const id of ["instr_1", "instr_2", "instr_3", "instr_4", "instr_5"]) {
      await voice.say(id)
      // Skipped ("start now") or stopped while this line played.
      if (stepRef.current !== "instructions" || countdownStarted.current) return
    }
    goCountdown()
  }


  const goCountdown = () => {
    if (countdownStarted.current) return
    countdownStarted.current = true
    void voice.say("countdown")
    let n = 3
    setCountdown(n)
    const id = setInterval(() => {
      n--
      if (n > 0) setCountdown(n)
      else {
        clearInterval(id)
        setCountdown(null)
        // Go: calibrate on the seated frames, start the 30 s clock at 0.
        setClock(0, true)
        startedAt.current = Date.now()
        counter.current!.start(0)
        status("testing")
        setStep("test")
      }
    }, 1000)
  }
  const keepGoing = () => {
    resumed.current = true
    pausedAt.current = null
    counter.current?.resume(clock())
    setClock(clock(), true)
    sendEvent({ type: "resume", sessionId, at: Date.now() })
    status("testing")
    setStep("test")
    voice.stop()
    voice.setCaption("")
  }

  const buildResult = useCallback(
    (symptoms: Symptoms, patientNote?: string): SessionResult => {
      const s = summary.current!
      const scripted = patient.scripted_today
      return {
        sessionId,
        riseId: patient.rise_id,
        rawStands: s.rawStands,
        armsUsed: s.armsUsed,
        armsFromRep: s.armsFromRep,
        steadiScore: steadiScore(s.rawStands, s.armsUsed),
        asymmetryPct: s.asymmetryPct,
        favoring: s.favoring,
        pausesOver3s: s.pausesOver3s,
        stoppedEarly: finishedEarly.current,
        resumedAfterPause: resumed.current,
        // The phone doesn't measure these; demo sessions carry the scripted values.
        tandemHoldS: demo ? scripted.balance_tandem_hold_s : undefined,
        gaitObservations: demo ? (scripted.gait_observations ?? []) : [],
        symptoms,
        patientNote,
        tier: tier ?? "seeded",
        demoData: demo || tier === "seeded",
        startedAt: startedAt.current,
        finishedAt: Date.now(),
      }
    },
    [demo, patient, tier, sessionId],
  )

  const answer = async (id: string, value: boolean | number) => {
    const next = { ...answers, [id]: value }
    setAnswers(next)
    const q = QUESTIONS.find((x) => x.id === id)
    if (q && "red_flag" in q && q.red_flag && value === true) return finishQuestions(next)
    if (qi + 1 < QUESTIONS.length) {
      setQi(qi + 1)
      void voice.say(`q_${QUESTIONS[qi + 1].id}`)
    } else finishQuestions(next)
  }

  const finishQuestions = (a: Partial<Symptoms>) => {
    const symptoms: Symptoms = {
      pain_0_10: Number(a.pain_0_10 ?? 0),
      dizzy: !!a.dizzy,
      short_of_breath_or_chest_pain: !!a.short_of_breath_or_chest_pain,
      calf_pain_or_swelling: !!a.calf_pain_or_swelling,
      new_incontinence: demo ? patient.scripted_today.symptoms.new_incontinence : false,
    }
    const r = buildResult(symptoms)
    setResult(r)
    sendResult(r)
    status("scoring")
    const decision = triage(r, prev, patient.episode.post_op_day_today)
    if (decision.emergency) {
      setStep("emergency")
      void voice.say("emergency")
      return
    }
    const trend = trendVsPrevious(summary.current!, prev, finishedEarly.current)
    const rec: Recommendation | "finished_early" = finishedEarly.current ? "finished_early" : decision.recommendation
    const out = closingLines({ trend, recommendation: rec, redFlag: false, clinicName })
    setClosing(out)
    setStep("closing")
    const nextId = rec === "human_confirm" || rec === "finished_early" ? "next_finished_early" : `next_${rec}`
    void (async () => {
      await voice.say(`trend_${trend}`, out[0])
      await voice.say(nextId, out[1])
      await voice.say("closure", out[2])
      await voice.say("note_prompt", lines.note_prompt)
    })()
  }

  const sendNote = (skip: boolean) => {
    voice.stop()
    if (!skip && note.trim() && result) sendResult({ ...result, patientNote: note.trim() })
    setNoteSent(skip || !note.trim() ? "skipped" : "sent")
  }

  // ---- render
  const progress = Math.min(1, Math.max(0, elapsed / DURATION_MS))
  const showCamera = step === "setup" || step === "instructions" || step === "test" || step === "paused"

  if (step === "emergency") {
    return (
      <main className="flex min-h-dvh flex-col justify-center gap-8 bg-red-700 px-5 py-10 text-white" role="alert">
        <AlertTriangle aria-hidden className="size-16" />
        <p className="text-3xl font-semibold leading-snug">{lines.emergency}</p>
        <Button asChild size="lg" className="h-16 bg-white text-2xl text-red-700 hover:bg-white/90">
          <a href="tel:911">
            <Phone aria-hidden className="size-6" /> Call 911
          </a>
        </Button>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 text-xl">
      <header className="flex items-center justify-between gap-2">
        <span className="text-base font-medium text-muted-foreground">{clinicName}</span>
        <div className="flex gap-2">
          {(demo || tier === "seeded") && <Badge variant="outline">Demo data</Badge>}
          <Badge variant="secondary">Synthetic patient</Badge>
        </div>
      </header>

      {/* Camera / skeleton: mounted across setup and test so the stream survives step changes. */}
      <div className={cn("relative overflow-hidden rounded-xl bg-black", showCamera ? "block" : "hidden", step === "test" || step === "paused" ? "aspect-[3/4]" : "aspect-[4/3]")}>
        <video ref={videoRef} playsInline muted className={cn("h-full w-full object-cover", demo && "hidden", facing === "user" && "-scale-x-100")} />
        <canvas ref={canvasRef} className={cn("pointer-events-none absolute inset-0 h-full w-full", facing === "user" && !demo && "-scale-x-100")} />
        {step === "setup" && ready && (
          <div className={cn("absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-lg px-3 py-2 text-lg font-medium", framed ? "bg-emerald-600 text-white" : "bg-amber-400 text-black")} aria-live="polite">
            {framed ? <Check aria-hidden className="size-5" /> : <AlertTriangle aria-hidden className="size-5" />}
            {framed ? "I can see all of you" : "Step back so I can see you head to feet"}
          </div>
        )}
        {(step === "test" || step === "paused") && (
          <>
            <TimeRing progress={progress} />
            <div key={repPulse} className={cn("absolute left-3 top-3 rounded-full bg-emerald-500 p-3 text-white", repPulse ? "animate-in fade-in zoom-in duration-300" : "hidden")} aria-hidden>
              <Check className="size-8" />
            </div>
          </>
        )}
        {countdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-8xl font-bold text-white" aria-live="assertive">{countdown}</div>
        )}
      </div>

      {voice.caption && (step === "setup" || step === "instructions" || step === "test") && (
        <p className="min-h-16 rounded-lg bg-muted px-4 py-3 text-xl leading-snug" aria-live="polite">{voice.caption}</p>
      )}

      {step === "welcome" && (
        <section className="flex flex-1 flex-col justify-center gap-6">
          <h1 className="text-3xl font-semibold leading-tight">Hi {firstName}, your care team at {clinicName} asked for a 2-minute check-in.</h1>
          <p className="text-muted-foreground">A voice will guide you through every step. You can stop at any time.</p>
          <Button size="lg" className={btn} onClick={begin}>Start</Button>
        </section>
      )}

      {step === "setup" && (
        <section className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">Before we start</h1>
          {SETUP_CHECKS.map((c) => (
            <div key={c.id} className="flex items-start gap-3 rounded-lg border p-4">
              <Checkbox id={c.id} className="mt-1 size-7" checked={!!checks[c.id]} onCheckedChange={(v) => {
                setChecks((x) => ({ ...x, [c.id]: v === true }))
                const next = SETUP_CHECKS[SETUP_CHECKS.findIndex((x) => x.id === c.id) + 1]
                if (v === true && next && !checks[next.id]) void voice.say(next.voice)
                if (v === true && !next && !ready && !demo) startCamera(facing)
              }} />
              <Label htmlFor={c.id} className="text-xl font-normal leading-snug">{voice.text(c.voice)}</Label>
            </div>
          ))}
          {!ready && !demo && (
            <Button size="lg" variant="secondary" className={btn} onClick={() => startCamera(facing)} disabled={!allChecked}>Turn on the camera</Button>
          )}
          {poseStatus && <p aria-live="polite" className="text-muted-foreground">{poseStatus}</p>}
          {poseError && !demo && <p role="alert" className="text-destructive">{poseError}</p>}
          <div className="flex items-center justify-between gap-3 text-base">
            <Button variant="ghost" size="lg" onClick={() => { const f = facing === "user" ? "environment" : "user"; setFacing(f); if (!demo) startCamera(f) }}>
              Use {facing === "user" ? "back" : "front"} camera
            </Button>
            <div className="flex items-center gap-2">
              <Switch id="demo" checked={demo} onCheckedChange={toggleDemo} />
              <Label htmlFor="demo" className="text-base">Use demo recording</Label>
            </div>
          </div>
          <Button size="lg" className={btn} disabled={!canStart} onClick={() => void startInstructions()}>
            I&apos;m ready
          </Button>
        </section>
      )}

      {step === "instructions" && (
        <Button size="lg" variant="secondary" className={btn} onClick={() => { voice.stop(); goCountdown() }} disabled={countdown !== null}>
          I know what to do — start now
        </Button>
      )}

      {(step === "test" || step === "instructions") && (
        <Button size="lg" variant="destructive" className="sticky bottom-4 h-16 w-full text-2xl" onClick={() => (step === "test" ? pauseTest("button") : setStep("setup"))}>
          <Square aria-hidden className="size-6 fill-current" /> Stop
        </Button>
      )}

      {step === "paused" && (
        <section className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">{voice.text("paused")}</h1>
          <Button size="lg" className={btn} onClick={keepGoing}>Keep going</Button>
          <Button size="lg" variant="secondary" className={btn} onClick={() => finishTest(true)}>Finish here</Button>
        </section>
      )}

      {step === "questions" && (
        <Question
          key={QUESTIONS[qi].id}
          q={QUESTIONS[qi]}
          index={qi}
          pain={pain}
          setPain={setPain}
          onAnswer={(v) => void answer(QUESTIONS[qi].id, v)}
        />
      )}

      {step === "closing" && (
        <section className="flex flex-col gap-5">
          {closing.map((l, i) => (
            <p key={i} className={cn("leading-snug", i === 0 && "text-2xl font-semibold")}>{l}</p>
          ))}
          {noteSent === "open" ? (
            <div className="flex flex-col gap-3 rounded-lg border p-4">
              <Label htmlFor="note" className="text-xl font-normal leading-snug">{lines.note_prompt}</Label>
              <Textarea id="note" rows={3} className="text-xl" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Type, or tap the microphone on your keyboard" />
              <Button size="lg" className={btn} onClick={() => sendNote(false)} disabled={!note.trim()}>Send to my nurse</Button>
              <Button size="lg" variant="ghost" className={btn} onClick={() => sendNote(true)}>Skip</Button>
            </div>
          ) : (
            <p className="rounded-lg bg-muted px-4 py-3" aria-live="polite">
              {noteSent === "sent" ? "Your note was sent to your nurse. " : ""}You can close this page now.
            </p>
          )}
        </section>
      )}
    </main>
  )
}

function TimeRing({ progress }: { progress: number }) {
  const r = 26, c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 64 64" className="absolute right-3 top-3 size-20 -rotate-90" role="img" aria-label={`${Math.round(progress * 100)} percent of the time done`}>
      <circle cx="32" cy="32" r={r} fill="rgba(0,0,0,.45)" stroke="rgba(255,255,255,.3)" strokeWidth="6" />
      <circle cx="32" cy="32" r={r} fill="none" stroke="#34d399" strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} />
    </svg>
  )
}

type Q = (typeof QUESTIONS)[number]

function Question({ q, index, pain, setPain, onAnswer }: { q: Q; index: number; pain: number; setPain: (n: number) => void; onAnswer: (v: boolean | number) => void }) {
  return (
    <section className="flex flex-col gap-5" aria-labelledby={`q-${q.id}`}>
      <p className="text-base text-muted-foreground">Question {index + 1} of {QUESTIONS.length}</p>
      <h1 id={`q-${q.id}`} className="text-2xl font-semibold leading-snug">{q.text}</h1>
      {q.type === "slider" ? (
        <>
          <div className="flex items-center gap-4">
            <span className="text-base">0</span>
            <Slider value={[pain]} min={0} max={10} step={1} onValueChange={(v) => setPain(v[0])} aria-labelledby={`q-${q.id}`} className="py-4" />
            <span className="text-base">10</span>
          </div>
          <p className="text-center text-4xl font-semibold" aria-live="polite">{pain}</p>
          <Button size="lg" className={btn} onClick={() => onAnswer(pain)}>Next</Button>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Button size="lg" variant="secondary" className="h-20 text-2xl" onClick={() => onAnswer(true)}>Yes</Button>
          <Button size="lg" variant="secondary" className="h-20 text-2xl" onClick={() => onAnswer(false)}>No</Button>
        </div>
      )}
    </section>
  )
}
