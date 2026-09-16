# Professor dashboard

The dashboard implements the mockup's cohort overview, difficulty chart,
student roster and per-student details. The export control is not part of this
screen; issue #9 covers it. The prototype's example names, figures and drawer
text are not used. Issue #11 still owns decisions about alert thresholds, turn
counts and whether tone observations should be visible.

The overview uses a rolling seven-day UTC window: session `started_at` is at
or after the start and before the current time. Active students means distinct
students who started a session. Topics attempted means distinct session topic
IDs. The median uses completed sessions that started in the window and have a
nonnegative duration. The difficulty chart counts distinct students per topic
whose session outcome is `shaky` in that window; unassessed sessions do not
count as difficulty. The roster includes every currently allow-listed student,
including those who have not signed in. It uses provisioned students' full
history for total sessions and current steady/shaky topic statuses. Removed
students are excluded from the active cohort's aggregates.

The "Activity to review" area reports facts only: no session in the window,
current shaky topic statuses, and the number of sessions in the window whose
existing `asked_for_answers` signal is true. That boolean is a session-level
observation, **not** a count of turns or a diagnosis. It does not implement the
mockup's Quiet, Stuck, Short or Answers threshold labels. Those rules remain
open in issue #11.

The route checks the authenticated user against the privileged faculty table
on every request. Dashboard rows are read with the signed-in Supabase client,
under faculty row-level security. The faculty-only allowlist read is added by a
migration. Queries explicitly select only identifiers,
display names, topic status and session-level outcomes/activity. They never
query `messages`, progress notes, session summaries, sticking points or tone
signals. If any read fails, the screen shows an error rather than partial
numbers. The loading and empty states are explicit.
