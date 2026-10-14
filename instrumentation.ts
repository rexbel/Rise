/** Runs once when the Node server starts: reload saved sessions and crew, then save after changes (lib/persist.ts). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  const { startPersisting } = await import("@/lib/persist")
  await startPersisting()
}
