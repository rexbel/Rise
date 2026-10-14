"use client"

import Link from "next/link"
import { useEffect, useId, useMemo, useState } from "react"
import { Phone, TriangleAlert, Undo2 } from "lucide-react"
import { Slider as SliderPrimitive } from "radix-ui"
import { Button } from "@/components/ui/button"
import { FrameGate } from "@/components/play/FrameGate"
import { PlayerHome } from "@/components/play/PlayerHome"
import { SessionReport } from "@/components/play/SessionReport"
import { usePlay } from "@/components/play/PlayProvider"
import { playBody, playDisplay, ptCta, ptFocus, ptLink, ptSecondary } from "@/components/play/playTheme"
import ui from "@/content/play-ui.json"
import lines from "@/content/patient-lines.json"
import { playerHome } from "@/lib/play/playerHome"
import type { ExerciseId } from "@/lib/play/programs"
import { isLiveShell, nextQuestionId, QUESTION_ORDER } from "@/lib/play/phaseView"
import { questionNumber } from "@/lib/play/playResult"
import { questionKind, questionText } from "@/lib/play/questionCopy"
import { speak, speakLines } from "@/lib/play/speak"
import type { QuestionId } from "@/lib/play/types"
import type { SeedPatient } from "@/lib/types"
import { weekHref } from "@/lib/play/crewView"
import { sendEvent } from "@/lib/session-client"
import { cn } from "@/lib/utils"

export function PhoneColumn({ patient }: { patient: SeedPatient }) {
  const { session, caption } = usePlay()
  const onHome = session.phase === "howto" || session.phase === "home"

  return (
    <div
      className={cn(
        "mx-auto flex h-full min-h-[640px] w-full flex-col text-pt-ink",
        playBody.className,
        onHome
          ? "max-w-6xl border-0 bg-transparent shadow-none"
          : "max-w-xl border border-pt-line bg-pt-surface shadow-sm sm:max-w-2xl sm:rounded-2xl",
      )}
    >
      <header
        className={cn(
          "flex items-center justify-between gap-2",
          onHome ? "px-1 py-2 sm:px-0 sm:pb-4" : "border-b border-pt-line px-4 py-3 sm:px-6",
        )}
      >
        <div>
          <p className="text-xl font-semibold tracking-wide text-pt-accent">{ui.brand}</p>
          {!onHome ? (
            <p className={`${playDisplay.className} text-xl font-bold`}>{patient.display_name.split(" ")[0]}</p>
          ) : null}
        </div>
        {session.demo && !onHome ? (
          <span className="shrink-0 whitespace-nowrap rounded-full border border-pt-accent/50 px-3 py-0.5 text-xl text-pt-ink">{ui.frame.demo_badge}</span>
        ) : null}
      </header>
      <div className={cn("flex min-h-0 flex-1 flex-col", onHome ? "px-1 pb-6 sm:px-0" : "p-4 sm:p-6")}>
        <PhoneBody patient={patient} />
      </div>
      {caption ? (
        <p
          className={cn(
            "border-t border-pt-line px-4 py-3 text-xl leading-snug text-pt-ink sm:px-6",
            onHome && "mt-2 rounded-2xl border bg-pt-surface",
          )}
          aria-live="polite"
        >
          {caption}
        </p>
      ) : null}
    </div>
  )
}

function PhoneBody({ patient }: { patient: SeedPatient }) {
  const { session, dispatch, begin, voiceStopOn, setVoiceStopOn, inviteToken, sessionId } = usePlay()
  const { phase } = session
  const home = useMemo(() => playerHome(patient), [patient])
  const missionKey = home.missions.map((m) => m.id).join("|")

  useEffect(() => {
    if (phase !== "howto" && phase !== "home") return
    const ids = missionKey.split("|").filter(Boolean) as ExerciseId[]
    const first = ids[0]
    if (first && !ids.includes(session.exerciseId as ExerciseId)) {
      dispatch({ type: "SELECT_EXERCISE", exerciseId: first })
    }
  }, [phase, missionKey, session.exerciseId, dispatch])

  if (phase === "howto" || phase === "home") {
    return (
      <div className="flex flex-1 flex-col justify-start overflow-y-auto">
        <PlayerHome
          patient={patient}
          selectedId={session.exerciseId}
          onSelect={(id) => dispatch({ type: "SELECT_EXERCISE", exerciseId: id })}
          showDemoBadge
          actions={
            <>
              {home.missions.length > 1 ? <p className="text-xl text-pt-muted">{ui.program.pick_hint}</p> : null}
              <Button
                type="button"
                className={cn(ptCta, playDisplay.className, "h-16 min-h-16 motion-safe:active:scale-[0.98] lg:max-w-md")}
                onClick={() => {
                  // A demo goes straight to the countdown: the board shows the safety card was skipped (demo).
                  if (session.demo) sendEvent({ type: "setup_skipped", sessionId, at: Date.now() })
                  begin()
                }}
              >
                {ui.home.begin}
              </Button>
              {!session.demo ? (
                <Button
                  type="button"
                  aria-pressed={voiceStopOn}
                  className={cn(ptSecondary, "lg:max-w-md")}
                  onClick={() => setVoiceStopOn(!voiceStopOn)}
                >
                  Voice Stop {voiceStopOn ? "on" : "off"}
                </Button>
              ) : null}
              <Link href={weekHref(inviteToken)} className={cn(ptLink, "inline-flex min-h-14 items-center self-start")}>
                {ui.home.back_week}
              </Link>
            </>
          }
        />
      </div>
    )
  }
  if (phase === "ready") {
    return (
      <Screen title={ui.ready.title} body={ui.ready.body}>
        <Button
          type="button"
          className={ptCta}
          onClick={() => {
            // The combined card covers chair, someone nearby and feeling OK: one "ready" confirmation.
            sendEvent({ type: "setup_confirmed", sessionId, check: "ready", at: Date.now() })
            dispatch({ type: "READY_OK" })
          }}
        >
          {ui.ready.continue}
        </Button>
        <Button asChild className={ptSecondary}>
          <Link href={weekHref(inviteToken)}>{ui.ready.not_now}</Link>
        </Button>
      </Screen>
    )
  }
  if (phase === "frame") return <FrameGate demo={session.demo} onOk={(cameraFailed) => dispatch({ type: "FRAME_OK", cameraFailed })} />
  if (phase === "countdown") return <Countdown />
  // Live / paused render full-screen via PlaySessionView (not the phone column).
  if (isLiveShell(phase) || phase === "paused") {
    return <p className="text-xl text-pt-muted">Opening full-screen play…</p>
  }
  if (phase === "questions") return <Questions />
  if (phase === "emergency") return <Emergency />
  if (phase === "close") return <SessionReport patient={patient} />
  return null
}

/**
 * Red flag: shown the moment Yes is tapped, no confirm step first. "Your care team is being told" appears (and is
 * spoken) only after the server acknowledged the result; the 911 instruction never waits on the network.
 */
function Emergency() {
  const { dispatch, delivery } = usePlay()
  const told = delivery === "ok"

  useEffect(() => {
    void speakLines([lines.emergency.line, lines.emergency.follow_up])
  }, [])

  useEffect(() => {
    if (told) void speakLines([lines.emergency.care_team_told])
  }, [told])

  return (
    <div className="flex flex-1 flex-col justify-center gap-5">
      <section role="alert" className="flex flex-col gap-4 rounded-2xl bg-pt-danger-fill p-5 text-white sm:p-6">
        <TriangleAlert className="size-12" aria-hidden />
        <h2 className={`${playDisplay.className} text-3xl font-bold leading-snug`}>{lines.emergency.line}</h2>
        {told ? <p className="text-xl leading-snug" role="status">{lines.emergency.care_team_told}</p> : null}
        <p className="text-xl leading-snug">{lines.emergency.follow_up}</p>
        <Button
          asChild
          className="h-16 min-h-16 w-full rounded-xl bg-white text-2xl font-bold text-pt-danger-fill outline-none hover:bg-white/90 focus-visible:ring-[3px] focus-visible:ring-pt-focus focus-visible:ring-offset-2 focus-visible:ring-offset-pt-danger-fill"
        >
          <a href="tel:911">
            <Phone className="size-7" aria-hidden />
            {ui.emergency.call}
          </a>
        </Button>
      </section>
      <Button
        type="button"
        className={cn(
          ptFocus,
          "h-14 min-h-14 self-center rounded-xl border border-pt-line bg-transparent px-5 text-xl font-semibold text-pt-muted hover:bg-pt-surface-2 hover:text-pt-ink",
        )}
        onClick={() => dispatch({ type: "EMERGENCY_MISTAP" })}
      >
        <Undo2 className="size-5" aria-hidden />
        {ui.emergency.mistap_undo}
      </Button>
    </div>
  )
}

function Countdown() {
  const { dispatch } = usePlay()
  const [i, setI] = useState(0)

  useEffect(() => {
    speak(ui.countdown[0])
    let n = 0
    const id = window.setInterval(() => {
      n += 1
      if (n >= ui.countdown.length) {
        window.clearInterval(id)
        dispatch({ type: "COUNTDOWN_DONE" })
        return
      }
      setI(n)
      speak(ui.countdown[n])
    }, 700)
    return () => window.clearInterval(id)
  }, [dispatch])

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-gradient-to-b from-pt-accent/10 to-transparent">
      <p className={`${playDisplay.className} text-7xl font-extrabold text-pt-accent`} aria-live="assertive">
        {ui.countdown[i]}
      </p>
    </div>
  )
}

function Questions() {
  const { session } = usePlay()
  const id = nextQuestionId(session.answers) ?? "calf"
  const text = questionText(id)
  const kind = questionKind(id)
  const titleId = useId()

  useEffect(() => {
    speak(text)
  }, [text])

  return (
    <section className="flex flex-1 flex-col justify-center gap-5" aria-labelledby={titleId}>
      <p className="text-xl text-pt-muted">
        {ui.questions.progress.replace("{n}", String(questionNumber(id))).replace("{total}", String(QUESTION_ORDER.length))}
      </p>
      <h2 id={titleId} className={`${playDisplay.className} text-3xl font-bold leading-snug text-pt-ink`}>
        {text}
      </h2>
      {kind === "slider" ? <PainControl key={id} id={id} titleId={titleId} /> : <YesNo key={id} id={id} />}
    </section>
  )
}

function PainControl({ id, titleId }: { id: QuestionId; titleId: string }) {
  const { dispatch } = usePlay()
  const [value, setValue] = useState(0)
  const valueText = ui.questions.pain_value.replace("{n}", String(value))
  return (
    <>
      <p className={`${playDisplay.className} text-center text-7xl font-extrabold text-pt-ink`} aria-hidden>
        {value}
      </p>
      <SliderPrimitive.Root
        min={0}
        max={10}
        step={1}
        value={[value]}
        onValueChange={(v) => setValue(v[0] ?? 0)}
        className="relative flex h-14 w-full touch-none select-none items-center"
      >
        <SliderPrimitive.Track className="relative h-3 grow overflow-hidden rounded-full bg-pt-surface-2">
          <SliderPrimitive.Range className="absolute h-full bg-pt-accent" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          aria-labelledby={titleId}
          aria-valuetext={valueText}
          className={cn(ptFocus, "block size-12 rounded-full border-4 border-pt-accent bg-pt-ink shadow-md")}
        />
      </SliderPrimitive.Root>
      <div className="flex justify-between gap-4 text-xl text-pt-muted" aria-hidden>
        <span>0 {ui.questions.pain_low}</span>
        <span className="text-right">10 {ui.questions.pain_high}</span>
      </div>
      <Button type="button" className={ptCta} onClick={() => dispatch({ type: "ANSWER", id, value })}>
        {ui.questions.next}
      </Button>
    </>
  )
}

function YesNo({ id }: { id: QuestionId }) {
  const { dispatch } = usePlay()
  return (
    <div className="grid grid-cols-2 gap-3">
      <Button type="button" className={cn(ptSecondary, "h-20 min-h-20 text-2xl")} onClick={() => dispatch({ type: "ANSWER", id, value: true })}>
        {ui.questions.yes}
      </Button>
      <Button type="button" className={cn(ptSecondary, "h-20 min-h-20 text-2xl")} onClick={() => dispatch({ type: "ANSWER", id, value: false })}>
        {ui.questions.no}
      </Button>
    </div>
  )
}

function Screen({ title, body, children }: { title: string; body?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-4">
      <h2 className={`${playDisplay.className} text-3xl font-bold leading-snug text-pt-ink`}>{title}</h2>
      {body ? <p className="text-xl text-pt-muted">{body}</p> : null}
      {children}
    </div>
  )
}
