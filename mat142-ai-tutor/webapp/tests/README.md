# Tests

Two files, both plain scripts. No test framework — this project is small enough
that a framework would be more to learn than it is worth.

Run them with:

```
npm test
```

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
