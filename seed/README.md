# Rise demo seed — 7 synthetic patients

All records are synthetic and not for clinical use.

**Source.** Each patient is drawn from Synthetic Hospital v1.3 (MIT license; Park, Chen, Dettmers, 2026,
https://github.com/sparkcpark/synthetic_hospital). Demographics, chronic conditions, surgical history,
medications, and allergies are copied from `patient_profiles.db` unchanged. `source.chart_note` paraphrases
the encounter in the source chart that each scenario is built around.

**Rise overlay (invented for the demo).** Display names (the dataset ships none), post-op day, check-in
history, the scripted "today" session used as the offline fallback, and `expected_triage`, which doubles
as the eval label for the W&B run.

**Protocol.** CDC STEADI 30-Second Chair Stand
(https://www.cdc.gov/steadi/media/pdfs/STEADI-Assessment-30Sec-508.pdf). `steadi_score` follows the
official rule (arms used = 0); `raw_stands` keeps the arm-assisted count so the trend stays visible.
Diane Coulter adds the STEADI 4-Stage Balance tandem hold (< 10 s = increased fall risk).

| Rise ID | Name | Source ID | Episode | POD | Today (raw / STEADI) | Expected triage |
|---|---|---|---|---|---|---|
| rise-01 | Ellen Marsh | 2842 | R TKA | 3 | 3 / 0, arms from rep 2, short of breath | Escalate urgent → surgeon on call (hero) |
| rise-02 | Judith Kerr | 2866 | L TKA | 7 | 6 / 6, 22% weight shift, calf pain | Escalate urgent → surgeon on call |
| rise-03 | Walter Brandt | 2218 | R TKA | 10 | 8 / 8, post-stand pauses, dizzy | Nurse callback (orthostatic BP) |
| rise-04 | Gary Lindqvist | 2247 | THA | 14 | 10 / 10 | Continue plan |
| rise-05 | Diane Coulter | 2856 | L TKA | 90 | 11 / 11, tandem 4 s | Nurse callback → PT balance |
| rise-06 | Ruth Abernathy | 2857 | Hip fracture repair | 21 | 6 / 0, arms every rep, improving | Continue plan with PT |
| rise-07 | Harold Pruitt | 2226 | R THA | 120 | 6 / 6, shuffling, new incontinence | Escalate → primary care |

Regenerate: `python3 -I build_seed.py <path>/patient_profiles.db patients.json`
