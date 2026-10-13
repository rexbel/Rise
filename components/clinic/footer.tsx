import { cn } from "@/lib/utils"
import { focusRing } from "./status"

const link = cn("underline decoration-cl-line underline-offset-4 hover:decoration-cl-ink rounded-sm", focusRing)

export function ClinicFooter() {
  return (
    <footer className="mt-auto border-t border-cl-line">
      <div className="mx-auto w-full max-w-[1400px] space-y-1 px-4 py-5 text-base text-cl-muted sm:px-6 lg:px-8">
        <p>
          Patients:{" "}
          <a className={link} href="https://github.com/sparkcpark/synthetic_hospital" target="_blank" rel="noreferrer">
            Synthetic Hospital v1.3
          </a>{" "}
          (MIT), Park, Chen, Dettmers, 2026. All data is synthetic.
        </p>
        <p>
          Protocol: CDC STEADI{" "}
          <a className={link} href="https://www.cdc.gov/steadi/media/pdfs/STEADI-Assessment-30Sec-508.pdf" target="_blank" rel="noreferrer">
            30-Second Chair Stand
          </a>{" "}
          and{" "}
          <a className={link} href="https://www.cdc.gov/steadi/media/pdfs/STEADI-Assessment-4Stage-508.pdf" target="_blank" rel="noreferrer">
            4-Stage Balance
          </a>
          . Thresholds are Rise defaults, not clinical standards.
        </p>
      </div>
    </footer>
  )
}
