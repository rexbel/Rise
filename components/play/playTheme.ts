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

/** Patient-surface classes live in ./ptClasses (no font import) so /p can share them. */
export { ptButton, ptCta, ptFocus, ptLink, ptSecondary, ptStop } from "@/components/play/ptClasses"
