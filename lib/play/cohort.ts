/**
 * Cohort board for RehabNinja — you + same-track peers (seed + board-only).
 * Scores are seeded hits for the demo board only. Peers are not playable.
 */

import boardPeers from "@/content/play-board-peers.json"
import { patients } from "@/lib/seed"
import { procedureFamily, type ProcedureFamily } from "@/lib/play/programs"
import type { SeedPatient } from "@/lib/types"

export const DEFAULT_YOU_ID = "rise-01"

export type BoardMember = {
  id: string
  displayName: string
  score: number
  postOpDay: number
  procedure: string
  playable: boolean
}

export type BoardEntry = {
  member: BoardMember
  rank: number
  isYou: boolean
}

type PeerRow = {
  id: string
  display_name: string
  family: ProcedureFamily
  procedure: string
  post_op_day: number
  hits: number
}

export function boardScore(patient: SeedPatient): number {
  return patient.scripted_today.raw
}

export function avatarSrc(riseId: string): string {
  return `/play/avatars/${riseId}.jpg`
}

export function ordinalPlace(n: number): string {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}TH PLACE`
  switch (n % 10) {
    case 1:
      return `${n}ST PLACE`
    case 2:
      return `${n}ND PLACE`
    case 3:
      return `${n}RD PLACE`
    default:
      return `${n}TH PLACE`
  }
}

export function familyLabel(family: ProcedureFamily): string {
  switch (family) {
    case "tka":
      return "Knee track"
    case "tha":
      return "Hip track"
    case "hip_fracture":
      return "Fracture track"
  }
}

/** Week chip: Sunday start → next Sunday. Pass `now` explicitly — never default `new Date()` (breaks Next prerender). */
export function boardWeekLabel(now: Date): string {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - start.getDay())
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  const fmt = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  })
  return `${fmt.format(start)} – ${fmt.format(end)}`
}

function fromPatient(patient: SeedPatient, playable: boolean): BoardMember {
  return {
    id: patient.rise_id,
    displayName: patient.display_name,
    score: boardScore(patient),
    postOpDay: patient.episode.post_op_day_today,
    procedure: patient.episode.procedure,
    playable,
  }
}

function fromPeer(peer: PeerRow): BoardMember {
  return {
    id: peer.id,
    displayName: peer.display_name,
    score: peer.hits,
    postOpDay: peer.post_op_day,
    procedure: peer.procedure,
    playable: false,
  }
}

export function cohortBoard(youId: string = DEFAULT_YOU_ID): {
  you: SeedPatient
  family: ProcedureFamily
  entries: BoardEntry[]
  yourRank: number
  yourScore: number
  top: BoardEntry
} {
  const you = patients.find((p) => p.rise_id === youId) ?? patients[0]!
  const family = procedureFamily(you)
  const seedPeers = patients
    .filter((p) => procedureFamily(p) === family)
    .map((p) => fromPatient(p, p.rise_id === you.rise_id))
  const extra = (boardPeers.peers as PeerRow[])
    .filter((p) => p.family === family)
    .map(fromPeer)
  const roster = [...seedPeers, ...extra]
  const sorted = [...roster].sort(
    (a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName),
  )
  const entries: BoardEntry[] = sorted.map((member, i) => ({
    member,
    rank: i + 1,
    isYou: member.id === you.rise_id,
  }))
  const yours = entries.find((e) => e.isYou)!
  return {
    you,
    family,
    entries,
    yourRank: yours.rank,
    yourScore: yours.member.score,
    top: entries[0]!,
  }
}
