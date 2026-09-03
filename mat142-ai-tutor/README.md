# MAT142 AI Tutor — "Calcu-Buddy"

A conversational calculus tutor for students in **MAT142 Introductory Calculus** at
Ahmedabad University, School of Arts and Sciences.

It is being built as a targeted intervention for fifteen students — the bottom 20% of the
cohort — who are struggling with the course and, in practice, freeze when handed an empty
box and told to practise. The tutor therefore opens each session with the next topic from
the lecture sequence rather than waiting to be asked.

---

## Status

**Prototype. Nothing is live.** There is no running application, no database, no student
has ever used this, and no API key exists yet. Everything in this repository is design
work: a clickable mock-up, a curriculum map, a cost model, and the questions still
outstanding with faculty.

The curriculum map in particular is **not yet verified by a mathematician** and should not
be treated as correct until it is.

---

## What is in here

| Folder | Contents |
|---|---|
| `prototype/` | `Calcu-Buddy-Mockup.html` — a clickable mock-up of both screens. Open it in any browser. Use the toggle at the top right to switch between the student view and the teaching-team view. Every student, session and number in it is invented. |
| `curriculum/` | `mat142-curriculum.json` — the nine lecture decks broken into 55 teachable topics, each with worked examples, common errors, and the earlier skills it depends on. This drives what the tutor teaches next. **Awaiting faculty verification.** |
| `planning/` | The cost model, and the briefing note listing the questions that need answering by faculty before the build can be finished. |
| `prompts/` | The original Gemini Gem instructions and TA guide that this project grew out of. Kept for reference; the v2 tutor instructions are not written yet. |
| `brand/` | Ahmedabad University logo assets and the colours taken from them. See below. |

---

## Deliberately not in here

Two things have been left out on purpose, and should stay out:

- **Thomas' Calculus (14th edition).** A commercial textbook. Republishing it — even in a
  private repository — is a copyright problem. The tutor is built to work only from the
  lecture slides and will never cite a textbook page.
- **The nine MAT142 lecture PDFs.** These are the department's teaching material rather
  than this project's, so they need a decision from the department before being committed
  anywhere. The curriculum map already captures everything the tutor needs from them.

`.gitignore` is set up to keep both out by accident as well as on purpose.

---

## How it is meant to work

**For students.** Sign in with an `@ahduni.edu.in` address using a magic link — no password
to forget. The tutor opens with the next topic in sequence, remembers what was covered in
previous sessions, and works through problems by asking questions rather than supplying
answers. Mathematics is typed and rendered properly rather than mangled into plain text.

**For the teaching team.** A dashboard showing **signals, not conversations**: which topics
each student has practised, where they keep getting stuck, how long sessions run, and who
has stopped showing up. Four flags surface students worth a conversation — quiet, stuck,
very short sessions, and asking for answers rather than method.

**On privacy — this matters and is easy to get wrong.** Conversations *are* stored, because
the tutor cannot remember a student's progress without them. The dashboard simply does not
display them. Students must be told this accurately. Nobody should tell them their
conversations are not saved, because that is not true.

---

## Cost

Modelled on Claude Opus at 15 students × 10 sessions × 30 turns: roughly **$126 per
semester** (about ₹11,000, or ₹740 per student), including hosting. The workbook in
`planning/` shows the assumptions and lets you change them. Heavy usage across the whole
cohort still lands under ₹20,000.

---

## Branding

Colours sampled from the official logo file, not guessed:

| Role | Hex |
|---|---|
| Primary maroon | `#85160F` |
| Deep maroon | `#63100B` |
| Maroon tint | `#FBEEEC` |
| Wordmark grey | `#4A4A48` |

The logo is maroon and grey on white and there is no reversed version, so it must sit on a
white or very light background — never on a maroon fill.

---

## Still open with faculty

The briefing in `planning/` lists seventeen questions. Five of them block the build:

1. Are integration by substitution and integration by parts within MAT142 scope?
2. The slides write integration by parts in a non-standard form. Must the tutor use only
   that form?
3. Are there worked solutions for the example slides that are left blank?
4. Is the 55-topic order and grain size right?
5. Which pre-calculus gaps matter most in practice?

Until at least the first four are answered, the tutor should not be put in front of a
student.
