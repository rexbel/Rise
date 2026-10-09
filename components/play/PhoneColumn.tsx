"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { FrameGate } from "@/components/play/FrameGate"
import { PlayerHome } from "@/components/play/PlayerHome"
import { SessionReport } from "@/components/play/SessionReport"
import { usePlay } from "@/components/play/PlayProvider"
import { playBody, playDisplay } from "@/components/play/playTheme"
import ui from "@/content/play-ui.json"
import lines from "@/content/patient-lines.json"
import { playerHome } from "@/lib/play/playerHome"
import type { ExerciseId } from "@/lib/play/programs"
import { isLiveShell, nextQuestionId } from "@/lib/play/phaseView"
import { questionKind, questionText } from "@/lib/play/questionCopy"
import { speak } from "@/lib/play/speak"
import type { QuestionId } from "@/lib/play/types"
import type { SeedPatient } from "@/lib/types"

export function PhoneColumn({ patient }: { patient: SeedPatient }) {
  const { session, caption } = usePlay()
  const onHome = session.phase === "howto" || session.phase === "home"

  return (
    <div
      className={`mx-auto flex h-full min-h-[640px] w-full max-w-[420px] flex-col border border-zinc-800 bg-zinc-950 text-zinc-50 shadow-sm ${playBody.className}`}
    >
      <header className="flex items-center justify-between gap-2 border-b border-zinc-800 px-4 py-3">
        <div>
          <p className="text-xl font-semibold tracking-wide text-orange-400">{ui.brand}</p>
          {!onHome ? (
            <p className={`${playDisplay.className} text-xl font-bold`}>
              {patient.display_name.split(" ")[0]}
            </p>
          ) : null}
        </div>
        <div className="flex gap-1">
          {session.demo && !onHome ? (
            <Badge className="border-0 bg-orange-500/20 text-base text-orange-300">{ui.frame.demo_badge}</Badge>
          ) : null}
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col p-4">
        <PhoneBody patient={patient} />
      </div>
      {caption ? (
        <p className="border-t border-zinc-800 px-4 py-3 text-xl leading-snug text-zinc-100" aria-live="polite">
          {caption}
        </p>
      ) : null}
    </div>
  )
}

function PhoneBody({ patient }: { patient: SeedPatient }) {
  const { session, dispatch, begin, voiceStopOn, setVoiceStopOn } = usePlay()
  const { phase } = session
  const home = useMemo(() => playerHome(patient), [patient.rise_id])
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
      <div className="flex flex-1 flex-col justify-start gap-4 overflow-y-auto">
        <PlayerHome
          patient={patient}
          selectedId={session.exerciseId}
          onSelect={(id) => dispatch({ type: "SELECT_EXERCISE", exerciseId: id })}
          showDemoBadge
        />
        {home.missions.length > 1 ? (
          <p className="text-xl text-zinc-500">{ui.program.pick_hint}</p>
        ) : null}
        <Button
          type="button"
          className={`${playDisplay.className} h-16 min-h-16 w-full bg-orange-500 text-xl font-bold text-white transition motion-safe:active:scale-[0.98] motion-reduce:transform-none hover:bg-orange-400`}
          onClick={begin}
        >
          {ui.home.begin}
        </Button>
        {!session.demo ? (
          <Button
            type="button"
            variant="outline"
            className="h-14 min-h-14 w-full border-zinc-700 bg-transparent text-xl text-zinc-100"
            onClick={() => setVoiceStopOn(!voiceStopOn)}
          >
            Voice Stop {voiceStopOn ? "on" : "off"}
          </Button>
        ) : null}
        <Link
          href="/play"
          className="py-2 text-center text-xl text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline"
        >
          {ui.home.back_board}
        </Link>
      </div>
    )
  }
  if (phase === "ready") {
    return (
      <Screen title={ui.ready.title} body={ui.ready.body}>
        <BigButton onClick={() => dispatch({ type: "READY_OK" })}>{ui.ready.continue}</BigButton>
        <Button asChild variant="outline" className="h-14 min-h-14 w-full text-lg">
          <Link href="/play">{ui.ready.not_now}</Link>
        </Button>
      </Screen>
    )
  }
  if (phase === "frame") {
    return (
      <FrameGate demo={session.demo} onOk={() => dispatch({ type: "FRAME_OK" })} />
    )
  }
  if (phase === "countdown") return <Countdown />
  // Live / paused render full-screen via PlaySessionView (not the phone column).
  if (isLiveShell(phase) || phase === "paused") {
    return <p className="text-lg text-zinc-400">Opening full-screen play…</p>
  }
  if (phase === "questions") return <Questions />
  if (phase === "emergencyConfirm") {
    return (
      <Screen title={lines.emergency.mistap_confirm}>
        <BigButton
          onClick={() => {
            speak(lines.emergency.line)
            dispatch({ type: "CONFIRM_EMERGENCY" })
          }}
        >
          {ui.emergency.yes_i_meant_that}
        </BigButton>
        <BigButton variant="outline" onClick={() => dispatch({ type: "EMERGENCY_MISTAP" })}>
          {ui.emergency.mistap}
        </BigButton>
      </Screen>
    )
  }
  if (phase === "emergency") {
    return (
      <Screen title={lines.emergency.line}>
        <p className="text-xl">{lines.emergency.care_team_told}</p>
        <p className="text-xl">{lines.emergency.follow_up}</p>
        <Button asChild className="h-14 min-h-14 text-lg">
          <a href="tel:911">{ui.emergency.call}</a>
        </Button>
      </Screen>
    )
  }
  if (phase === "close") return <SessionReport patient={patient} />
  return null
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
    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-gradient-to-b from-orange-500/10 to-transparent">
      <p className={`${playDisplay.className} text-7xl font-extrabold text-orange-400`} aria-live="assertive">
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

  useEffect(() => {
    speak(text)
  }, [text])

  return (
    <Screen title={text}>
      {kind === "slider" ? <PainControl id={id} /> : <YesNo id={id} />}
    </Screen>
  )
}

function PainControl({ id }: { id: QuestionId }) {
  const { dispatch } = usePlay()
  const [value, setValue] = useState(0)
  return (
    <>
      <Slider min={0} max={10} step={1} value={[value]} onValueChange={(v) => setValue(v[0] ?? 0)} />
      <BigButton onClick={() => dispatch({ type: "ANSWER", id, value })}>{ui.questions.next}</BigButton>
    </>
  )
}

function YesNo({ id }: { id: QuestionId }) {
  const { dispatch } = usePlay()
  return (
    <div className="grid grid-cols-2 gap-3">
      <BigButton onClick={() => dispatch({ type: "ANSWER", id, value: true })}>{ui.questions.yes}</BigButton>
      <BigButton variant="outline" onClick={() => dispatch({ type: "ANSWER", id, value: false })}>
        {ui.questions.no}
      </BigButton>
    </div>
  )
}

function Screen({ title, body, children }: { title: string; body?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-4">
      <h2 className={`${playDisplay.className} text-2xl font-bold leading-snug text-zinc-50`}>{title}</h2>
      {body ? <p className="text-xl text-zinc-400">{body}</p> : null}
      {children}
    </div>
  )
}

function BigButton({
  children,
  onClick,
  variant = "default",
}: {
  children: React.ReactNode
  onClick?: () => void
  variant?: "default" | "outline"
}) {
  return (
    <Button type="button" variant={variant} className="h-14 min-h-14 w-full text-lg" onClick={onClick}>
      {children}
    </Button>
  )
}

