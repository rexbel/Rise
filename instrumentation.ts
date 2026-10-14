/** Runs once when the Node server starts: reload saved sessions and crew before serving (lib/persist.ts). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  const { loadSnapshot, startPersisting } = await import("@/lib/persist")
  await loadSnapshot()
  startPersisting()
}
