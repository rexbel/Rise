/**
 * Picture guide for the classic check-in's setup step, shown in the camera frame until the camera is on.
 * One illustration per safety check (chair, helper, phone); it follows the first check not yet ticked, which is
 * also the line the voice coach is reading. Neutral mannequin figures, flat colors, no motion.
 */

export type SetupGuideStep = "chair" | "helper" | "phone"

const ORDER: SetupGuideStep[] = ["chair", "helper", "phone"]

/** The first unticked check, or the phone/framing picture once all are ticked (next: turn on the camera). */
export function guideStepFor(checks: Record<string, boolean>): SetupGuideStep {
  return ORDER.find((id) => !checks[id]) ?? "phone"
}

const DESC: Record<SetupGuideStep, string> = {
  chair: "A sturdy chair without armrests, pushed back against a wall.",
  helper: "Someone standing close by while you sit in the chair.",
  phone: "Your phone propped up on the floor a few steps away, so it can see you from head to feet.",
}

const WALL = "#2A2724"
const FLOOR = "#3A3531"
const CHAIR = "#C69A6B"
const CHAIR_DARK = "#8C6A48"
const BODY = "#D3D6DB"
const BODY_SHADE = "#B7BCC4"
const HELPER = "#9FE1CB"
const OK = "#34D399"

function Person({ x, y, sitting, color = BODY, shade = BODY_SHADE }: { x: number; y: number; sitting?: boolean; color?: string; shade?: string }) {
  // Side-on mannequin; (x, y) is the hip.
  return sitting ? (
    <g strokeLinecap="round" fill="none">
      <line x1={x} y1={y} x2={x + 46} y2={y} stroke={shade} strokeWidth="16" />
      <line x1={x + 46} y1={y} x2={x + 46} y2={y + 52} stroke={shade} strokeWidth="14" />
      <line x1={x} y1={y} x2={x - 2} y2={y - 62} stroke={color} strokeWidth="22" />
      <line x1={x} y1={y - 52} x2={x + 22} y2={y - 40} stroke={color} strokeWidth="11" />
      <circle cx={x - 2} cy={y - 86} r="16" fill={color} />
    </g>
  ) : (
    <g strokeLinecap="round" fill="none">
      <line x1={x} y1={y} x2={x} y2={y + 70} stroke={shade} strokeWidth="15" />
      <line x1={x} y1={y} x2={x} y2={y - 64} stroke={color} strokeWidth="22" />
      <line x1={x} y1={y - 54} x2={x + 6} y2={y - 6} stroke={color} strokeWidth="11" />
      <circle cx={x} cy={y - 88} r="16" fill={color} />
    </g>
  )
}

function Chair({ x, floorY }: { x: number; floorY: number }) {
  // Side view, back against the wall at x; no armrests.
  return (
    <g>
      <rect x={x} y={floorY - 150} width="10" height="150" rx="3" fill={CHAIR_DARK} />
      <rect x={x} y={floorY - 72} width="74" height="12" rx="3" fill={CHAIR} />
      <rect x={x + 64} y={floorY - 62} width="9" height="62" rx="3" fill={CHAIR_DARK} />
    </g>
  )
}

function ChairScene() {
  const floorY = 250
  return (
    <>
      <rect x="0" y="0" width="400" height={floorY} fill={WALL} />
      <rect x="0" y={floorY} width="400" height="50" fill={FLOOR} />
      <rect x="120" y="20" width="10" height={floorY - 20} fill="#3E3A36" />
      <Chair x={130} floorY={floorY} />
      {/* "No armrests": a crossed-out armrest beside the chair */}
      <g transform="translate(270 120)">
        <rect x="-34" y="-10" width="68" height="16" rx="5" fill={CHAIR} opacity="0.45" />
        <line x1="-40" y1="-26" x2="40" y2="22" stroke="#F87171" strokeWidth="6" strokeLinecap="round" />
      </g>
      {/* Pushed back: arrow toward the wall */}
      <path d="M260 210 H222" stroke={OK} strokeWidth="5" strokeLinecap="round" />
      <path d="M232 200 L220 210 L232 220" stroke={OK} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  )
}

function HelperScene() {
  const floorY = 250
  return (
    <>
      <rect x="0" y="0" width="400" height={floorY} fill={WALL} />
      <rect x="0" y={floorY} width="400" height="50" fill={FLOOR} />
      <rect x="80" y="20" width="10" height={floorY - 20} fill="#3E3A36" />
      <Chair x={90} floorY={floorY} />
      <Person x={112} y={floorY - 66} sitting />
      <Person x={262} y={floorY - 70} color={HELPER} shade="#5DCAA5" />
      {/* Close by: a short dashed link between them */}
      <path d="M190 120 Q226 96 248 116" stroke={HELPER} strokeWidth="3" strokeDasharray="6 7" fill="none" />
    </>
  )
}

function PhoneScene() {
  const floorY = 262
  return (
    <>
      <rect x="0" y="0" width="400" height={floorY} fill={WALL} />
      <rect x="0" y={floorY} width="400" height="38" fill={FLOOR} />
      {/* Phone propped up on the floor */}
      <g transform={`translate(52 ${floorY})`}>
        <rect x="-4" y="-44" width="24" height="44" rx="4" fill="#111" stroke="#9CA3AF" strokeWidth="2" transform="rotate(-12)" />
        <rect x="14" y="-14" width="16" height="14" rx="2" fill="#57534E" />
      </g>
      {/* What the camera sees: head to feet */}
      <path d={`M66 ${floorY - 34} L330 34 M66 ${floorY - 34} L330 ${floorY}`} stroke={OK} strokeWidth="2.5" strokeDasharray="7 8" opacity="0.8" />
      <Person x={290} y={floorY - 72} />
      {/* A few steps away */}
      <g fill="#78716C">
        {[110, 150, 190, 230].map((x, i) => (
          <ellipse key={x} cx={x} cy={floorY + (i % 2 ? 14 : 24)} rx="9" ry="5" />
        ))}
      </g>
    </>
  )
}

export function SetupGuide({ step }: { step: SetupGuideStep }) {
  const n = ORDER.indexOf(step) + 1
  return (
    <figure className="absolute inset-0 m-0 flex flex-col bg-[#211E1B]">
      <svg viewBox="0 0 400 300" className="h-full w-full" role="img" aria-label={DESC[step]} preserveAspectRatio="xMidYMid slice">
        {step === "chair" ? <ChairScene /> : step === "helper" ? <HelperScene /> : <PhoneScene />}
      </svg>
      <figcaption className="absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xl font-medium text-white">
        Step {n} of 3
      </figcaption>
    </figure>
  )
}
