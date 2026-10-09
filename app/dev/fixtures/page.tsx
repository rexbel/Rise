import type { Metadata } from "next"
import { FixtureRecorder } from "./fixture-recorder"

export const metadata: Metadata = { title: "Fixture recorder · Rise dev" }

/** Turns the fallback clips (or a live take) into keypoint fixtures for the seeded tier. Format: fixtures/README.md. */
export default function FixturesPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-semibold">Fixture recorder</h1>
      <p className="text-muted-foreground">
        Pick the fixture, load its clip (or use the camera), and record. The same stand counter runs over the frames so you can see whether they
        replay as expected before saving.
      </p>
      <FixtureRecorder />
    </main>
  )
}
