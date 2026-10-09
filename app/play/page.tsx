"use client"

import type { CSSProperties } from "react"
import { useSyncExternalStore } from "react"
import Image from "next/image"
import Link from "next/link"
import { Oswald, Overpass_Mono } from "next/font/google"
import ui from "@/content/play-ui.json"
import {
  avatarSrc,
  boardWeekLabel,
  cohortBoard,
  DEFAULT_YOU_ID,
  ordinalPlace,
} from "@/lib/play/cohort"

const display = Oswald({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

const mono = Overpass_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

const RANK = {
  1: { bg: "#FDCB6E", text: "#101010", score: "#FDCB6E", emoji: "🏆" },
  2: { bg: "#00CEC9", text: "#101010", score: "#00CEC9", emoji: "🔥" },
  3: { bg: "#E17055", text: "#101010", score: "#E17055", emoji: "💯" },
} as const

const noSubscribe = () => () => {}

function firstName(name: string) {
  return name.split(" ")[0] ?? name
}

function rankStyle(rank: number) {
  return RANK[rank as 1 | 2 | 3]
}

/** Your board — self + same-program cohort. Peers are display-only. */
export default function PlayBoardPage() {
  const board = cohortBoard(DEFAULT_YOU_ID)
  const youName = firstName(board.you.display_name)
  // Client-only date: empty during prerender, this week's label in the browser (no setState in an effect).
  const weekLabel = useSyncExternalStore(noSubscribe, () => boardWeekLabel(new Date()), () => "")

  return (
    <main
      className={`${mono.className} min-h-full flex-1 bg-[#101010] text-[#F5F8FC]`}
      style={
        {
          ["--lb-primary"]: "#f97316",
          ["--lb-primary-soft"]: "rgba(249,115,22,0.4)",
          ["--lb-surface"]: "#16171A",
          ["--lb-muted"]: "#A3AFBF",
          ["--lb-handle"]: "#fb923c",
        } as CSSProperties
      }
    >
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <header className="relative mb-6 flex flex-col gap-4 pb-5 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium tracking-wide">
              <span className="text-[var(--lb-muted)]">Rise</span>
              <span className="text-[var(--lb-muted)]"> · </span>
              <span className="text-[var(--lb-primary)]">RehabNinja</span>
            </p>
            <h1
              className={`${display.className} mt-2 text-[1.75rem] font-semibold uppercase leading-none tracking-[0.06em] text-white sm:text-4xl md:text-5xl`}
            >
              {ui.picker.title}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--lb-muted)] sm:text-base">
              {ui.picker.body}
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex h-14 shrink-0 items-center justify-center rounded-md bg-[var(--lb-primary)] px-6 text-base font-semibold text-white transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lb-primary-soft)] sm:h-12 sm:text-sm"
          >
            {ui.picker.cta}
          </Link>
          <span
            className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-[var(--lb-primary-soft)]"
            aria-hidden
          />
        </header>

        <div className="grid grid-cols-1 gap-4 md:gap-5 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-xl bg-gradient-to-t from-[#CAD4E1] to-white p-5 text-[#101010] shadow-[0_0_0_1px_rgba(255,255,255,0.12)] sm:p-6">
              <div className="flex justify-between gap-6">
                <div className="text-left">
                  <p className="text-[0.7rem] font-medium uppercase tracking-[0.12em] text-[#16171A]/65">
                    My Rank
                  </p>
                  <p className={`${display.className} mt-1 text-3xl font-semibold uppercase tracking-wide sm:text-4xl`}>
                    {ordinalPlace(board.yourRank)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[0.7rem] font-medium uppercase tracking-[0.12em] text-[#16171A]/65">
                    My Score
                  </p>
                  <p className={`${display.className} mt-1 text-3xl font-semibold uppercase tracking-wide sm:text-4xl`}>
                    {board.yourScore}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-[var(--lb-surface)] p-5 text-center shadow-[0_0_0_1px_rgba(255,255,255,0.12)] sm:p-6">
              <p className="text-[0.7rem] font-medium uppercase tracking-[0.12em] text-[var(--lb-muted)]">
                You
              </p>
              <div className="relative mx-auto mt-4 size-20 overflow-hidden rounded-full ring-2 ring-[var(--lb-primary)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] sm:size-24">
                <Image
                  src={avatarSrc(board.you.rise_id)}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="96px"
                  priority
                />
              </div>
              <h2
                className={`${display.className} mt-4 text-xl font-semibold uppercase tracking-[0.06em] text-white`}
              >
                {board.you.display_name}
              </h2>
              <p className="mt-1 text-sm text-[var(--lb-handle)]">@{board.you.rise_id}</p>
              <p className="mt-2 text-xs text-[var(--lb-muted)]">
                Day {board.you.episode.post_op_day_today} · {board.you.episode.procedure}
              </p>
              <Link
                href={`/play/${board.you.rise_id}`}
                className="mt-4 inline-flex h-14 w-full items-center justify-center rounded-md bg-[var(--lb-primary)] text-base font-semibold text-white transition hover:brightness-110 sm:h-11 sm:text-sm"
              >
                {ui.picker.continue.replace("{name}", youName)}
              </Link>
            </div>
          </aside>

          <section className="min-w-0 rounded-xl bg-[var(--lb-surface)] shadow-[0_0_0_1px_rgba(255,255,255,0.12)]">
            <div className="flex flex-col gap-3 border-b border-white/10 px-4 pt-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <h2
                className={`${display.className} text-xl font-semibold uppercase tracking-[0.06em] text-white sm:text-2xl`}
              >
                {ui.picker.roster}
              </h2>
              <div className="mb-4 inline-flex max-w-full items-center rounded-md border border-white/20 px-3 py-2 text-[0.7rem] text-[var(--lb-muted)] sm:mb-0 sm:text-xs">
                {weekLabel || "\u00a0"}
              </div>
            </div>

            <ul className="list-none px-2 pb-2 sm:px-4 sm:pb-4">
              <li className="grid grid-cols-[2.75rem_minmax(0,1fr)_4.5rem] gap-2 border-b border-white/10 px-2 py-3 text-[0.65rem] uppercase tracking-[0.1em] text-[var(--lb-muted)] sm:grid-cols-[3.5rem_minmax(0,1fr)_5.5rem] sm:gap-4 sm:px-2 sm:text-xs">
                <span>Rank</span>
                <span>Team Member</span>
                <span className="text-right"># of Hits</span>
              </li>

              {board.entries.map((entry) => {
                const { member: m, rank, isYou } = entry
                const style = rankStyle(rank)

                return (
                  <li
                    key={m.id}
                    className={`border-b border-white/5 last:border-0 ${
                      isYou ? "bg-[var(--lb-primary-soft)]/30" : ""
                    }`}
                  >
                    <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_4.5rem] items-center gap-2 rounded-lg px-2 py-3.5 sm:grid-cols-[3.5rem_minmax(0,1fr)_5.5rem] sm:gap-4 sm:py-4">
                      <span className="flex justify-start">
                        {style ? (
                          <span
                            className={`${display.className} inline-flex size-8 items-center justify-center rounded-md text-base font-semibold sm:size-9 sm:text-lg`}
                            style={{ background: style.bg, color: style.text }}
                          >
                            {rank}
                          </span>
                        ) : (
                          <span
                            className={`${display.className} inline-flex size-8 items-center justify-center text-base text-[var(--lb-muted)] sm:size-9 sm:text-lg`}
                          >
                            {rank}
                          </span>
                        )}
                      </span>

                      <span className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                        <span className="relative inline-flex size-9 shrink-0 overflow-hidden rounded-full shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] sm:size-11">
                          <Image
                            src={avatarSrc(m.id)}
                            alt=""
                            fill
                            className="object-cover"
                            sizes="44px"
                          />
                        </span>
                        <span className="min-w-0 text-left">
                          <span className="block truncate text-sm font-semibold text-white sm:text-base">
                            {m.displayName}
                            {isYou ? (
                              <span className="ml-2 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--lb-primary)] sm:text-xs">
                                You
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block truncate text-[0.7rem] text-[var(--lb-handle)] sm:text-xs">
                            @{m.id}
                          </span>
                          <span className="mt-0.5 block truncate text-[0.65rem] text-[var(--lb-muted)] sm:hidden">
                            Day {m.postOpDay}
                          </span>
                          <span className="mt-0.5 hidden truncate text-xs text-[var(--lb-muted)] sm:block">
                            Day {m.postOpDay} · {m.procedure}
                          </span>
                        </span>
                      </span>

                      <span className="flex flex-col items-end gap-0.5 text-right">
                        <span
                          className="text-sm font-bold sm:text-base"
                          style={{ color: style?.score ?? "#F5F8FC" }}
                        >
                          {m.score}
                          <span className="ml-0.5 text-xs font-normal opacity-90">
                            {style?.emoji ?? "⭐"}
                          </span>
                        </span>
                        <span className="text-[0.65rem] text-[var(--lb-muted)] sm:text-xs">
                          {isYou ? "You" : "Peer"}
                        </span>
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        </div>

        <p className="mt-6 text-center text-xs text-[var(--lb-muted)]">
          <Link href="/" className="underline-offset-2 hover:text-white hover:underline">
            Back to lobby
          </Link>
          <span className="mx-2 opacity-50">·</span>
          Playing as {youName} only — peers are for the board
        </p>
      </div>
    </main>
  )
}
