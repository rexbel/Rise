/**
 * Change signal for durable storage (lib/persist.ts). The session and crew stores call markDirty() after every
 * write; persist.ts subscribes when a store URL is configured. Kept separate so the stores don't import persist.
 */
const listeners = new Set<() => void>()

export function onDirty(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function markDirty() {
  for (const fn of listeners) fn()
}
