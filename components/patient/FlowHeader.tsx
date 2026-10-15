"use client"

/**
 * The patient flow header: Back (one step back in the current flow) on the left, Leave on the right, in the same
 * place on every screen. Leave asks first in a bottom sheet ("Leave this check-in?": Keep going or Leave). Focus moves
 * into the sheet (Keep going, the safe choice, comes first), Escape or Keep going closes it, and focus returns to Leave.
 * Icon plus words, 56px targets, 20px+ text. Shared by the classic check-in (/p) and RehabNinja (/play).
 */
import Link from "next/link"
import { useState } from "react"
import { ArrowLeft, Check, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { ptCta, ptFocus, ptSecondary } from "@/components/play/ptClasses"
import lines from "@/content/patient-lines.json"
import { cn } from "@/lib/utils"

const copy = lines.leave

/** Quiet header control: still 56px tall with 20px text. */
const headerButton = `${ptFocus} inline-flex h-14 min-h-14 w-auto items-center gap-2 rounded-xl px-3 text-xl font-semibold whitespace-nowrap`

export type FlowLeave =
  /** Leave with a confirmation. onOpenChange runs first (e.g. stop a countdown, speak the question). */
  | { kind: "confirm"; body: string; onConfirm: () => void; onOpenChange?: (open: boolean) => void }
  /** Nothing left to lose (the closing): Done, no confirmation. */
  | { kind: "done"; href?: string; onClick?: () => void }

export function FlowHeader({
  back,
  leave,
  sheetClassName,
  className,
}: {
  /** One step back; omit where there is nothing to go back to (the control is hidden, Leave keeps its place). */
  back?: (() => void) | null
  leave?: FlowLeave | null
  /** Font for the sheet, which renders in a portal outside the page's font class. */
  sheetClassName?: string
  className?: string
}) {
  if (!back && !leave) return null
  return (
    <nav aria-label="Check-in" className={cn("flex min-h-14 items-center justify-between gap-2", className)}>
      {back ? (
        <Button type="button" className={cn(headerButton, "-ml-3 bg-transparent text-pt-ink hover:bg-pt-surface-2")} onClick={back}>
          <ArrowLeft aria-hidden className="size-6" />
          {copy.back}
        </Button>
      ) : (
        <span />
      )}
      {leave?.kind === "confirm" ? (
        <LeaveButton leave={leave} sheetClassName={sheetClassName} />
      ) : leave?.kind === "done" ? (
        leave.href ? (
          <Button asChild className={cn(headerButton, "border border-pt-line bg-transparent px-4 text-pt-ink hover:bg-pt-surface-2")}>
            <Link href={leave.href} onClick={leave.onClick}>
              <Check aria-hidden className="size-6" />
              {copy.done}
            </Link>
          </Button>
        ) : (
          <Button type="button" className={cn(headerButton, "border border-pt-line bg-transparent px-4 text-pt-ink hover:bg-pt-surface-2")} onClick={leave.onClick}>
            <Check aria-hidden className="size-6" />
            {copy.done}
          </Button>
        )
      ) : null}
    </nav>
  )
}

function LeaveButton({ leave, sheetClassName }: { leave: Extract<FlowLeave, { kind: "confirm" }>; sheetClassName?: string }) {
  const [open, setOpen] = useState(false)
  const change = (next: boolean) => {
    leave.onOpenChange?.(next)
    setOpen(next)
  }
  return (
    <Sheet open={open} onOpenChange={change}>
      <SheetTrigger asChild>
        <Button type="button" className={cn(headerButton, "border border-pt-line bg-transparent px-4 text-pt-ink hover:bg-pt-surface-2")}>
          <LogOut aria-hidden className="size-6" />
          {copy.leave}
        </Button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className={cn(
          "mx-auto w-full max-w-md gap-5 rounded-t-2xl border border-b-0 border-pt-line bg-pt-surface px-5 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-pt-ink",
          sheetClassName,
        )}
      >
        <div className="flex flex-col gap-2">
          <SheetTitle className="text-3xl leading-snug font-bold text-pt-ink">{copy.confirm_title}</SheetTitle>
          <SheetDescription className="text-xl leading-snug text-pt-muted">{leave.body}</SheetDescription>
        </div>
        <div className="flex flex-col gap-3">
          <Button type="button" className={ptCta} onClick={() => change(false)}>
            {copy.keep_going}
          </Button>
          <Button
            type="button"
            className={ptSecondary}
            onClick={() => {
              setOpen(false)
              leave.onConfirm()
            }}
          >
            <LogOut aria-hidden className="size-6" />
            {copy.confirm_leave}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
