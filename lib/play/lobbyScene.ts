/**
 * Lobby background by the patient's local time: a bright rehab gym by day, hospital rooftops at dusk and night.
 * Pure so the switch points are testable and the canvas and the lobby chrome agree on one answer.
 */

export type LobbyScene = "gym" | "rooftops"

/** Daytime runs 07:00 to 18:59 local time; evening and night show the rooftops. */
export const DAY_STARTS_HOUR = 7
export const NIGHT_STARTS_HOUR = 19

export function sceneFor(now: Date): LobbyScene {
  const h = now.getHours()
  return h >= DAY_STARTS_HOUR && h < NIGHT_STARTS_HOUR ? "gym" : "rooftops"
}

/** Colors the canvas needs per scene. Platforms stay near-black so the ninja reads the same in both. */
export const SCENE_PALETTE: Record<LobbyScene, { platform: string; hud: string; flash: string }> = {
  gym: { platform: "#111111", hud: "#111111", flash: "#ea580c" },
  rooftops: { platform: "#0B0E18", hud: "#F3F4F6", flash: "#fdba74" },
}
