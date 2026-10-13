/**
 * Medical supplies the lobby's surgeon ninja drops behind him as he walks. Pure functions so the canvas loop in
 * components/play/LobbyStage.tsx stays simple and the motion is testable. World coordinates; y = 0 is the surface
 * (platform or bridge) and negative is above it.
 */

export type DropKind = "crutch" | "pill" | "bandaid"
export type Drop = { x: number; y: number; vy: number; rot: number; spin: number; kind: DropKind }

export const DROP_EVERY_PX = 26
export const DROP_ORDER: DropKind[] = ["crutch", "pill", "bandaid"]
export const MAX_DROPS = 24
const GRAVITY = 0.0016 // px per ms²

/** Leave the next supply in the cycle at (x, y); keeps at most MAX_DROPS (oldest go first). */
export function spawnDrop(drops: Drop[], x: number, y: number, index: number, random: () => number = Math.random): Drop[] {
  const kind = DROP_ORDER[index % DROP_ORDER.length]!
  const spin = (random() < 0.5 ? -1 : 1) * (0.006 + random() * 0.006)
  return [...drops, { x, y, vy: -0.05, rot: 0, spin, kind }].slice(-MAX_DROPS)
}

/** Advance falling supplies by dt ms; on landing they settle flat (a crutch lies on its side). */
export function stepDrops(drops: Drop[], dt: number): Drop[] {
  return drops.map((d) => {
    if (d.y >= 0) return d
    const vy = d.vy + dt * GRAVITY
    const y = Math.min(0, d.y + vy * dt)
    const turned = d.rot + d.spin * dt
    if (y < 0) return { ...d, y, vy, rot: turned }
    const flat = Math.round(turned / Math.PI) * Math.PI + (d.kind === "crutch" ? Math.PI / 2 : 0)
    return { ...d, y: 0, vy: 0, rot: flat }
  })
}

/** Drop supplies that have scrolled off to the left of `minX`. */
export function pruneDrops(drops: Drop[], minX: number): Drop[] {
  return drops.filter((d) => d.x > minX)
}
