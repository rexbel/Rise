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
4. The rules can only raise the outcome:
   - an on-track or nurse-callback result becomes **Confirm with a person** (care coordinator), with "Questions not finished: … not answered";
   - an escalation from the answers given still stands, with the unanswered questions listed.
5. Confirm-with-a-person opens a follow-up on Today, so someone calls and asks the missing questions.

## Questions for the clinician

1. Is "confirm with a person" the right floor, or should an unanswered red-flag question (shortness of breath or chest pain) escalate further?
2. Should the follow-up be due sooner than "today" when the red-flag question is the one unanswered?
3. Should Leave be blocked on the red-flag question itself (only Back offered), so it is always answered or the patient closes the page?
4. Is the confirmation wording acceptable (drafted in `content/patient-lines.json` with the UI)?
