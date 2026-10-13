/*
 * Patient-surface classes on the pt-* tokens (app/globals.css). Use with the default Button variant only:
 * other variants carry dark: utilities that tailwind-merge cannot override.
 */

/** Visible keyboard focus on dark patient surfaces. */
export const ptFocus =
  "outline-none focus-visible:ring-[3px] focus-visible:ring-pt-focus focus-visible:ring-offset-2 focus-visible:ring-offset-pt-bg"

/** 56px+ tall, 20px+ text. */
export const ptButton = "h-14 min-h-14 w-full rounded-xl px-5 text-xl font-bold whitespace-normal"

/** Primary filled action. bg-pt-cta with white text passes AA (orange-500 with white does not). */
export const ptCta = `${ptFocus} ${ptButton} bg-pt-cta text-pt-cta-ink hover:bg-pt-cta-hover`

/** Secondary action on dark surfaces. */
export const ptSecondary = `${ptFocus} ${ptButton} border border-pt-line bg-pt-surface text-pt-ink hover:bg-pt-surface-2`

/**
 * Stop: always red with a square glyph and the word. pt-danger-fill keeps white text at 6.5:1.
 */
export const ptStop = `${ptFocus} ${ptButton} bg-pt-danger-fill text-white hover:bg-pt-danger-fill-hover`

/** Text link on dark patient surfaces, still 20px. */
export const ptLink = `${ptFocus} rounded-md text-xl text-pt-muted underline underline-offset-4 hover:text-pt-ink`
