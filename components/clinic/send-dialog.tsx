"use client"

import { useId, useState } from "react"
import { Check, Copy, ExternalLink, MessageSquareOff } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import type { Surface } from "@/lib/types"
import { cn } from "@/lib/utils"
import { clinicFontClass } from "./fonts"
import { buildPatientLink, SURFACE_LABEL, type PatientSummary } from "./format"
import { DemoBadge, focusRing } from "./status"
import { useClinic } from "./store"

const SURFACES: { value: Surface; hint: string }[] = [
  { value: "play", hint: "Assigned moves as a camera game. Reps toward a target; not a CDC score." },
  { value: "classic", hint: "CDC STEADI 30-Second Chair Stand with spoken instructions." },
]

type Sent = { link: string; surface: Surface; demo: boolean }

/** Send check-in: choose a surface, create the session, then hand the coordinator the link to share. */
export function SendCheckInDialog({ patient, onClose }: { patient: PatientSummary | null; onClose: () => void }) {
  // Keep the last patient mounted while the dialog animates closed, so it never flashes an empty shell.
  const open = patient !== null
  const [shown, setShown] = useState(patient)
  const [wasOpen, setWasOpen] = useState(open)
  const [opens, setOpens] = useState(0)
  if (patient && patient !== shown) setShown(patient)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setOpens((n) => n + 1)
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn(clinicFontClass, "max-h-[calc(100dvh-2rem)] overflow-y-auto border-cl-line bg-cl-surface text-cl-ink sm:max-w-xl")}>
        {/* Keyed so each patient starts from a fresh form. */}
        {shown && <SendForm key={`${shown.riseId}-${opens}`} patient={shown} />}
      </DialogContent>
    </Dialog>
  )
}

function SendForm({ patient }: { patient: PatientSummary }) {
  const { invite } = useClinic()
  const [surface, setSurface] = useState<Surface>("play")
  const [demo, setDemo] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<Sent | null>(null)
  const ids = { demo: useId(), link: useId(), surface: useId() }

  async function onSend(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    // Demo or real is decided on the server and baked into the invite; the link can't change it.
    const r = await invite(patient.riseId, surface, demo)
    setBusy(false)
    if (!r.ok) {
      setError(r.message)
      return
    }
    setSent({ link: buildPatientLink(window.location.origin, r.data.path), surface, demo })
    toast.success(`Check-in created for ${patient.name}. Share the link to start.`)
  }

  if (sent) return <SentView patient={patient} sent={sent} linkId={ids.link} />

  return (
    <form onSubmit={onSend} className="grid gap-5">
      <DialogHeader>
        <DialogTitle className="font-[family-name:var(--font-cl-serif)] text-2xl">Send check-in to {patient.name}</DialogTitle>
        <DialogDescription className="text-base text-cl-muted">
          {patient.procedure} · post-op day {patient.postOpDay}
        </DialogDescription>
      </DialogHeader>

      <fieldset className="grid gap-3">
        <legend id={ids.surface} className="mb-2 text-base font-semibold">
          Check-in type
        </legend>
        <RadioGroup
          aria-labelledby={ids.surface}
          value={surface}
          onValueChange={(v) => setSurface(v as Surface)}
          className="gap-2"
        >
          {SURFACES.map((s) => {
            const id = `${ids.surface}-${s.value}`
            return (
              <Label
                key={s.value}
                htmlFor={id}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-md border border-cl-line p-3 text-base font-normal",
                  "has-[[data-state=checked]]:border-cl-ink has-[[data-state=checked]]:bg-cl-paper",
                )}
              >
                <RadioGroupItem id={id} value={s.value} className={cn("mt-1 size-5", focusRing)} />
                <span className="grid gap-0.5">
                  <span className="font-semibold">
                    {SURFACE_LABEL[s.value]}
                    {s.value === "play" && <span className="ml-2 text-sm font-medium text-cl-muted">Default</span>}
                  </span>
                  <span className="text-cl-muted">{s.hint}</span>
                </span>
              </Label>
            )
          })}
        </RadioGroup>
      </fieldset>

      <div className="flex items-start gap-3">
        <Checkbox
          id={ids.demo}
          checked={demo}
          onCheckedChange={(v) => setDemo(v === true)}
          className={cn("mt-1 size-5", focusRing)}
        />
        <Label htmlFor={ids.demo} className="grid gap-0.5 text-base font-normal">
          <span className="font-semibold">Use demo recording</span>
          <span className="text-cl-muted">The link plays a recorded session instead of the camera. Results are marked Demo data.</span>
        </Label>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-status-escalate/40 bg-status-escalate/8 p-3 text-base">
          {error}
        </p>
      )}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" className={cn("h-11 text-base", focusRing)}>
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={busy} className={cn("h-11 bg-cl-ink px-5 text-base text-white hover:bg-cl-ink/90", focusRing)}>
          {busy ? "Creating link…" : "Create check-in link"}
        </Button>
      </DialogFooter>
    </form>
  )
}

function SentView({ patient, sent, linkId }: { patient: PatientSummary; sent: Sent; linkId: string }) {
  const [copied, setCopied] = useState(false)

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(sent.link)
      setCopied(true)
      toast.success("Link copied")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const el = document.getElementById(linkId) as HTMLInputElement | null
      el?.select()
      toast.error("Copy is blocked in this browser. The link is selected; press Ctrl+C or Cmd+C.")
    }
  }

  return (
    <div className="grid gap-5">
      <DialogHeader>
        <DialogTitle className="font-[family-name:var(--font-cl-serif)] text-2xl">Check-in ready for {patient.name}</DialogTitle>
        <DialogDescription className="text-base text-cl-muted">
          {SURFACE_LABEL[sent.surface]}
          {sent.demo ? " · demo recording" : ""}. The tile appears on the live board and updates as the patient goes.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-2">
        <Label htmlFor={linkId} className="text-base font-semibold">
          Patient link
        </Label>
        <Input
          id={linkId}
          readOnly
          value={sent.link}
          onFocus={(e) => e.currentTarget.select()}
          className={cn("h-11 font-mono text-sm", focusRing)}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onCopy} className={cn("h-11 text-base", focusRing)}>
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copied ? "Copied" : "Copy link"}
          </Button>
          <Button asChild className={cn("h-11 bg-cl-ink text-base text-white hover:bg-cl-ink/90", focusRing)}>
            <a href={sent.link} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden />
              Open patient link
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-3 rounded-md border border-cl-line bg-cl-paper p-3">
        <MessageSquareOff aria-hidden className="mt-0.5 size-5 shrink-0 text-cl-muted" />
        <p className="min-w-0 flex-1 text-base">
          No text message was sent. SMS is not connected in this demo, so share the link yourself.
        </p>
        <DemoBadge />
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" className={cn("h-11 text-base", focusRing)}>
            Done
          </Button>
        </DialogClose>
      </DialogFooter>
    </div>
  )
}
