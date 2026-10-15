"use client"

import Link from "next/link"
import { useEffect, useId, useState } from "react"
import {
  ArrowLeft,
  CalendarClock,
  CameraOff,
  Check,
  CircleCheck,
  CircleHelp,
  CircleMinus,
  History,
  Hourglass,
  PauseCircle,
  PhoneMissed,
  ShieldAlert,
  ShieldCheck,
  ShieldMinus,
  ShieldQuestionMark,
  TriangleAlert,
  Users,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"
import protocol from "@/config/protocol.default.json"
import { exerciseById } from "@/lib/play/programs"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import type { ConsentRecord, FollowUp, NextCheckIn, Recommendation, Route, SessionSnapshot, TriageCard } from "@/lib/types"
import { cn } from "@/lib/utils"
import { clinicFontClass } from "./fonts"
import {
  attemptsLabel,
  outcomeChoices,
  followUpErrors,
  nextCheckInView,
  outcomeByCode,
  outcomeLabel,
  type FollowUpErrors,
} from "./followup"
import {
  APPROVAL_LABEL,
  auditActionLabel,
  downgradeOptions,
  finalRecommendation,
  formatTime,
  formatWhen,
  RECOMMENDATION_LABEL,
  RECOMMENDATION_TONE,
  ROUTE_LABEL,
  ruleLabel,
  statusText,
  FLOW_STEP_LABEL,
  SURFACE_LABEL,
  TIER_LABEL,
  type PatientSummary,
} from "./format"
import {
  DemoBadge,
  Eyebrow,
  NeedsReview,
  RealBadge,
  RECOMMENDATION_ICON,
  RedFlag,
  STATUS_ICON,
  StatusText,
  TONE_TEXT,
  TONE_WASH,
  focusRing,
} from "./status"
import { checkInKind, COULD_NOT_COMPLETE_LABEL, couldNotCompleteText, setupSummary, symptomAsked, type SetupSummary } from "./session-facts"
import { DEMO_USER, useClinic, useNow } from "./store"

const serif = "font-[family-name:var(--font-cl-serif)]"

/** C3: the card the rules produced, and the human decision on it. */
export function TriageView({ sessionId }: { sessionId: string }) {
  const { sessions, loaded, patient } = useClinic()
  const s = sessions.get(sessionId)

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
      <Link
        href="/clinic"
        className={cn("mb-4 inline-flex items-center gap-1.5 rounded-sm text-base text-cl-muted hover:text-cl-ink", focusRing)}
      >
        <ArrowLeft aria-hidden className="size-4" />
        Board and patients
      </Link>
      {!loaded ? (
        <LoadingCard />
      ) : !s ? (
        <div className="max-w-2xl rounded-md border border-cl-line bg-cl-surface p-6">
          <h1 className={cn(serif, "text-3xl font-semibold")}>Session not found</h1>
          <p className="mt-2 text-lg text-cl-muted">
            This session is not on the server. Reset demo clears every session, and a server restart does too. Go back to
            the patient list and send a new check-in.
          </p>
        </div>
      ) : (
        <Detail s={s} p={patient(s.riseId)} />
      )}
    </main>
  )
}

function LoadingCard() {
  return (
    <div className="grid gap-4" aria-label="Loading triage card">
      <Skeleton className="h-10 w-2/3 max-w-xl bg-cl-line" />
      <Skeleton className="h-6 w-1/2 max-w-md bg-cl-line" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        <Skeleton className="h-64 bg-cl-line" />
        <Skeleton className="h-64 bg-cl-line" />
      </div>
    </div>
  )
}

function Detail({ s, p }: { s: SessionSnapshot; p: PatientSummary | undefined }) {
  const card = s.card
  return (
    <article className="grid gap-6">
      <header className="grid gap-1">
        <Eyebrow>
          Triage card · {s.surface ? SURFACE_LABEL[s.surface] : "Opened without an invite"}
        </Eyebrow>
        <h1 className={cn(serif, "text-3xl font-semibold tracking-tight sm:text-4xl")}>{p?.name ?? s.riseId}</h1>
        {p && (
          <p className="text-lg text-cl-muted">
            {p.age} {p.sex} · {p.procedure} · post-op day {p.postOpDay} · episode day {p.episodeDay} of {p.episodeLength}
          </p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
          {checkInKind(s) === "real" ? <RealBadge /> : checkInKind(s) === "demo" ? <DemoBadge>Demo invite</DemoBadge> : null}
          <SafetyChecks s={s} />
        </div>
      </header>

      {card ? <Decision s={s} card={card} /> : s.couldNotComplete ? <CouldNotComplete s={s} /> : <Waiting s={s} />}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <div className="grid min-w-0 gap-6">
          {card && <Findings card={card} />}
          {card && <Metrics card={card} />}
          {card && <SymptomsAndNote card={card} />}
        </div>
        <aside className="grid min-w-0 gap-6">
          {card && card.approval === "pending" && <Actions s={s} card={card} />}
          {/* A decided card, or a couldn't-complete (no card) that opened its own follow-up. */}
          {((card && card.approval !== "pending") || (!card && s.followUp)) && (s.followUp || s.nextCheckIn) && (
            <FollowUpPanel s={s} followUp={s.followUp} nextCheckIn={s.nextCheckIn} />
          )}
          {!card && !s.followUp && <ActionsLocked couldNotComplete={!!s.couldNotComplete} />}
          <CrewPanel s={s} />
          <Audit s={s} />
        </aside>
      </div>
    </article>
  )
}

function Waiting({ s }: { s: SessionSnapshot }) {
  const left = s.status === "left" ? s.leftFlow : undefined
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-cl-line bg-cl-surface p-5" role="status">
      <Hourglass aria-hidden className="size-6 text-cl-muted" />
      <div className="min-w-0 flex-1">
        <p className="text-xl font-semibold">No triage card yet</p>
        {left ? (
          <p className="text-base text-cl-muted">
            The patient chose Leave at {FLOW_STEP_LABEL[left.step]} (
            <time className="tabular-nums" dateTime={new Date(left.at).toISOString()}>
              {formatTime(left.at)}
            </time>
            ), before the test result, so the rules did not run. The link still works if they start again.
          </p>
        ) : (
          <p className="text-base text-cl-muted">
            The rules run when the patient finishes the test and questions. This page updates on its own.
          </p>
        )}
      </div>
      <StatusText icon={STATUS_ICON[s.status]} tone="neutral" className="text-lg">
        {statusText(s)}
      </StatusText>
      {s.demoData && <DemoBadge />}
    </div>
  )
}

const SETUP_ICON: Record<SetupSummary["state"], { icon: LucideIcon; tone: "ok" | "confirm" | "neutral" }> = {
  confirmed: { icon: ShieldCheck, tone: "ok" },
  partial: { icon: ShieldAlert, tone: "confirm" },
  skipped: { icon: ShieldMinus, tone: "neutral" },
  none: { icon: ShieldQuestionMark, tone: "neutral" },
}

/** Which safety checks the patient confirmed on the phone before the test (or that a demo skipped them). */
function SafetyChecks({ s }: { s: SessionSnapshot }) {
  const sum = setupSummary(s)
  const { icon, tone } = SETUP_ICON[sum.state]
  const at = s.setup?.at
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-base">
      <span className="text-cl-muted">Safety checks:</span>
      <StatusText icon={icon} tone={tone}>
        {sum.label}
      </StatusText>
      {at && sum.state !== "none" && (
        <time className="text-sm text-cl-muted tabular-nums" dateTime={new Date(at).toISOString()}>
          at {formatTime(at)}
        </time>
      )}
    </p>
  )
}

/** A real patient tried, the camera or body tracker failed, and they told the care team. No test, so no card. */
function CouldNotComplete({ s }: { s: SessionSnapshot }) {
  const c = s.couldNotComplete!
  return (
    <section
      aria-labelledby="cnc-heading"
      className={cn("grid gap-2 rounded-md border border-l-[8px] border-l-status-confirm p-5", TONE_WASH.confirm)}
    >
      <h2 id="cnc-heading" className={cn(serif, "flex flex-wrap items-center gap-x-3 gap-y-1 text-3xl font-semibold")}>
        <CameraOff aria-hidden className={cn("size-8 shrink-0", TONE_TEXT.confirm)} strokeWidth={2.25} />
        <span>{couldNotCompleteText(c.reason)}</span>
      </h2>
      <p className="text-lg">
        The patient told the care team at{" "}
        <time className="font-semibold tabular-nums" dateTime={new Date(c.at).toISOString()}>
          {formatTime(c.at)}
        </time>{" "}
        that they couldn&apos;t do the check-in today ({COULD_NOT_COMPLETE_LABEL[c.reason]}).
      </p>
      <p className="text-lg">
        <span className="font-semibold">No test was done</span>, so the rules did not run and there is no triage card. The
        patient was not shown a demo replay.
      </p>
      <p className="text-lg">
        <span className="font-semibold">Symptoms were not asked</span>, including the red-flag questions. The follow-up call
        on Today is the chance to ask them.
      </p>
    </section>
  )
}

/** Header band: the standing recommendation in words, the rules' original kept for provenance. */
function Decision({ s, card }: { s: SessionSnapshot; card: TriageCard }) {
  const final = finalRecommendation(s) ?? card.recommendation
  const downgraded = final !== card.recommendation
  const tone = RECOMMENDATION_TONE[final]
  const Icon = RECOMMENDATION_ICON[final]
  const decidedBy = [...s.audit].reverse().find((a) => a.action === "approved" || a.action === "downgraded")

  return (
    <section aria-labelledby="rec-heading" className={cn("grid gap-3 rounded-md border border-l-[8px] p-5", TONE_WASH[tone])}>
      <div className="flex flex-wrap items-center gap-2">
        {card.emergency && <RedFlag>Red flag: patient shown the emergency line</RedFlag>}
        {card.noteNeedsReview && <NeedsReview />}
        {card.demoData && <DemoBadge />}
      </div>
      <h2 id="rec-heading" className={cn(serif, "flex flex-wrap items-center gap-x-3 gap-y-1 text-3xl font-semibold sm:text-4xl")}>
        <Icon aria-hidden className={cn("size-9 shrink-0", TONE_TEXT[tone])} strokeWidth={2.25} />
        <span>
          {RECOMMENDATION_LABEL[final]}
          {!downgraded && card.route && (
            <>
              {" "}
              <span aria-hidden>→</span>
              <span className="sr-only">to</span> {ROUTE_LABEL[card.route]}
            </>
          )}
        </span>
      </h2>
      {downgraded && (
        <p className="text-lg">
          <span className="text-cl-muted">Rules recommended:</span>{" "}
          <span className="font-semibold">
            {RECOMMENDATION_LABEL[card.recommendation]}
            {card.route ? ` → ${ROUTE_LABEL[card.route]}` : ""}
          </span>
        </p>
      )}
      <p className="flex flex-wrap items-center gap-x-2 text-lg">
        {card.approval === "pending" ? (
          <StatusText icon={Hourglass} tone="confirm">
            Awaiting your decision. Nothing has been sent or escalated.
          </StatusText>
        ) : (
          <StatusText icon={card.approval === "downgraded" ? CircleMinus : CircleCheck} tone="ok">
            {APPROVAL_LABEL[card.approval]}
            {decidedBy ? ` by ${decidedBy.user} at ${formatTime(decidedBy.at)}` : ""}
          </StatusText>
        )}
      </p>
    </section>
  )
}

function Findings({ card }: { card: TriageCard }) {
  return (
    <section aria-labelledby="why-heading" className="grid gap-3">
      <h2 id="why-heading" className={cn(serif, "border-b border-cl-ink pb-1 text-2xl font-semibold")}>
        Why the rules decided this
      </h2>
      <p className="text-lg">
        <span className="text-cl-muted">Rule fired:</span> <span className="font-semibold">{ruleLabel(card.ruleFired)}</span>{" "}
        <code className="text-sm text-cl-muted">{card.ruleFired}</code>
      </p>
      <ul className="grid list-disc gap-1 pl-6 text-lg">
        {card.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      {card.warnings.length > 0 && (
        <ul className="grid gap-2" aria-label="Warnings">
          {card.warnings.map((w) => (
            <li key={w} className="flex items-start gap-2 rounded-md border border-status-confirm/50 bg-status-confirm/10 p-3 text-base">
              <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-status-confirm" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}
      {card.observation && (
        <div className="grid gap-1 rounded-md border border-cl-line bg-cl-surface p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Eyebrow>Model description, does not change the recommendation</Eyebrow>
            {card.observation.demoData && <DemoBadge />}
          </div>
          <p className="text-base">{card.observation.observation}</p>
          {card.observation.compensations.length > 0 && (
            <p className="text-base text-cl-muted">Compensations: {card.observation.compensations.join(", ")}</p>
          )}
          <p className="text-base text-cl-muted">Uncertainty: {card.observation.uncertainty}</p>
        </div>
      )}
    </section>
  )
}

function Metrics({ card }: { card: TriageCard }) {
  const m = card.metrics
  const isPlay = card.protocol === "play_set"
  return (
    <section aria-labelledby="metrics-heading" className="grid gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-cl-ink pb-1">
        <h2 id="metrics-heading" className={cn(serif, "text-2xl font-semibold")}>
          {isPlay ? "Game set, not a CDC score" : "30-Second Chair Stand"}
        </h2>
        <p className="text-sm text-cl-muted">Care team only · {TIER_LABEL[card.tier]}</p>
      </div>
      {isPlay ? (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          <Big label="Reps" value={m.rawStands} note={card.exerciseId ? exerciseById(card.exerciseId).name : undefined} />
          <Big
            label="Arm use"
            value={m.armsUsed ? "Yes" : "No"}
            note={m.armsUsed && m.armsFromRep ? `From rep ${m.armsFromRep}` : undefined}
          />
          {/* The game does not measure these; showing 0 would read as a normal finding. */}
          <Small label="Asymmetry" value="Not measured" />
          <Small label="Pauses over 3 s" value="Not measured" />
          {m.tandemHoldS !== undefined && (
            <Small label="Tandem hold" value={`${m.tandemHoldS} s${card.scripted.includes("tandem") ? " (scripted)" : ""}`} />
          )}
          <p className="col-span-full text-base text-cl-muted">
            A fixed rep target with no 30-second clock, so it is not compared to CDC norms or to past 30-second counts.
          </p>
        </dl>
      ) : (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          <Big label="Raw stands" value={m.rawStands} previous={m.previousRawStands} />
          <Big
            label="STEADI score"
            value={m.steadiScore}
            previous={m.previousSteadiScore}
            note={m.armsUsed ? "Scored 0: arms used (CDC rule)" : undefined}
          />
          <Big
            label="CDC cutoff"
            value={m.cdcCutoff === null ? "None" : `< ${m.cdcCutoff}`}
            note={
              m.cdcCutoff === null
                ? "Age outside the CDC table (60 to 94)"
                : m.steadiScore < m.cdcCutoff
                  ? "Score is below average for age and sex"
                  : "Score is at or above the cutoff"
            }
          />
          <Small label="Arm use" value={m.armsUsed ? (m.armsFromRep ? `Yes, from rep ${m.armsFromRep}` : "Yes") : "No"} />
          <Small label="Asymmetry" value={`${m.asymmetryPct}%`} />
          <Small label="Pauses over 3 s" value={String(m.pausesOver3s)} />
          {m.tandemHoldS !== undefined && (
            <Small label="Tandem hold" value={`${m.tandemHoldS} s${card.scripted.includes("tandem") ? " (scripted)" : ""}`} />
          )}
        </dl>
      )}
    </section>
  )
}

function Big({
  label,
  value,
  previous,
  note,
}: {
  label: string
  value: number | string
  previous?: number | null
  note?: string
}) {
  return (
    <div className="grid content-start gap-0.5">
      <Eyebrow as="dt">{label}</Eyebrow>
      <dd className={cn(serif, "text-5xl leading-none font-semibold tabular-nums")}>{value}</dd>
      {previous !== undefined && (
        <dd className="text-base text-cl-muted">{previous === null ? "No previous check-in" : `Previous: ${previous}`}</dd>
      )}
      {note && <dd className="text-base text-cl-muted">{note}</dd>}
    </div>
  )
}

function Small({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid content-start gap-0.5">
      <Eyebrow as="dt">{label}</Eyebrow>
      <dd className="text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

const SYMPTOMS: { key: "dizzy" | "short_of_breath_or_chest_pain" | "calf_pain_or_swelling" | "new_incontinence"; label: string; red?: boolean }[] = [
  { key: "short_of_breath_or_chest_pain", label: "Short of breath or chest pain", red: true },
  { key: "calf_pain_or_swelling", label: "New calf pain or swelling" },
  { key: "dizzy", label: "Dizzy or lightheaded" },
  { key: "new_incontinence", label: "New incontinence" },
]

const NOT_ASKED: Record<(typeof SYMPTOMS)[number]["key"], string> = {
  short_of_breath_or_chest_pain: "Not asked",
  calf_pain_or_swelling: "Not asked: questions stopped at the red flag",
  dizzy: "Not asked",
  new_incontinence: "Not asked on the phone",
}

/** The patient left before answering: an icon and words, never read as "No". */
function NotAnswered() {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-status-confirm/60 bg-status-confirm/15 px-1.5 py-0.5 text-sm font-semibold text-cl-ink">
      <CircleHelp aria-hidden className="size-4 text-status-confirm" strokeWidth={2.5} />
      Not answered
    </span>
  )
}

function SymptomsAndNote({ card }: { card: TriageCard }) {
  return (
    <section aria-labelledby="symptoms-heading" className="grid gap-3">
      <h2 id="symptoms-heading" className={cn(serif, "border-b border-cl-ink pb-1 text-2xl font-semibold")}>
        Symptoms and note
      </h2>
      <dl className="grid gap-x-6 gap-y-2 text-lg sm:grid-cols-2">
        <div className="flex items-baseline justify-between gap-3 border-b border-cl-line py-1">
          <dt>Pain right now</dt>
          {symptomAsked(card, "pain_0_10") === "not_answered" ? (
            <dd className="shrink-0">
              <NotAnswered />
            </dd>
          ) : (
            <dd className="font-semibold tabular-nums">{card.symptoms.pain_0_10} / 10</dd>
          )}
        </div>
        {SYMPTOMS.map((q) => {
          const yes = card.symptoms[q.key]
          const asked = symptomAsked(card, q.key)
          return (
            <div key={q.key} className="flex items-baseline justify-between gap-3 border-b border-cl-line py-1">
              <dt>{q.label}</dt>
              <dd className={cn("shrink-0", asked === "not_asked" ? "text-base text-cl-muted" : "font-semibold")}>
                {asked === "not_answered" ? (
                  <NotAnswered />
                ) : asked === "not_asked"
                  ? NOT_ASKED[q.key]
                  : yes
                    ? q.red
                      ? <RedFlag>Yes, red flag</RedFlag>
                      : "Yes"
                    : "No"}
                {asked === "scripted" ? <span className="ml-1 text-base font-normal text-cl-muted">(scripted)</span> : null}
              </dd>
            </div>
          )
        })}
      </dl>
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Eyebrow as="h3">Patient note, verbatim</Eyebrow>
          {card.noteNeedsReview && <NeedsReview />}
        </div>
        {card.patientNote ? (
          <blockquote
            className={cn(
              "rounded-md border-l-4 bg-cl-surface p-4 text-lg whitespace-pre-wrap",
              card.noteNeedsReview ? "border-status-confirm" : "border-cl-line",
            )}
          >
            {card.patientNote}
          </blockquote>
        ) : (
          <p className="text-base text-cl-muted">The patient did not leave a note.</p>
        )}
      </div>
    </section>
  )
}

function ActionsLocked({ couldNotComplete = false }: { couldNotComplete?: boolean }) {
  return (
    <section aria-labelledby="actions-heading" className="grid gap-3 rounded-md border border-cl-line bg-cl-surface p-5">
      <h2 id="actions-heading" className={cn(serif, "text-2xl font-semibold")}>
        Decision
      </h2>
      {couldNotComplete ? (
        <p className="text-base text-cl-muted">
          There is no card to decide. To try again, send a new check-in from the{" "}
          <Link href="/clinic" className={cn("rounded-sm text-cl-ink underline underline-offset-2", focusRing)}>
            patient list
          </Link>
          .
        </p>
      ) : (
        <p className="text-base text-cl-muted">Approve and Downgrade unlock when the triage card arrives.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button disabled className="h-12 text-base">
          Approve
        </Button>
        <Button disabled variant="outline" className="h-12 text-base">
          Downgrade
        </Button>
      </div>
    </section>
  )
}

/** Approve (optionally editing the care-team note) or downgrade with a reason. Each is one explicit click. */
function Actions({ s, card }: { s: SessionSnapshot; card: TriageCard }) {
  const { decide } = useClinic()
  const [mode, setMode] = useState<"approve" | "downgrade">("approve")
  const [note, setNote] = useState(card.careTeamNote ?? "")
  const options = downgradeOptions(card.recommendation)
  const [to, setTo] = useState<Recommendation | "">(options.length === 1 ? options[0] : "")
  const [reason, setReason] = useState("")
  const [freeText, setFreeText] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tried, setTried] = useState(false)
  const id = useId()

  const reasonDef = protocol.downgrade_reasons.find((r) => r.code === reason)
  const needsText = !!reasonDef && "requires_free_text" in reasonDef && reasonDef.requires_free_text === true
  const downgradeInvalid = !to || !reason || (needsText && !freeText.trim())

  async function submit() {
    setError(null)
    if (mode === "downgrade") {
      setTried(true)
      if (downgradeInvalid) return
    }
    setBusy(true)
    const original = card.careTeamNote ?? ""
    const r =
      mode === "approve"
        ? await decide(s.sessionId, {
            action: "approve",
            careTeamNote: note !== original ? note : undefined,
            user: DEMO_USER,
            // The card this person read; the server answers 409 if the patient changed it meanwhile.
            expectRecommendation: card.recommendation,
            expectRule: card.ruleFired,
          })
        : await decide(s.sessionId, {
            expectRecommendation: card.recommendation,
            expectRule: card.ruleFired,
            action: "downgrade",
            to: to as Recommendation,
            reasonCode: reason,
            freeText: freeText.trim() || undefined,
            user: DEMO_USER,
          })
    setBusy(false)
    if (r.ok) {
      toast.success(
        mode === "approve"
          ? `Approved: ${RECOMMENDATION_LABEL[card.recommendation]}${card.route ? ` → ${ROUTE_LABEL[card.route]}` : ""}`
          : `Downgraded to ${RECOMMENDATION_LABEL[to as Recommendation]}`,
      )
    } else if (r.status === 409) {
      toast.info(r.message)
    } else {
      setError(r.message)
    }
  }

  const tab = (m: "approve" | "downgrade", label: string) => (
    <button
      type="button"
      role="tab"
      id={`${id}-tab-${m}`}
      aria-selected={mode === m}
      aria-controls={`${id}-panel`}
      onClick={() => setMode(m)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          const next = m === "approve" ? "downgrade" : "approve"
          setMode(next)
          document.getElementById(`${id}-tab-${next}`)?.focus()
        }
      }}
      tabIndex={mode === m ? 0 : -1}
      className={cn(
        "h-11 flex-1 rounded-sm px-3 text-base font-semibold",
        mode === m ? "bg-cl-surface text-cl-ink shadow-sm" : "text-cl-muted hover:text-cl-ink",
        focusRing,
      )}
    >
      {label}
    </button>
  )

  return (
    <section aria-labelledby="actions-heading" className="grid gap-4 rounded-md border border-cl-ink/30 bg-cl-surface p-5">
      <div className="grid gap-1">
        <h2 id="actions-heading" className={cn(serif, "text-2xl font-semibold")}>
          Your decision
        </h2>
        <p className="text-base text-cl-muted">Deciding as {DEMO_USER}. Every decision is recorded in the audit trail.</p>
      </div>

      <div role="tablist" aria-label="Decision" className="flex gap-1 rounded-md bg-cl-paper p-1">
        {tab("approve", "Approve")}
        {tab("downgrade", "Downgrade")}
      </div>

      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${mode}`} className="grid gap-4">
        {mode === "approve" ? (
          <>
            <p className="text-lg">
              Approve{" "}
              <span className="font-semibold">
                {RECOMMENDATION_LABEL[card.recommendation]}
                {card.route ? ` → ${ROUTE_LABEL[card.route]}` : ""}
              </span>
              .
            </p>
            {card.recommendation === "human_confirm" ? (
              <p className="text-base text-cl-muted">
                Approving keeps this with the care coordinator to call the patient and ask whether it was a safety event. If you
                already confirmed it was not, use Downgrade to Continue plan instead.
              </p>
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor={`${id}-note`} className="text-base font-semibold">
                Care-team note <span className="font-normal text-cl-muted">(optional)</span>
              </Label>
              <Textarea
                id={`${id}-note`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={2000}
                rows={4}
                placeholder="Context for whoever picks this up. Not shown to the patient."
                className={cn("min-h-28 bg-cl-surface text-base md:text-base", focusRing)}
              />
            </div>
          </>
        ) : options.length === 0 ? (
          <p className="text-base text-cl-muted">
            {RECOMMENDATION_LABEL[card.recommendation]} is already the lowest recommendation. Approve it instead.
          </p>
        ) : (
          <>
            <Field label="Lower the recommendation to" id={`${id}-to`} error={tried && !to ? "Choose a recommendation." : undefined}>
              <Select value={to} onValueChange={(v) => setTo(v as Recommendation)}>
                <SelectTrigger id={`${id}-to`} aria-invalid={tried && !to} className={cn("h-11 w-full bg-cl-surface text-base data-[size=default]:h-11", focusRing)}>
                  <SelectValue placeholder="Choose a lower recommendation" />
                </SelectTrigger>
                <SelectContent className={cn(clinicFontClass, "bg-cl-surface text-cl-ink")}>
                  {options.map((o) => (
                    <SelectItem key={o} value={o} className="py-2 text-base">
                      {RECOMMENDATION_LABEL[o]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Reason" id={`${id}-reason`} error={tried && !reason ? "Choose a reason." : undefined}>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger id={`${id}-reason`} aria-invalid={tried && !reason} className={cn("min-h-11 w-full bg-cl-surface text-left text-base whitespace-normal data-[size=default]:h-auto *:data-[slot=select-value]:line-clamp-none", focusRing)}>
                  <SelectValue placeholder="Choose a reason" />
                </SelectTrigger>
                <SelectContent className={cn(clinicFontClass, "max-w-[calc(100vw-2rem)] bg-cl-surface text-cl-ink")}>
                  {protocol.downgrade_reasons.map((r) => (
                    <SelectItem key={r.code} value={r.code} className="py-2 text-base whitespace-normal">
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              label={
                <>
                  Note{" "}
                  <span className="font-normal text-cl-muted">{needsText ? "(required for this reason)" : "(optional)"}</span>
                </>
              }
              id={`${id}-free`}
              error={tried && needsText && !freeText.trim() ? "Add a short note for this reason." : undefined}
            >
              <Textarea
                id={`${id}-free`}
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                maxLength={500}
                rows={3}
                required={needsText}
                aria-invalid={tried && needsText && !freeText.trim()}
                className={cn("min-h-20 bg-cl-surface text-base md:text-base", focusRing)}
              />
            </Field>
          </>
        )}

        {error && (
          <p role="alert" className="rounded-md border border-status-escalate/40 bg-status-escalate/8 p-3 text-base">
            {error}
          </p>
        )}

        {mode === "approve" ? (
          <Button
            type="button"
            onClick={submit}
            disabled={busy}
            className={cn("h-12 w-full bg-cl-ink text-lg text-white hover:bg-cl-ink/90", focusRing)}
          >
            <Check aria-hidden className="size-5" />
            {busy ? "Approving…" : "Approve"}
          </Button>
        ) : (
          <Button
            type="button"
            onClick={submit}
            disabled={busy || options.length === 0}
            variant="outline"
            className={cn("h-12 w-full border-cl-ink text-lg", focusRing)}
          >
            <CircleMinus aria-hidden className="size-5" />
            {busy ? "Downgrading…" : to ? `Downgrade to ${RECOMMENDATION_LABEL[to as Recommendation]}` : "Downgrade"}
          </Button>
        )}
      </div>
    </section>
  )
}

function Field({ label, id, error, children }: { label: React.ReactNode; id: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id} className="text-base font-semibold">
        {label}
      </Label>
      {children}
      {error && (
        <p className="flex items-center gap-1.5 text-base text-cl-ink">
          <TriangleAlert aria-hidden className="size-4 text-status-escalate" />
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * Follow-up on a decided card: a person records how the callback ended (outcomes from protocol.followup, Rise
 * defaults). "Not reached" keeps it on Today and counts the attempt; a closing outcome takes it off Today and sets
 * the next check-in, shown underneath.
 */
function FollowUpPanel({
  s,
  followUp,
  nextCheckIn,
}: {
  s: SessionSnapshot
  followUp: FollowUp | undefined
  nextCheckIn: NextCheckIn | undefined
}) {
  return (
    <section aria-labelledby="followup-heading" className="grid gap-4 rounded-md border border-cl-ink/30 bg-cl-surface p-5">
      <h2 id="followup-heading" className={cn(serif, "text-2xl font-semibold")}>
        {followUp ? "Follow-up" : "Next check-in"}
      </h2>
      {followUp && (followUp.status === "open" ? <FollowUpForm s={s} f={followUp} /> : <FollowUpDone f={followUp} />)}
      {nextCheckIn ? (
        <NextCheckInLine nc={nextCheckIn} withHeading={!!followUp} />
      ) : (
        <p className="text-base text-cl-muted">The next check-in is set once the follow-up is recorded.</p>
      )}
    </section>
  )
}

function Attempts({ f }: { f: FollowUp }) {
  const label = attemptsLabel(f.attempts)
  if (!label) return null
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-base">
      <StatusText icon={PhoneMissed} tone="confirm">
        {label}
      </StatusText>
      {f.lastAttemptAt !== null && <span className="text-cl-muted">· last tried {formatTime(f.lastAttemptAt)}</span>}
    </p>
  )
}

function FollowUpForm({ s, f }: { s: SessionSnapshot; f: FollowUp }) {
  const { recordFollowUp } = useClinic()
  const [outcome, setOutcome] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [tried, setTried] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const id = useId()
  const def = outcomeByCode(outcome)
  const choices = outcomeChoices(f)
  const errors: FollowUpErrors = tried ? followUpErrors(outcome, note) : {}
  const route = f.route ? (ROUTE_LABEL[f.route as Route] ?? f.route.replace(/_/g, " ")) : null

  async function submit() {
    setError(null)
    setSaved(null)
    setTried(true)
    const problems = followUpErrors(outcome, note)
    if (problems.outcome || problems.note) {
      document.getElementById(problems.outcome ? `${id}-outcome-${choices[0].code}` : `${id}-note`)?.focus()
      return
    }
    setBusy(true)
    const r = await recordFollowUp(s.sessionId, { outcome, note: note.trim() || undefined, user: DEMO_USER })
    setBusy(false)
    if (r.ok) {
      const label = outcomeLabel(outcome)
      if (r.data.followUp?.status === "open") {
        // Not reached, or waiting for clearance: stays on Today. Clear the form for the next step.
        const tries = attemptsLabel(r.data.followUp.attempts)
        const waiting = r.data.followUp.awaitingClearance ? " Check-ins stay paused until a clinician clears the patient." : ""
        setSaved(`Recorded “${label}”.${tries ? ` ${tries}.` : ""} It stays on Today.${waiting}`)
        setOutcome("")
        setNote("")
        setTried(false)
      }
      toast.success(`Follow-up recorded: ${label}`)
    } else {
      setError(r.message)
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <p className="flex flex-wrap items-center gap-x-2 text-base">
          <StatusText icon={Hourglass} tone={RECOMMENDATION_TONE[f.recommendation]}>
            Open on Today
          </StatusText>
          <span className="text-cl-muted">since {formatWhen(f.openedAt)}</span>
        </p>
        {f.awaitingClearance && (
          <p className="text-base">
            <StatusText icon={PauseCircle} tone="confirm">
              Waiting for a clinician to clear the patient
            </StatusText>{" "}
            <span className="text-cl-muted">Check-ins are paused until then.</span>
          </p>
        )}
        <p className="text-base text-cl-muted">
          {f.kind === "could_not_complete" ? "For a check-in the patient couldn't complete: call to help" : `For ${RECOMMENDATION_LABEL[f.recommendation]}`}
          {route ? ` → ${route}` : ""}. Recording as {DEMO_USER}.
        </p>
        <Attempts f={f} />
      </div>

      <fieldset className="grid gap-2">
        <legend id={`${id}-legend`} className="mb-2 text-base font-semibold">
          How did the call end?
        </legend>
        <RadioGroup
          value={outcome}
          onValueChange={(v) => {
            setOutcome(v)
            setSaved(null)
          }}
          aria-labelledby={`${id}-legend`}
          aria-invalid={!!errors.outcome}
          aria-describedby={errors.outcome ? `${id}-outcome-error` : undefined}
          className="gap-1.5"
        >
          {choices.map((o) => (
            <Label
              key={o.code}
              htmlFor={`${id}-outcome-${o.code}`}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-base font-normal",
                outcome === o.code ? "border-cl-ink bg-cl-paper" : "border-cl-line hover:border-cl-ink/40",
              )}
            >
              <RadioGroupItem
                id={`${id}-outcome-${o.code}`}
                value={o.code}
                className={cn("size-5 border-cl-ink/50 [&_svg]:size-2.5 [&_svg]:fill-cl-ink", focusRing)}
              />
              <span className="min-w-0 flex-1">
                {o.label}
                {o.code === "not_reached" && <span className="block text-sm text-cl-muted">Counts an attempt; stays on Today</span>}
                {o.awaitsClearance && !f.awaitingClearance && (
                  <span className="block text-sm text-cl-muted">Pauses check-ins; stays on Today until a clinician clears the patient</span>
                )}
                {o.onlyWhenAwaitingClearance && <span className="block text-sm text-cl-muted">Closes the follow-up and sets the next check-in</span>}
              </span>
            </Label>
          ))}
        </RadioGroup>
        {errors.outcome && <InlineError id={`${id}-outcome-error`}>{errors.outcome}</InlineError>}
      </fieldset>

      <div className="grid gap-2">
        <Label htmlFor={`${id}-note`} className="text-base font-semibold">
          Note{" "}
          <span className="font-normal text-cl-muted">{def?.requiresFreeText ? `(required for ${def.label})` : "(optional)"}</span>
        </Label>
        <Textarea
          id={`${id}-note`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          rows={3}
          required={def?.requiresFreeText}
          aria-invalid={!!errors.note}
          aria-describedby={errors.note ? `${id}-note-error` : undefined}
          placeholder="What was agreed. Not shown to the patient."
          className={cn("min-h-20 bg-cl-surface text-base md:text-base", focusRing)}
        />
        {errors.note && <InlineError id={`${id}-note-error`}>{errors.note}</InlineError>}
      </div>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-md border border-status-escalate/40 bg-status-escalate/8 p-3 text-base">
          <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-status-escalate" />
          <span>{error}</span>
        </p>
      )}
      <p role="status" className={cn("text-base", saved ? "flex items-start gap-2" : "sr-only")}>
        {saved && (
          <>
            <CircleCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-status-ok" />
            <span>{saved}</span>
          </>
        )}
      </p>

      <Button
        type="button"
        onClick={submit}
        disabled={busy}
        aria-busy={busy}
        className={cn("h-12 w-full bg-cl-ink text-lg text-white hover:bg-cl-ink/90", focusRing)}
      >
        <Check aria-hidden className="size-5" />
        {busy ? "Saving…" : "Save outcome"}
      </Button>
    </div>
  )
}

function InlineError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="flex items-center gap-1.5 text-base text-cl-ink">
      <TriangleAlert aria-hidden className="size-4 shrink-0 text-status-escalate" />
      {children}
    </p>
  )
}

function FollowUpDone({ f }: { f: FollowUp }) {
  return (
    <div className="grid gap-1">
      <p className="text-lg">
        <StatusText icon={CircleCheck} tone="ok">
          Done: {f.outcome ? outcomeLabel(f.outcome) : "outcome not recorded"}
        </StatusText>
      </p>
      <p className="text-base text-cl-muted">
        {f.closedBy ?? "Unknown"}
        {f.closedAt !== null ? ` at ${formatTime(f.closedAt)}` : ""}
      </p>
      {f.note && (
        <blockquote className="mt-1 rounded-md border-l-4 border-cl-line bg-cl-paper p-3 text-base whitespace-pre-wrap">{f.note}</blockquote>
      )}
      <Attempts f={f} />
    </div>
  )
}

function NextCheckInLine({ nc, withHeading }: { nc: NextCheckIn; withHeading: boolean }) {
  const now = useNow(60_000)
  const v = nextCheckInView(nc, now)
  return (
    <div className={cn("grid gap-1", withHeading && "border-t border-cl-line pt-4")}>
      {withHeading && <Eyebrow>Next check-in</Eyebrow>}
      {v.paused ? (
        <p className="text-lg font-semibold">
          <StatusText icon={PauseCircle} tone="confirm">
            {v.when}
          </StatusText>
        </p>
      ) : (
        <p className="flex flex-wrap items-baseline gap-x-2 text-lg">
          <StatusText icon={v.overdue ? TriangleAlert : CalendarClock} tone={v.overdue ? "confirm" : "neutral"} className="font-semibold">
            {v.when}
          </StatusText>
          {v.on && <span className="text-base text-cl-muted">{v.on}</span>}
        </p>
      )}
      <p className="text-base text-cl-muted">
        {nc.reason} · {nc.phase}
      </p>
      <p className="text-sm text-cl-muted">
        {nc.source === "seed" ? "From the scripted schedule. " : ""}
        {nc.reason === "Clinician-set cadence" || nc.phase.startsWith("Clinician cadence")
          ? "Clinician-set cadence."
          : "Rise default schedule, not a clinical standard."}
      </p>
    </div>
  )
}

const CONSENT_LABEL: Record<ConsentRecord["action"], string> = {
  joined: "Joined their crew",
  left: "Left their crew",
  photo_shown: "Chose to show their photo",
  photo_hidden: "Chose to hide their photo",
}

const CONSENT_SOURCE: Record<ConsentRecord["source"], string> = {
  invited_link: "from their invite link",
  unverified_phone: "unverified phone (no invite)",
  synthetic_seed: "synthetic",
}

/** Why this session keeps the patient off their crew, in the words the card should use. */
function pauseTrigger(card: TriageCard | undefined): "red_flag" | "retracted" | "recommendation" {
  if (card?.emergency) return "red_flag"
  if (card?.warnings.some((w) => w.startsWith("Red flag retracted"))) return "retracted"
  return "recommendation"
}

/**
 * The patient's crew (peer encouragement board): whether this session keeps them off it, a person's control to
 * return them (a decided card and a reason code, like any override), and their consent log. Peers never see why
 * someone is on hold; they just stop seeing them.
 */
function CrewPanel({ s }: { s: SessionSnapshot }) {
  const { resumeCrew } = useClinic()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState("")
  const [freeText, setFreeText] = useState("")
  const [consent, setConsent] = useState<ConsentRecord[] | null>(null)
  const id = useId()
  const decided = !!s.card && s.card.approval !== "pending"
  const reasonDef = protocol.crew.resume_reasons.find((r) => r.code === reason)
  const needsText = !!reasonDef && "requires_free_text" in reasonDef && reasonDef.requires_free_text === true

  // Refetch only when membership-relevant things change, not on every live rep event.
  const auditLen = s.audit.length
  useEffect(() => {
    let live = true
    fetch(`/api/crew/consent/${encodeURIComponent(s.riseId)}`, { cache: "no-store", signal: AbortSignal.timeout(8000) })
      .then((r) => (r.ok ? (r.json() as Promise<ConsentRecord[]>) : []))
      .then((rows) => live && setConsent(rows))
      .catch(() => live && setConsent([]))
    return () => {
      live = false
    }
  }, [s.riseId, auditLen, s.crewPaused])

  const joined = consent ? [...consent].reverse().find((c) => c.action === "joined" || c.action === "left")?.action === "joined" : null
  const trigger = pauseTrigger(s.card)

  async function resume() {
    if (!reason || (needsText && !freeText.trim())) {
      setError("Pick a reason (and add a note for Other) before returning them to their crew.")
      return
    }
    setBusy(true)
    setError(null)
    const r = await resumeCrew(s.sessionId, reason, freeText.trim() || undefined)
    setBusy(false)
    if (r.ok) toast.success("Returned to their crew.")
    else setError(r.message)
  }

  return (
    <section aria-labelledby="crew-heading" className="grid gap-3 rounded-md border border-cl-line bg-cl-surface p-5">
      <h2 id="crew-heading" className={cn(serif, "flex items-center gap-2 text-2xl font-semibold")}>
        <Users aria-hidden className="size-5 text-cl-muted" />
        Crew
      </h2>
      {s.crewPaused ? (
        <>
          <p className="flex items-start gap-2 text-base">
            <PauseCircle aria-hidden className="mt-0.5 size-5 shrink-0 text-status-confirm" />
            <span>
              <span className="font-semibold">On hold from their crew.</span> Peers no longer see them or can cheer them; the
              patient sees &quot;Crew on hold&quot; and can still leave.{" "}
              {trigger === "recommendation"
                ? "This lifts when you return them, or when a downgrade takes the card below Escalate urgent and Confirm with a person."
                : trigger === "red_flag"
                  ? "A red flag stays on hold until a person returns them, whatever the card is downgraded to."
                  : "A red flag the patient retracted stays on hold until a person returns them."}
            </span>
          </p>
          {decided ? (
            <div className="grid gap-2">
              <Label htmlFor={`${id}-reason`} className="text-base font-semibold">
                Reason to return them
              </Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger id={`${id}-reason`} className="h-11 text-base">
                  <SelectValue placeholder="Choose a reason" />
                </SelectTrigger>
                <SelectContent>
                  {protocol.crew.resume_reasons.map((r) => (
                    <SelectItem key={r.code} value={r.code} className="text-base">
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {needsText ? (
                <>
                  <Label htmlFor={`${id}-why`} className="text-base font-semibold">
                    Note
                  </Label>
                  <Textarea id={`${id}-why`} value={freeText} onChange={(e) => setFreeText(e.target.value)} className="text-base" rows={2} />
                </>
              ) : null}
            </div>
          ) : (
            <p className="text-base text-cl-muted">Decide the card first. Then you can return them to their crew with a reason.</p>
          )}
          {error && (
            <p role="alert" className="text-base text-status-escalate">
              {error}
            </p>
          )}
          <Button type="button" variant="outline" className="h-11 text-base" disabled={busy || !decided} onClick={resume}>
            Return to their crew
          </Button>
        </>
      ) : (
        <p className="text-base text-cl-muted">This session does not keep them off their crew.</p>
      )}
      <div className="grid gap-1">
        <Eyebrow>Consent</Eyebrow>
        {consent === null ? (
          <p className="text-base text-cl-muted">Loading consent…</p>
        ) : consent.length === 0 ? (
          <p className="text-base text-cl-muted">Has not joined a crew.</p>
        ) : (
          <>
            <p className="text-base">{joined ? "Currently a member (opted in)." : "Not a member (left)."}</p>
            <ol className="grid gap-0.5">
              {consent.map((c, i) => (
                <li key={`${c.at}-${i}`} className="grid text-base">
                  <span>
                    {CONSENT_LABEL[c.action]} <span className="text-cl-muted">({CONSENT_SOURCE[c.source]})</span>
                  </span>
                  <span className="text-cl-muted tabular-nums">
                    {formatTime(c.at)} · join text v{c.consentVersion}
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </section>
  )
}

const REASON_LABEL = new Map(protocol.downgrade_reasons.map((r) => [r.code, r.label]))
const RESUME_REASON_LABEL = new Map(protocol.crew.resume_reasons.map((r) => [r.code, r.label]))

function Audit({ s }: { s: SessionSnapshot }) {
  const card = s.card
  return (
    <section aria-labelledby="audit-heading" className="grid gap-3">
      <h2 id="audit-heading" className={cn(serif, "flex items-center gap-2 border-b border-cl-ink pb-1 text-2xl font-semibold")}>
        <History aria-hidden className="size-5 text-cl-muted" />
        Audit trail
      </h2>
      {card && card.approval !== "pending" && card.careTeamNote && (
        <div className="grid gap-1">
          <Eyebrow>Care-team note</Eyebrow>
          <p className="text-base whitespace-pre-wrap">{card.careTeamNote}</p>
        </div>
      )}
      {s.audit.length === 0 ? (
        <p className="text-base text-cl-muted">No entries yet. This session was opened without an invite from the console.</p>
      ) : (
        <ol className="grid gap-0">
          {s.audit.map((a, i) => (
            <li key={`${a.at}-${i}`} className="grid gap-0.5 border-b border-cl-line py-2">
              <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-base font-semibold">{auditActionLabel(a)}</span>
                <time className="text-sm text-cl-muted tabular-nums" dateTime={new Date(a.at).toISOString()}>
                  {formatTime(a.at)}
                </time>
              </p>
              {a.from && a.to && (
                <p className="text-base">
                  {a.from === a.to
                    ? RECOMMENDATION_LABEL[a.to]
                    : `${RECOMMENDATION_LABEL[a.from]} → ${RECOMMENDATION_LABEL[a.to]}`}
                </p>
              )}
              {a.reasonCode && (
                <p className="text-base text-cl-muted">
                  {a.action.startsWith("followup_") ? (
                    <>Outcome: {outcomeLabel(a.reasonCode)}</>
                  ) : a.action === "left_flow" ? (
                    <>Left at: {FLOW_STEP_LABEL[a.reasonCode as keyof typeof FLOW_STEP_LABEL] ?? a.reasonCode}</>
                  ) : a.action === "could_not_complete" ? (
                    <>Reason: {COULD_NOT_COMPLETE_LABEL[a.reasonCode as keyof typeof COULD_NOT_COMPLETE_LABEL] ?? a.reasonCode}</>
                  ) : (
                    <>Reason: {(a.action === "crew_resumed" ? RESUME_REASON_LABEL : REASON_LABEL).get(a.reasonCode) ?? a.reasonCode}</>
                  )}
                </p>
              )}
              {a.freeText && <p className="text-base text-cl-muted">“{a.freeText}”</p>}
              <p className="text-sm text-cl-muted">{a.user}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
