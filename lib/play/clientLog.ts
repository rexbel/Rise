/** Ship browser play errors to the Next.js terminal (dev only). */
export function clientLog(level: "error" | "warn" | "info", msg: string, detail?: unknown) {
  if (typeof window === "undefined") return
  console[level === "info" ? "log" : level](`[play] ${msg}`, detail ?? "")
  void fetch("/api/debug/client-log", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ level, msg, detail }),
    keepalive: true,
  }).catch(() => {
    /* ignore */
  })
}
