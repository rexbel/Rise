import { IBM_Plex_Sans, Source_Serif_4 } from "next/font/google"

/** Console type: a serif for headings and key numbers, a sturdy sans for dense working text. */
export const clinicSerif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-cl-serif",
})

export const clinicSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-cl-sans",
})

/** Applied to the console root and to portaled content (dialogs, selects) so they share the same type. */
export const clinicFontClass = `${clinicSerif.variable} ${clinicSans.variable} ${clinicSans.className}`
