# Clinical review: leaving during the symptom questions

Status: **built behind a rule that needs clinical sign-off.** The behavior is live in `lib/rules.ts` (rule `questions_unfinished`) so a patient is never trapped on the questions screen, but its clinical handling should be confirmed.

## Why

Every patient screen now has a Leave control. If a patient leaves after finishing the test but before answering all four symptom questions:
- discarding the result loses real data;
- sending it as if all answers were "No" is unsafe (a red-flag question may be unanswered).

## What the build does

1. Leave asks for confirmation ("Leave this check-in?").
2. The result is sent with `questionsUnanswered` listing the questions not answered. Their values are placeholders, never answers.
3. The console shows those questions as "Not answered", never "No".
4. The rules never lower the outcome:
   - an on-track result becomes **Confirm with a person** (care coordinator), with "Questions not finished: … not answered";
   - a nurse-callback result also becomes Confirm with a person but keeps its route (for example physical therapy for balance). Both rank the same, so this changes who reviews it first, not how urgent it is;
   - an escalation from the answers given still stands, with the unanswered questions listed.
5. A Confirm-with-a-person card waits on the live board. A follow-up opens on Today only after a person approves it; leaving does not open one by itself.
6. After a red-flag Yes, the questions end at the emergency screen. Any question after it is sent as not answered, never as "No".
7. "I tapped Yes by mistake" (both surfaces) clears the red-flag answer with one tap. The card keeps a "Red flag retracted" warning and stays on "confirm with a person" (status and tile) until a person decides, even if the later answers are on track.
8. Leaving before a result (no test finished) marks the session "Left the check-in" with the step. Leaving during the test or countdown, including after Stop, shows the same amber tile as a pause. No follow-up opens.

## Questions for the clinician

1. Is "confirm with a person" the right floor, or should an unanswered red-flag question (shortness of breath or chest pain) escalate further, or go to a nurse rather than the care coordinator?
2. Should the follow-up be due sooner than "today" when the red-flag question is the one unanswered?
3. Should Leave be blocked on the red-flag question itself (only Back offered), so it is always answered or the patient closes the page?
4. Is the confirmation wording acceptable (drafted in `content/patient-lines.json` with the UI)?
5. Should "I tapped Yes by mistake" ask for confirmation first? An unused line exists for it: "Did you mean to say you are short of breath or have chest pain?" (`emergency.mistap_confirm`).
6. Should a retracted red flag also floor the recommendation itself at Confirm with a person, not only the status? Today the recommendation shown is the one from the later answers.
7. Who owns a patient who left during the test or after Stop (a possible safety event), and within what time? Should that open a follow-up on Today, the way "couldn't complete" does?
8. When the red-flag question is unanswered, should the "You left the check-in" screen add a safety-net line (for example what to do if they feel short of breath)? If so, the clinician should supply the wording.
9. Should the console prompt reviewers when a card has had no action for some time? If so, name who and the time window.
