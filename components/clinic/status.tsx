/**
 * Status primitives. Every status carries an icon AND words; color only reinforces them.
 * Text stays in ink for contrast; the tone colors the icon, a left rule and a light wash.
 */
import {
  Activity,
  Calculator,
  Camera,
  CameraOff,
  CircleCheck,
  CirclePause,
  ClipboardCheck,
  FlaskConical,
  MessageCircleQuestion,
  OctagonAlert,
  Phone,
  Send,
  Siren,
  TriangleAlert,
  UserCheck,
  type LucideIcon,
} from "lucide-react"
import type { Recommendation, SessionStatus } from "@/lib/types"
import { cn } from "@/lib/utils"
import { RECOMMENDATION_TONE, type Tone } from "./format"

/** Shared focus treatment: a solid accent outline that reads on a projector. */
export const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cl-focus focus-visible:ring-0"

export const TONE_TEXT: Record<Tone, string> = {
  escalate: "text-status-escalate",
  confirm: "text-status-confirm",
  callback: "text-status-callback",
  ok: "text-status-ok",
  neutral: "text-cl-muted",
}

export const TONE_RULE: Record<Tone, string> = {
  escalate: "border-l-status-escalate",
  confirm: "border-l-status-confirm",
  callback: "border-l-status-callback",
  ok: "border-l-status-ok",
  neutral: "border-l-cl-line",
}

export const TONE_WASH: Record<Tone, string> = {
  escalate: "bg-status-escalate/8 border-status-escalate/40",
  confirm: "bg-status-confirm/10 border-status-confirm/45",
  callback: "bg-status-callback/8 border-status-callback/35",
  ok: "bg-status-ok/8 border-status-ok/35",
  neutral: "bg-cl-paper border-cl-line",
}

export const STATUS_ICON: Record<SessionStatus, LucideIcon> = {
  invited: Send,
  setting_up: Camera,
  testing: Activity,
  paused: CirclePause,
  questions: MessageCircleQuestion,
  scoring: Calculator,
  ready: ClipboardCheck,
  needs_confirmation: UserCheck,
  could_not_complete: CameraOff,
}

export const RECOMMENDATION_ICON: Record<Recommendation, LucideIcon> = {
  escalate_urgent: Siren,
  nurse_callback: Phone,
  human_confirm: UserCheck,
  continue_plan: CircleCheck,
}

/** Inline icon + words. */
export function StatusText({
  icon: Icon,
  tone,
  children,
  className,
}: {
  icon: LucideIcon
  tone: Tone
  children: React.ReactNode
  className?: string
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-medium text-cl-ink", className)}>
      <Icon aria-hidden className={cn("size-[1.1em] shrink-0", TONE_TEXT[tone])} strokeWidth={2.25} />
      <span>{children}</span>
    </span>
  )
}

export function RecommendationText({
  rec,
  children,
  className,
}: {
  rec: Recommendation
  children: React.ReactNode
  className?: string
}) {
  return (
    <StatusText icon={RECOMMENDATION_ICON[rec]} tone={RECOMMENDATION_TONE[rec]} className={className}>
      {children}
    </StatusText>
  )
}

/** Red flag marker: escalate token, octagon icon and the words "Red flag". */
export function RedFlag({ children = "Red flag" }: { children?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-status-escalate/50 bg-status-escalate/10 px-1.5 py-0.5 text-sm font-semibold text-cl-ink">
      <OctagonAlert aria-hidden className="size-4 text-status-escalate" strokeWidth={2.5} />
      {children}
    </span>
  )
}

/** Amber review marker with an icon. */
export function NeedsReview({ children = "Note needs review" }: { children?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-status-confirm/60 bg-status-confirm/15 px-1.5 py-0.5 text-sm font-semibold text-cl-ink">
      <TriangleAlert aria-hidden className="size-4 text-status-confirm" strokeWidth={2.5} />
      {children}
    </span>
  )
}

/** "Demo data": shown whenever a seeded fallback produced any part of what is on screen. */
export function DemoBadge({ className, children = "Demo data" }: { className?: string; children?: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border border-dashed border-cl-muted/60 px-1.5 py-0.5 text-sm font-medium text-cl-muted",
        className,
      )}
    >
      <FlaskConical aria-hidden className="size-3.5" />
      {children}
    </span>
  )
}

/** Small uppercase label for a section or field. */
export function Eyebrow({ children, className, as: As = "p" }: { children: React.ReactNode; className?: string; as?: "p" | "h2" | "h3" | "dt" | "span" }) {
  return <As className={cn("text-sm font-semibold tracking-[0.06em] text-cl-muted uppercase", className)}>{children}</As>
}
