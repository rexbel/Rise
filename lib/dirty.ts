/**
 * Change signal for durable storage (lib/persist.ts). The session and crew stores call markDirty() after every
 * write; persist.ts subscribes when a store URL is configured. Kept separate so the stores don't import persist.
 * Listeners live on globalThis so every module instance (instrumentation, route handlers) shares them.
 */
const g = globalThis as typeof globalThis & { __riseDirty?: Set<() => void> }
const listeners = (g.__riseDirty ??= new Set())

export function onDirty(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function markDirty() {
  for (const fn of listeners) fn()
}
