"use client"

/**
 * Patient phone (plan §5): P1 welcome -> P2 safety + setup -> instructions + countdown -> P3 chair stand
 * <-> P3a paused -> P4 four questions -> P5 closing (or the emergency screen alone on a red flag).
 * Setup and closing go one screen at a time: one picture, one question, one big button.
 * Never shows a score, a stand count, a norm, or "below average". Every instruction is spoken and captioned.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import Link from "next/link"
import { AlertTriangle, ArrowLeft, Check, Loader2, Phone, Square, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import protocol from "@/config/protocol.default.json"
import lines from "@/content/patient-lines.json"
import { closingLines } from "@/lib/feedback"
import { StandCounter, type CounterSummary } from "@/lib/pose/counter"
import { triage } from "@/lib/rules"
import { resolvePlaySessionId } from "@/lib/play/playResult"
import { SetupGuide } from "./setup-guide"
import { sendEvent, sendResult, setInviteToken } from "@/lib/session-client"
import { steadiScore } from "@/lib/steadi"
import type { CheckIn as PriorCheckIn, PatientInvite, Recommendation, SeedPatient, SessionResult, SessionStatus, Symptoms, Trend } from "@/lib/types"
import { cn } from "@/lib/utils"
import { ptCta, ptSecondary, ptStop } from "@/components/play/ptClasses"
import { usePose } from "./use-pose"
import { useVoice } from "./use-voice"

type Step = "welcome" | "setup" | "instructions" | "test" | "paused" | "questions" | "closing" | "emergency"

const DURATION_MS = protocol.test.duration_s * 1000
const RESUME_WINDOW_MS = protocol.thresholds.stop_resume_window_s * 1000
const QUESTIONS = protocol.symptom_questions
const SETUP_CHECKS = [
  { id: "chair", voice: "setup_chair", confirm: "My chair is ready" },
  { id: "helper", voice: "setup_helper", confirm: "Someone is nearby" },
  { id: "phone", voice: "setup_phone", confirm: "My phone is in place" },
] as const
/** Setup screens: the three safety checks, then "can I see all of you?". */
const SETUP_STEPS = SETUP_CHECKS.length + 1
const CLOSE_STEPS = 3
type CloseKind = "today" | "next" | "note"
const CLOSE_TITLE: Record<CloseKind, string> = { today: "How today went", next: "What happens next", note: "A note for your nurse" }

/** Easier / same / harder than last time, from the patient's own history (plan §5). */
function trendVsPrevious(s: CounterSummary, prev: PriorCheckIn | undefined, finishedEarly: boolean): Trend | "first" | "finished_early" {
  if (finishedEarly) return "finished_early"
  if (!prev) return "first"
  const newArms = s.armsUsed && !prev.arms_used
  if (s.rawStands < prev.raw_stands || newArms) return "harder"
  if (s.rawStands > prev.raw_stands) return "better"
  return "same"
}

// Patient tokens (app/globals.css pt-*): 56px buttons, 20px text, visible focus.
const btn = ptCta
const btn2 = ptSecondary

export function CheckIn({
  patient,
  clinicName,
  invite,
  demoParam = false,
}: {
  patient: SeedPatient
  clinicName: string
  /** The console invite behind ?i=, resolved on the server (null for an unlinked visit). */
  invite: PatientInvite | null
  /** ?demo=1 on an unlinked visit: start with the demo recording on. Ignored when there is an invite. */
  demoParam?: boolean
}) {
  const firstName = patient.display_name.split(" ")[0]
  const prev = patient.checkins[patient.checkins.length - 1]
  // A valid invite (resolved on the server) fixes the session, the token for every write, and demo vs real.
  const [sessionId] = useState(() => invite?.sessionId ?? resolvePlaySessionId(patient.rise_id, undefined, Date.now()))
  useLayoutEffect(() => setInviteToken(invite?.token ?? null), [invite?.token])

  const [step, setStep] = useState<Step>("welcome")
  const [checks, setChecks] = useState<Record<string, boolean>>({})
  /** 0..2 = a safety check, 3 = framing. */
  const [setupIdx, setSetupIdx] = useState(0)
  const [facing, setFacing] = useState<"environment" | "user">("environment")
  const [demo, setDemo] = useState(invite ? invite.demo : demoParam)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [repPulse, setRepPulse] = useState(0)
  const [qi, setQi] = useState(0)
  const [pain, setPain] = useState(0)
  const [answers, setAnswers] = useState<Partial<Symptoms>>({})
  const [closing, setClosing] = useState<string[]>([])
  /** Voice ids for closing[0] (trend) and closing[1] (next step). */
  const [closingIds, setClosingIds] = useState<[string, string]>(["", ""])
  /** Index into closeOrder. */
  const [closeIdx, setCloseIdx] = useState(0)
  /** When the care team will reach out, that comes first so it is seen and heard without a tap. */
  const [closeOrder, setCloseOrder] = useState<CloseKind[]>(["today", "next", "note"])
  const [noteError, setNoteError] = useState(false)
  // Each step change moves focus to the new heading, so screen readers and keyboards follow the page.
  const setupHeading = useRef<HTMLHeadingElement>(null)
  const closeHeading = useRef<HTMLHeadingElement>(null)
  const [note, setNote] = useState("")
  const [noteSent, setNoteSent] = useState<"open" | "sent" | "skipped">("open")
  const [result, setResult] = useState<SessionResult | null>(null)

  const voice = useVoice()
  const { videoRef, canvasRef, setFrameHandler, setTierHandler, tier, status: poseStatus, error: poseError, visible, ready, demoVideo, startLive, startSeeded } = usePose()

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
    setSetupIdx(0)
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

  // ?demo=1 opens on the demo recording: start its replay when the setup step (and the camera frame) appears.
  const demoStarted = useRef(false)
  useEffect(() => {
    if (step !== "setup" || !demo || demoStarted.current) return
    demoStarted.current = true
    startSeeded(patient, clock)
  }, [step, demo, patient, clock, startSeeded])

  /** "Yes" on the current safety check: tick it, read the next one, or turn the camera on after the last. */
  const confirmCheck = () => {
    const c = SETUP_CHECKS[setupIdx]
    if (!c) return
    setChecks((x) => ({ ...x, [c.id]: true }))
    const nextIdx = setupIdx + 1
    setSetupIdx(nextIdx)
    const next = SETUP_CHECKS[nextIdx]
    if (next) void voice.say(next.voice)
    else {
      voice.stop()
      voice.setCaption("")
      if (!ready && !demo) startCamera(facing)
    }
  }

  const backSetup = () => {
    const i = Math.max(0, setupIdx - 1)
    setSetupIdx(i)
    void voice.say(SETUP_CHECKS[i].voice)
  }

  useEffect(() => {
    if (step === "setup" && setupIdx > 0) setupHeading.current?.focus()
  }, [step, setupIdx])
  useEffect(() => {
    if (step === "closing") closeHeading.current?.focus()
  }, [step, closeIdx])

  /** Demo only: a presenter goes straight to the framing screen. */
  const skipSetup = () => {
    voice.stop()
    voice.setCaption("")
    setChecks(Object.fromEntries(SETUP_CHECKS.map((c) => [c.id, true])))
    setSetupIdx(SETUP_CHECKS.length)
  }

  // The patient is a few steps from the phone on the framing screen, so the framing result is spoken too.
  const framingSaid = useRef<boolean | null>(null)
  const onFramingScreen = step === "setup" && setupIdx === SETUP_CHECKS.length && ready
  const framedNow = demo || visible
  const say = voice.say
  useEffect(() => {
    if (!onFramingScreen) {
      framingSaid.current = null
      return
    }
    if (framingSaid.current === framedNow) return
    // Speak a change only once it has held for a second, so a flickering detection doesn't chatter.
    const id = setTimeout(() => {
      framingSaid.current = framedNow
      void say(framedNow ? "framing_ok" : "framing_back")
    }, 1000)
    return () => clearTimeout(id)
  }, [onFramingScreen, framedNow, say])

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


  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  /** Stop pressed (or the page left) during 3-2-1: the test must not start. */
  const cancelCountdown = useCallback(() => {
    if (countdownTimer.current) clearInterval(countdownTimer.current)
    countdownTimer.current = null
    countdownStarted.current = false
    setCountdown(null)
  }, [])
  useEffect(() => cancelCountdown, [cancelCountdown])

  const goCountdown = () => {
    if (countdownStarted.current) return
    countdownStarted.current = true
    void voice.say("countdown")
    let n = 3
    setCountdown(n)
    const id = (countdownTimer.current = setInterval(() => {
      n--
      if (n > 0) setCountdown(n)
      else {
        clearInterval(id)
        countdownTimer.current = null
        setCountdown(null)
        // Go: calibrate on the seated frames, start the 30 s clock at 0.
        setClock(0, true)
        startedAt.current = Date.now()
        counter.current!.start(0)
        status("testing")
        setStep("test")
      }
    }, 1000))
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
        protocol: "steadi_30s",
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
        scripted: demo ? ["new_incontinence", "gait", "tandem"] : [],
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
    void sendResult(r)
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
    const nextId = rec === "human_confirm" || rec === "finished_early" ? "next_finished_early" : `next_${rec}`
    const order: CloseKind[] = rec === "continue_plan" ? ["today", "next", "note"] : ["next", "today", "note"]
    setClosing(out)
    setClosingIds([`trend_${trend}`, nextId])
    setCloseOrder(order)
    setCloseIdx(0)
    setStep("closing")
    sayClose(order[0], out, [`trend_${trend}`, nextId])
  }

  /** Each closing screen reads its own line when it opens. */
  const sayClose = (kind: CloseKind, out = closing, ids = closingIds) => {
    if (kind === "today") void voice.say(ids[0], out[0])
    else if (kind === "next") void voice.say(ids[1], out[1])
    else if (noteSent === "open") void voice.say("note_prompt", lines.note_prompt)
    else void voice.say("closure", out[2])
  }

  const goClose = (i: number) => {
    const j = Math.max(0, Math.min(CLOSE_STEPS - 1, i))
    setCloseIdx(j)
    sayClose(closeOrder[j])
  }

  const [noteSending, setNoteSending] = useState(false)
  const [noteFailed, setNoteFailed] = useState(false)
  const sendNote = async (skip: boolean) => {
    if (!skip && !note.trim()) {
      setNoteError(true)
      return
    }
    voice.stop()
    if (!skip && result) {
      // Only say "sent" once the server has it: a note can carry something the nurse must see.
      setNoteSending(true)
      const ok = await sendResult({ ...result, patientNote: note.trim() })
      setNoteSending(false)
      if (!ok) {
        setNoteFailed(true)
        return
      }
    }
    setNoteFailed(false)
    setNoteSent(skip ? "skipped" : "sent")
    void voice.say("closure", closing[2])
  }

  /** Leave the demo from any screen: stop speaking and the countdown, then go back to the start screen. */
  const exitDemo = () => {
    voice.stop()
    cancelCountdown()
  }

  // ---- render
  const progress = Math.min(1, Math.max(0, elapsed / DURATION_MS))
  const showCamera = step === "setup" || step === "instructions" || step === "test" || step === "paused"
  /** Safety-check screens show a picture in a landscape frame; framing and the test use a portrait frame. */
  const picture = step === "setup" && setupIdx < SETUP_CHECKS.length
  const isDemo = demo || tier === "seeded"

  if (step === "emergency") {
    return (
      <main className="flex min-h-dvh flex-col justify-center gap-8 bg-pt-danger-fill px-5 py-10 text-white" role="alert">
        <AlertTriangle aria-hidden className="size-16" />
        <p className="text-3xl font-semibold leading-snug">{lines.emergency.line}</p>
        <Button asChild size="lg" className="h-16 bg-white text-2xl text-pt-danger-fill hover:bg-white/90">
          <a href="tel:911">
            <Phone aria-hidden className="size-6" /> Call 911
          </a>
        </Button>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 bg-pt-bg px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 text-xl text-pt-ink">
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xl font-medium text-pt-muted">{clinicName}</span>
          {demo ? (
            <Link
              href="/"
              onClick={exitDemo}
              className="inline-flex min-h-14 shrink-0 items-center gap-2 rounded-full border border-pt-line px-4 text-xl font-medium text-pt-ink outline-none hover:bg-pt-surface-2 focus-visible:ring-[3px] focus-visible:ring-pt-focus"
            >
              <X aria-hidden className="size-5" /> Exit demo
            </Link>
          ) : (
            !isDemo && <Badge className="border-0 bg-pt-surface-2 text-base text-pt-ink">Synthetic patient</Badge>
          )}
        </div>
        {/* "Demo data" whenever the replay is in use, including a camera fallback; Exit demo only in demo mode. */}
        {isDemo && (
          <div className="flex gap-2">
            <Badge className="border border-pt-accent/50 bg-transparent text-base text-pt-ink">Demo data</Badge>
            <Badge className="border-0 bg-pt-surface-2 text-base text-pt-ink">Synthetic patient</Badge>
          </div>
        )}
      </header>

      {/* Camera / skeleton: mounted across setup and test so the stream survives step changes. */}
      <div
        className={cn(
          "relative mx-auto w-full overflow-hidden rounded-xl bg-black",
          showCamera ? "block" : "hidden",
          // Portrait frame, height-capped so the main button stays in view (shorter on the framing screen, which has more below it).
          picture ? "aspect-[4/3]" : step === "setup" ? "aspect-[3/4] max-w-[calc(40dvh*0.75)]" : "aspect-[3/4] max-w-[calc(56dvh*0.75)]",
        )}
      >
        <video ref={videoRef} playsInline muted className={cn("h-full w-full", demo ? "object-contain" : "object-cover", demo && !demoVideo && "hidden", facing === "user" && !demo && "-scale-x-100")} />
        {demo && demoVideo && !picture && (
          // Bottom centre, clear of her face and the timer ring.
          <span className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/70 px-3 py-1 text-base font-medium text-white">
            AI-generated demo video
          </span>
        )}
        <canvas ref={canvasRef} className={cn("pointer-events-none absolute inset-0 h-full w-full", facing === "user" && !demo && "-scale-x-100")} />
        {/* Each safety-check screen shows what that check looks like. */}
        {picture && <SetupGuide step={SETUP_CHECKS[setupIdx].id} />}
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

      {/* Setup and closing screens print their spoken line as the heading, so the caption box is for the test only. */}
      {voice.caption && (step === "instructions" || step === "test" || (step === "questions" && voice.caption !== QUESTIONS[qi].text)) && (
        <p className="min-h-16 rounded-lg bg-pt-surface px-4 py-3 text-xl leading-snug" aria-live="polite">{voice.caption}</p>
      )}

      {step === "welcome" && (
        <section className="flex flex-1 flex-col justify-center gap-6">
          <h1 className="text-3xl font-semibold leading-tight">Hi {firstName}, your care team at {clinicName} asked for a 2-minute check-in.</h1>
          <p className="text-pt-muted">A voice will guide you through every step. You can stop at any time.</p>
          <Button size="lg" className={btn} onClick={begin}>Start</Button>
        </section>
      )}

      {step === "setup" && picture && (
        <section className="flex flex-1 flex-col gap-4" aria-labelledby="setup-q">
          <StepCount n={setupIdx + 1} total={SETUP_STEPS} />
          <h1 id="setup-q" ref={setupHeading} tabIndex={-1} className="text-2xl font-semibold leading-snug outline-none" aria-live="polite">
            {voice.text(SETUP_CHECKS[setupIdx].voice)}
          </h1>
          <Button size="lg" className={btn} onClick={confirmCheck}>
            <Check aria-hidden className="size-6" /> {SETUP_CHECKS[setupIdx].confirm}
          </Button>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {setupIdx > 0 ? (
              <Button size="lg" className={cn(btn2, "w-auto border-0 bg-transparent")} onClick={backSetup}>
                <ArrowLeft aria-hidden className="size-5" /> Back
              </Button>
            ) : <span />}
            {demo && (
              <Button size="lg" className={cn(btn2, "w-auto border-0 bg-transparent text-pt-muted")} onClick={skipSetup}>
                Skip setup (demo)
              </Button>
            )}
          </div>
        </section>
      )}

      {step === "setup" && !picture && (
        <section className="flex flex-col gap-4" aria-labelledby="frame-q">
          <StepCount n={SETUP_STEPS} total={SETUP_STEPS} />
          <h1 id="frame-q" ref={setupHeading} tabIndex={-1} className="text-2xl font-semibold leading-snug outline-none">Can I see all of you, from head to feet?</h1>
          {/* Framing status, under the picture so it never covers the body. Icon and words, not color alone. */}
          {!(poseError && !demo && !ready) && (
            <p className="flex items-center gap-2 text-xl font-medium" aria-live="polite">
              {!ready ? (
                <><Loader2 aria-hidden className="size-6 animate-spin text-pt-muted motion-reduce:animate-none" /> {poseStatus || "Turning on the camera…"}</>
              ) : framed ? (
                <><Check aria-hidden className="size-6 text-emerald-400" /> {voice.text("framing_ok")}</>
              ) : (
                <><AlertTriangle aria-hidden className="size-6 text-amber-300" /> {voice.text("framing_back")}</>
              )}
            </p>
          )}
          {poseError && !demo && (
            <div className="flex flex-col gap-3">
              <p role="alert" className="text-pt-danger">{poseError}</p>
              <Button size="lg" className={btn2} onClick={() => startCamera(facing)}>Try the camera again</Button>
            </div>
          )}
          {/* Pinned like Stop, so it stays in view on short phones. */}
          <Button size="lg" className={cn(btn, "sticky bottom-4 z-10")} disabled={!canStart} onClick={() => void startInstructions()}>
            I&apos;m ready
          </Button>
          <div className="flex flex-wrap items-center justify-between gap-3 text-xl">
            <Button size="lg" className={cn(btn2, "w-auto border-0 bg-transparent")} onClick={backSetup}>
              <ArrowLeft aria-hidden className="size-5" /> Back
            </Button>
            {!demo && (
              <Button size="lg" className={cn(btn2, "w-auto border-0 bg-transparent")} onClick={() => { const f = facing === "user" ? "environment" : "user"; setFacing(f); startCamera(f) }}>
                Use {facing === "user" ? "back" : "front"} camera
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Switch id="demo" checked={demo} onCheckedChange={toggleDemo} />
            <Label htmlFor="demo" className="text-xl">Use demo recording</Label>
          </div>
        </section>
      )}

      {step === "instructions" && (
        <Button size="lg" className={btn2} onClick={() => { voice.stop(); goCountdown() }} disabled={countdown !== null}>
          I know what to do — start now
        </Button>
      )}

      {(step === "test" || step === "instructions") && (
        <Button size="lg" className={cn(ptStop, "sticky bottom-4 h-16 min-h-16 text-2xl")} onClick={() => {
          if (step === "test") return pauseTest("button")
          voice.stop()
          cancelCountdown()
          setStep("setup")
        }}>
          <Square aria-hidden className="size-6 fill-current" /> Stop
        </Button>
      )}

      {step === "paused" && (
        <section className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">{voice.text("paused")}</h1>
          <Button size="lg" className={btn} onClick={keepGoing}>Keep going</Button>
          <Button size="lg" className={btn2} onClick={() => finishTest(true)}>Finish here</Button>
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
        <section className="flex flex-1 flex-col gap-5" aria-labelledby="close-h">
          <div>
            <StepCount n={closeIdx + 1} total={CLOSE_STEPS} />
            <h1 id="close-h" ref={closeHeading} tabIndex={-1} className="mt-1 text-3xl font-bold text-pt-accent outline-none">
              {CLOSE_TITLE[closeOrder[closeIdx]]}
            </h1>
          </div>

          {closeOrder[closeIdx] === "today" && <p className="text-2xl font-semibold leading-snug" aria-live="polite">{closing[0]}</p>}

          {closeOrder[closeIdx] === "next" && (
            <div className="flex items-start gap-4 rounded-xl border border-pt-line bg-pt-surface p-5" aria-live="polite">
              <Phone aria-hidden className="mt-1 size-7 shrink-0 text-pt-accent" />
              <p className="text-2xl font-semibold leading-snug">{closing[1]}</p>
            </div>
          )}

          {closeOrder[closeIdx] === "note" &&
            (noteSent === "open" ? (
              <div className="flex flex-col gap-3">
                <Label htmlFor="note" className="text-xl font-normal leading-snug">{lines.note_prompt}</Label>
                <Textarea
                  id="note"
                  rows={4}
                  className="border-pt-line bg-pt-surface text-xl text-pt-ink placeholder:text-pt-muted focus-visible:ring-pt-focus"
                  value={note}
                  onChange={(e) => { setNote(e.target.value); setNoteError(false) }}
                  placeholder="Type, or tap the microphone on your keyboard"
                  aria-invalid={noteError}
                  aria-describedby={noteError ? "note-error" : undefined}
                />
                {noteError && <p id="note-error" role="alert" className="text-pt-danger">Type a note first, or choose Skip.</p>}
                {noteFailed && (
                  <p role="alert" className="flex items-start gap-2 text-pt-danger">
                    <AlertTriangle aria-hidden className="mt-1 size-5 shrink-0" /> Your note didn&apos;t send. Check your connection and try again.
                  </p>
                )}
                <Button size="lg" className={btn} disabled={noteSending} onClick={() => void sendNote(false)}>
                  {noteSending ? "Sending…" : noteFailed ? "Try sending again" : "Send to my nurse"}
                </Button>
                <Button size="lg" className={btn2} disabled={noteSending} onClick={() => void sendNote(true)}>Skip</Button>
              </div>
            ) : (
              <div className="flex flex-col gap-4" aria-live="polite">
                {noteSent === "sent" && (
                  <p className="flex items-center gap-2 rounded-lg bg-pt-surface px-4 py-3"><Check aria-hidden className="size-6 text-emerald-400" /> Your note was sent to your nurse.</p>
                )}
                <p className="text-2xl font-semibold leading-snug">{closing[2]}</p>
              </div>
            ))}

          <div className="mt-auto flex flex-col gap-3">
            {closeIdx < CLOSE_STEPS - 1 && (
              <Button size="lg" className={btn} onClick={() => goClose(closeIdx + 1)}>Next</Button>
            )}
            {closeIdx > 0 && (
              <Button size="lg" className={cn(btn2, "w-auto self-start border-0 bg-transparent")} onClick={() => goClose(closeIdx - 1)}>
                <ArrowLeft aria-hidden className="size-5" /> Back
              </Button>
            )}
          </div>
        </section>
      )}
    </main>
  )
}

/** "Step n of total" in words, with dots for a glance; the words carry the meaning. */
function StepCount({ n, total }: { n: number; total: number }) {
  return (
    <div className="flex items-center gap-3">
      <p className="text-xl text-pt-muted">Step {n} of {total}</p>
      <div className="flex gap-1.5" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={cn("size-2.5 rounded-full", i < n ? "bg-pt-accent" : "bg-pt-line")} />
        ))}
      </div>
    </div>
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
      <p className="text-xl text-pt-muted">Question {index + 1} of {QUESTIONS.length}</p>
      <h1 id={`q-${q.id}`} className="text-2xl font-semibold leading-snug">{q.text}</h1>
      {q.type === "slider" ? (
        <>
          <div className="flex items-center gap-4">
            <span className="text-xl">0</span>
            <Slider value={[pain]} min={0} max={10} step={1} onValueChange={(v) => setPain(v[0])} aria-labelledby={`q-${q.id}`} className="py-4" />
            <span className="text-xl">10</span>
          </div>
          <p className="text-center text-4xl font-semibold" aria-live="polite">{pain}</p>
          <Button size="lg" className={btn} onClick={() => onAnswer(pain)}>Next</Button>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Button size="lg" className={cn(btn2, "h-20 min-h-20 text-2xl")} onClick={() => onAnswer(true)}>Yes</Button>
          <Button size="lg" className={cn(btn2, "h-20 min-h-20 text-2xl")} onClick={() => onAnswer(false)}>No</Button>
        </div>
      )}
    </section>
  )
}
