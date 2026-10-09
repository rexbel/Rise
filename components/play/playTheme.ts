import { Bricolage_Grotesque, Nunito } from "next/font/google"

/** Shared RehabNinja type — lobby through report. */
export const playDisplay = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
})

export const playBody = Nunito({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
})

export const playShell =
  "bg-[var(--rn-cream,#FEF1E1)] text-[var(--rn-ink,#18181b)]"
export const playShellDark =
  "bg-[#0c0a09] text-zinc-50"
export const playAccent = "text-orange-500"
export const playCta =
  "bg-orange-500 text-white hover:bg-orange-400"
