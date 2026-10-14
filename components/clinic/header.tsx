"use client"

import Link from "next/link"
import { useState } from "react"
import { RotateCcw } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { clinicFontClass } from "./fonts"
import { focusRing } from "./status"
import { DEMO_USER, useClinic } from "./store"

export function ClinicHeader() {
  const { reset, sessions } = useClinic()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onReset() {
    setBusy(true)
    setError(null)
    const r = await reset()
    setBusy(false)
    if (r.ok) {
      setOpen(false)
      toast.success("Demo reset. The board is empty and every patient is ready for a new check-in.")
    } else {
      setError(r.message)
    }
  }

  return (
    <header className="border-b border-cl-line bg-cl-surface">
      <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/clinic" className={cn("rounded-sm", focusRing)}>
          <span className="font-[family-name:var(--font-cl-serif)] text-2xl font-semibold tracking-tight text-cl-ink">
            Rise <span className="text-cl-muted">·</span> Clinic
          </span>
        </Link>
        <span className="rounded-sm border border-cl-ink/70 px-1.5 py-0.5 text-sm font-semibold tracking-wide text-cl-ink uppercase">
          Synthetic data
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="text-base text-cl-muted">
            <span className="font-medium text-cl-ink">{DEMO_USER}</span> (no sign-in in this demo)
          </p>
          <Dialog
            open={open}
            onOpenChange={(o) => {
              setOpen(o)
              if (!o) setError(null)
            }}
          >
            <DialogTrigger asChild>
              <Button variant="outline" className={cn("h-11 border-cl-line bg-cl-surface px-4 text-base text-cl-ink", focusRing)}>
                <RotateCcw aria-hidden />
                Reset demo
              </Button>
            </DialogTrigger>
            <DialogContent className={cn(clinicFontClass, "border-cl-line bg-cl-surface text-cl-ink")}>
              <DialogHeader>
                <DialogTitle className="font-[family-name:var(--font-cl-serif)] text-2xl">Reset the demo?</DialogTitle>
                <DialogDescription className="text-base text-cl-muted">
                  This clears {sessions.size === 1 ? "the 1 live session" : `all ${sessions.size} live sessions`}, their triage
                  cards and audit trails. Patient links already sent stop working. Seed patients are not changed.
                </DialogDescription>
              </DialogHeader>
              {error && (
                <p role="alert" className="text-base text-cl-ink">
                  {error}
                </p>
              )}
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline" className={cn("h-11 text-base", focusRing)}>
                    Keep sessions
                  </Button>
                </DialogClose>
                <Button
                  variant="destructive"
                  className={cn("h-11 text-base", focusRing)}
                  onClick={onReset}
                  disabled={busy}
                >
                  {busy ? "Resetting…" : "Reset demo"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </header>
  )
}
