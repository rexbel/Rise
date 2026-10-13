"use client"

import Link from "next/link"
import { useId, useState } from "react"
import { ArrowLeft, Check, CircleCheck, CircleMinus, History, Hourglass, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import protocol from "@/config/protocol.default.json"
import { exerciseById } from "@/lib/play/programs"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import type { Recommendation, SessionSnapshot, TriageCard } from "@/lib/types"
import { cn } from "@/lib/utils"
import { clinicFontClass } from "./fonts"
import {
  APPROVAL_LABEL,
  auditActionLabel,
  downgradeOptions,
  finalRecommendation,
  formatTime,
  RECOMMENDATION_LABEL,
  RECOMMENDATION_TONE,
  ROUTE_LABEL,
  ruleLabel,
  statusText,
  SURFACE_LABEL,
  TIER_LABEL,
  type PatientSummary,
} from "./format"
import {
  DemoBadge,
  Eyebrow,
  NeedsReview,
  RECOMMENDATION_ICON,
  RedFlag,
  STATUS_ICON,
  StatusText,
  TONE_TEXT,
  TONE_WASH,
  focusRing,
} from "./status"
import { DEMO_USER, useClinic } from "./store"

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
      </header>

      {card ? <Decision s={s} card={card} /> : <Waiting s={s} />}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <div className="grid min-w-0 gap-6">
          {card && <Findings card={card} />}
          {card && <Metrics card={card} />}
          {card && <SymptomsAndNote card={card} />}
        </div>
        <aside className="grid min-w-0 gap-6">
          {card && card.approval === "pending" && <Actions s={s} card={card} />}
          {!card && <ActionsLocked />}
          <Audit s={s} />
        </aside>
      </div>
    </article>
  )
}

function Waiting({ s }: { s: SessionSnapshot }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-cl-line bg-cl-surface p-5" role="status">
      <Hourglass aria-hidden className="size-6 text-cl-muted" />
      <div className="min-w-0 flex-1">
        <p className="text-xl font-semibold">No triage card yet</p>
        <p className="text-base text-cl-muted">
          The rules run when the patient finishes the test and questions. This page updates on its own.
        </p>
      </div>
      <StatusText icon={STATUS_ICON[s.status]} tone="neutral" className="text-lg">
        {statusText(s)}
      </StatusText>
      {s.demoData && <DemoBadge />}
    </div>
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
          {m.tandemHoldS !== undefined && <Small label="Tandem hold" value={`${m.tandemHoldS} s`} />}
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
          {m.tandemHoldS !== undefined && <Small label="Tandem hold" value={`${m.tandemHoldS} s`} />}
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

/**
 * The phone sends booleans for every symptom, but a red-flag Yes ends the questions before the calf question,
 * and incontinence is never asked on the phone (demo sessions carry the scripted value). Showing "No" for
 * those would read as a negative answer the patient never gave.
 */
function symptomAsked(card: TriageCard, key: (typeof SYMPTOMS)[number]["key"]): "asked" | "not_asked" | "scripted" {
  if (key === "calf_pain_or_swelling" && card.symptoms.short_of_breath_or_chest_pain) return "not_asked"
  if (key === "new_incontinence") return card.demoData ? "scripted" : "not_asked"
  return "asked"
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
          <dd className="font-semibold tabular-nums">{card.symptoms.pain_0_10} / 10</dd>
        </div>
        {SYMPTOMS.map((q) => {
          const yes = card.symptoms[q.key]
          const asked = symptomAsked(card, q.key)
          return (
            <div key={q.key} className="flex items-baseline justify-between gap-3 border-b border-cl-line py-1">
              <dt>{q.label}</dt>
              <dd className={cn("shrink-0", asked === "not_asked" ? "text-base text-cl-muted" : "font-semibold")}>
                {asked === "not_asked"
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

function ActionsLocked() {
  return (
    <section aria-labelledby="actions-heading" className="grid gap-3 rounded-md border border-cl-line bg-cl-surface p-5">
      <h2 id="actions-heading" className={cn(serif, "text-2xl font-semibold")}>
        Decision
      </h2>
      <p className="text-base text-cl-muted">Approve and Downgrade unlock when the triage card arrives.</p>
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
          })
        : await decide(s.sessionId, {
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

const REASON_LABEL = new Map(protocol.downgrade_reasons.map((r) => [r.code, r.label]))

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
              {a.reasonCode && <p className="text-base text-cl-muted">Reason: {REASON_LABEL.get(a.reasonCode) ?? a.reasonCode}</p>}
              {a.freeText && <p className="text-base text-cl-muted">“{a.freeText}”</p>}
              <p className="text-sm text-cl-muted">{a.user}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
