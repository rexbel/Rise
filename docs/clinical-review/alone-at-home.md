# Clinical review: "I'm on my own right now"

Status: **draft for clinical review. Not built.** Nothing here reaches a patient until a clinician signs it off.

## Why

The classic check-in's second safety step asks the patient to make sure someone is nearby. Today the only way forward is "Someone is nearby". A patient who is alone at home has two choices: confirm something untrue, or abandon the check-in. Neither is safe, and nothing tells the care team. The clinical-workflow review of commit 9b5143e flagged this (finding P2-c).

## Proposed flow

1. On the "Make sure someone is nearby" screen, add a second, quieter button under "Someone is nearby": **"I'm on my own right now"**.
2. That leads to one calm screen. It doesn't start the test and doesn't count as a missed check-in.
3. The phone sends an event to the console (`setup_alone`, audited). The session shows "Patient was alone; test not started" on the live board, so the coordinator can decide whether to call.
4. The patient can come back later from the same link.

## Wording for review

Each line follows the SAMHSA trauma-informed principles the app already uses: safety, choice, no blame, plain words. All lines are spoken by the coach and captioned.

| Where | Proposed text | Notes for the reviewer |
| --- | --- | --- |
| Button | I'm on my own right now | Neutral; doesn't imply they did something wrong. |
| Screen heading | Thanks for telling us. | Acknowledges, no judgement. |
| Body | This exercise is safest with someone nearby. Please try again when someone can be with you. | States the reason once. Doesn't mention falls, to avoid alarm. Confirm this is the right safety message. |
| Care-team line | We've let your care team know you were on your own today. | Only if the console event is built. Sets the expectation that someone may call. Confirm the team wants this promise made. |
| Button | Okay | Closes the screen. No "Do it anyway" option. Confirm that's the right call. |

## Questions for the clinician

1. Should a patient who is alone ever be allowed to do the chair stand (for example days 15 to 30, or a stable patient)? The draft says no.
2. Should "alone" count toward the "two missed check-ins create a coordinator task" rule (plan §6a)? The draft says it counts as a contact, not a miss.
3. Is "We've let your care team know" acceptable if nobody is guaranteed to call?
4. Should RehabNinja's combined safety card ("Sturdy chair behind you? Someone nearby? Feeling OK to start?") get the same option?

## When approved

- The lines go into `content/patient-lines.json` and `content/voice-lines.json`, with the voice re-rendered by `npm run voice`.
- Add a `setup_alone` session event and an audit label on the console.
- Add a test that "alone" never reaches the test step.
