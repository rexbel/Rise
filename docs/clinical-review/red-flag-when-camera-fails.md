# Clinical review: asking the red-flag question when the camera fails

Status: **draft for clinical review. Not built.** Nothing here reaches a patient until a clinician signs it off.

## Why

The red-flag questions (shortness of breath or chest pain, and calf pain or swelling) are only asked after the chair-stand test. On a real check-in, if the camera or body tracker fails, the patient now taps "Tell my care team I couldn't do it today" and reaches a calm closing, so they are never asked them. AGENTS.md says a red-flag answer shows the emergency line immediately. Here the camera has become a gate on that screen. The clinical-workflow review of plan A (commit 6ffefed) flagged this as a priority.

What exists today:
- The console's session page says "Symptoms were not asked, including the red-flag questions".
- A follow-up opens on Today, and the call is the chance to ask.

## Proposed flow

1. After the server acknowledges "couldn't complete", ask the red-flag question before the closing. It doesn't need the camera.
2. **Yes** goes straight to the existing emergency screen and lines (`content/patient-lines.json` → `emergency`), with Call 911. The console session is marked as a red flag, the same way the test flow's red flag is.
3. **No** goes to the closing as today.

## Questions for the clinician

1. Only the breath or chest-pain question (the one red flag), or all four symptom questions?
2. Should "No" change the closing wording?
3. Should a red flag here also open the urgent path on the console (escalate_urgent, route surgeon on call), as the test flow does?
4. RehabNinja and the classic check-in should behave the same. Is that right?

## When approved

- Reuse the existing question and emergency components on both surfaces.
- Add a phone event for the answer, and a console rule for a red flag with no test.
- Add a test that a Yes always shows the emergency line immediately.
