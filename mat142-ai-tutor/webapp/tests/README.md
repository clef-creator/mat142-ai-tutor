# Tests

The checks are plain scripts rather than a test framework. They are bundled
with esbuild and run in sequence by `npm test`.

Run them with:

```
npm test
```

`npm run test:chat-turns:integration` checks concurrent opening and student turns,
duplicate requests, failed and expired generations, atomic counters, and the
turn limit against a disposable Supabase project. Apply `supabase/schema.sql`
there first, then set `TEST_SUPABASE_URL` and
`TEST_SUPABASE_SERVICE_ROLE_KEY`. The test creates and deletes its own user.

`chat-failures.test.ts` checks that model, persistence, and network failures
reject the stream after partial text instead of turning an error into a saved
assistant message. The client then checks saved history before showing a turn
as complete.

`session-write-failures.test.ts` checks that failed session start, end, and
history reads return errors instead of claiming the work was saved.

Everything should print `ok`. Anything printing `FAIL` is a real problem.

**`tutoring.test.ts`** checks the part that decides what a student works on:
that a new student starts at topic one, that a topic they struggled with comes
back before anything new, that the tutor is never handed a topic whose
prerequisites are missing, and that a session already under way keeps its own
topic even if the picker would now choose differently. It also checks that the
curriculum file itself is coherent — no topic listing a prerequisite that is
taught after it, which would deadlock a student.

**`rendering.test.tsx`** checks how the tutor's replies appear on screen.
Most of it is about one specific trap. Mathematics is written between dollar
signs, and this unit is about cost, revenue and profit, so the tutor writes
sums of money constantly. Without care, "costs $5 per unit and sells for $12"
is read as a formula and the words in between come out in italic mathematical
type — nonsense on the screen of a student who is already struggling. The tests
cover prices, prices mixed with real formulas, and formulas that legitimately
begin with a digit.

It also checks that a reply still renders correctly when only half of it has
arrived, since replies stream in a few characters at a time.

**`solo.test.tsx`** checks shared-code access, browser persistence, session
outcomes and the rendered differences between solo and account mode.

**`conversation.test.ts`** checks that each student message reaches the model
exactly once, in order, even across repeated messages and malformed history.

**`enrollment.test.ts`** checks account-mode authorization. It models a student
whose browser still has a valid login and an open tutoring session after their
address is removed from the pilot allow-list. Session start, chat and session
end must all return `403` before reading session data or calling either model.

**`faculty.test.ts`** checks that a professor role requires a privileged
faculty row matching both the authenticated user ID and email. It also checks
revocation, email changes and database lookup failures.

**`dashboard.test.ts`** checks the rolling weekly window, distinct-student
difficulty counts, unassessed sessions, roster aggregation and the absence of
transcripts or private summaries from the dashboard view model.

**`deployment-config.test.ts`** checks the explicit pre-deployment validator:
complete solo and account configurations pass, while partial Supabase setup,
placeholder secrets, insecure production URLs, mismatched domains and unsafe
limits fail without printing secret values.
