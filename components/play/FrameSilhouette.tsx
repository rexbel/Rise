"use client"

export function FrameSilhouette() {
  return (
    <div className="relative mx-auto my-4 h-56 w-28 overflow-hidden rounded-[40%] border-4 border-dashed border-foreground/40">
      <svg viewBox="0 0 80 160" className="absolute inset-0 h-full w-full p-2" aria-hidden>
        <g className="origin-bottom animate-[sitstand_3.2s_ease-in-out_infinite]">
          <circle cx="40" cy="28" r="10" className="fill-foreground/50" />
          <rect x="28" y="40" width="24" height="44" rx="10" className="fill-foreground/45" />
          <rect x="18" y="48" width="10" height="32" rx="5" className="fill-foreground/40" />
          <rect x="52" y="48" width="10" height="32" rx="5" className="fill-foreground/40" />
          <rect x="30" y="82" width="9" height="40" rx="4" className="fill-foreground/40" />
          <rect x="41" y="82" width="9" height="40" rx="4" className="fill-foreground/40" />
        </g>
      </svg>
      <style>{`@keyframes sitstand { 0%,100% { transform: scaleY(0.82) translateY(10px); } 50% { transform: scaleY(1) translateY(0); } }`}</style>
    </div>
  )
}
