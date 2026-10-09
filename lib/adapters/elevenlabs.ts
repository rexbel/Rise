/** Voice lines are pre-rendered by scripts/gen-voice.ts to public/voice/<id>.mp3; nothing calls ElevenLabs at runtime. */
export function voiceUrl(id: string): string {
  return `/voice/${id}.mp3`
}
