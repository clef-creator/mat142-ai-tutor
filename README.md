# Calcu-Buddy | MAT142 AI Tutor

A conversational practice partner for **MAT142 Introductory Calculus at Ahmedabad University**, School of Arts and Sciences.

Calcu-Buddy starts with a specific topic and a warm-up question, guides students through problems, and remembers where they need more practice. The project is designed for a small pilot cohort, with a planned professor dashboard showing learning signals rather than raw conversations.

## Current status

The repository contains an implemented Next.js student tutor with two operating modes and a Supabase schema. The professor dashboard is currently a static HTML prototype.

| Area | Current implementation |
| --- | --- |
| Student tutor | Streaming AI chat, mathematical rendering, topic selection and session summaries |
| Demo access | Shared code; progress and current conversation stored in the browser |
| Account mode | Supabase email magic links, student allowlist, database-backed conversations and progress |
| Active curriculum | 13 topics from lecture decks 6 and 7: differentiation and its applications |
| Professor dashboard | Mockup with invented data; authenticated dashboard and export are not implemented |
| Reliability and access controls | Known gaps tracked in [GitHub issues](https://github.com/clef-creator/mat142-ai-tutor/issues) |

The active curriculum has `verified_by_faculty: false`. Faculty review and the tracked access-control and reliability work remain outstanding. This README describes the code; it does not certify a particular deployment or database configuration.

## How tutoring works

1. The student enters the demo code or signs in with an approved university email.
2. The app resumes an open session or chooses a topic from the student's progress.
3. The tutor opens with a question. Replies stream into the interface and LaTeX renders through KaTeX.
4. The student works through the problem with progressively stronger hints.
5. **End session** requests a model-generated assessment and updates progress. The current interface then starts another session.

Topic selection first revisits the earliest topic marked `shaky`, then advances through unstarted topics with prerequisite checks. When every topic is `steady`, it reviews the topic worked on longest ago. There is no lecture-calendar or professor-controlled topic-release mechanism.

The teaching prompt asks the model to use short responses, ask one question at a time, repair underlying algebra gaps, and teach apparent graded work using a different example. These are model instructions, not an independent mathematical correctness guarantee.

### Two operating modes

The switch is implemented in [mode.ts](mat142-ai-tutor/webapp/lib/mode.ts): an empty or absent `NEXT_PUBLIC_SUPABASE_URL` enables solo mode; a nonempty value enables account mode.

| Behavior | Solo / demo mode | Account mode |
| --- | --- | --- |
| Access | Shared code and optional first name | University email magic link |
| Application storage | Browser localStorage | Supabase PostgreSQL |
| Current session | Restored in the same browser | Restored from the database |
| Completed conversations | Replaced on completion; latest summary retained | Stored, but no history browser yet |
| Topic buttons | Can jump to another topic | Follow selected sequence |
| Reset | Clears browser progress | No reset interface |

Both modes call Anthropic through the server. Solo mode sends browser-held history with each request; account mode loads history from the database. Changing to account mode does not automatically migrate browser progress.

## Technology and architecture

| Layer | Technology |
| --- | --- |
| Application | Next.js 15 App Router, React 19, TypeScript |
| AI | Anthropic SDK, configurable tutor and summary models |
| Authentication and database | Supabase Auth, PostgreSQL, Supabase SSR clients |
| Mathematics | KaTeX |
| Styling | CSS in the webapp |
| Checks | TypeScript, esbuild-bundled test scripts, Next.js build |

The browser calls Next.js route handlers. Those handlers assemble the prompt, call Anthropic, and, in account mode, read and write Supabase.

**With the current code deployed on Vercel, API routes also execute on Vercel.** Supabase provides authentication and persistence. There are no Supabase Edge Functions in this repository; moving API execution there requires code changes.

There is no vector database, RAG pipeline, PDF retrieval or separate calculation engine. The model receives the active curriculum in its shared prompt, plus student progress, the latest session summary and current conversation.

## Repository guide

| Path | Purpose |
| --- | --- |
| [webapp/](mat142-ai-tutor/webapp/) | Runnable application; run npm commands here |
| [webapp/app/](mat142-ai-tutor/webapp/app/) | Pages, authentication callback and API routes |
| [webapp/lib/picker.ts](mat142-ai-tutor/webapp/lib/picker.ts) | Topic selection |
| [webapp/lib/prompt.ts](mat142-ai-tutor/webapp/lib/prompt.ts) | Active tutor and assessment prompts |
| [webapp/lib/tutor.ts](mat142-ai-tutor/webapp/lib/tutor.ts) | Streaming model responses |
| [webapp/lib/signals.ts](mat142-ai-tutor/webapp/lib/signals.ts) | End-of-session assessment |
| [webapp/data/curriculum.json](mat142-ai-tutor/webapp/data/curriculum.json) | Active 13-topic curriculum |
| [webapp/supabase/schema.sql](mat142-ai-tutor/webapp/supabase/schema.sql) | Existing database tables, policies and dashboard view |
| [webapp/tests/](mat142-ai-tutor/webapp/tests/) | Tutoring, rendering and solo-mode checks |
| [prototype/](mat142-ai-tutor/prototype/) | Student and professor HTML mockup |
| [curriculum/](mat142-ai-tutor/curriculum/) | Broader 55-topic reference curriculum; not imported by the webapp |
| [prompts/](mat142-ai-tutor/prompts/) | Earlier Gem instructions and teaching guides; reference material |
| [planning/](mat142-ai-tutor/planning/) | Faculty discussion and historical cost model |
| [brand/](mat142-ai-tutor/brand/) | University logo assets |

## Local setup

Install Git, Node.js and npm compatible with the dependencies in [package.json](mat142-ai-tutor/webapp/package.json). The repository does not currently pin a Node runtime version.

```bash
git clone https://github.com/clef-creator/mat142-ai-tutor.git
cd mat142-ai-tutor/mat142-ai-tutor/webapp
npm ci
```

Copy `.env.example` to `.env.local` in the webapp directory.

macOS / Linux:

```bash
cp .env.example .env.local
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

### Option A: demo without a database

Set the following in `.env.local`, replacing the angle-bracket placeholders:

```dotenv
ANTHROPIC_API_KEY=<your-anthropic-api-key>
TUTOR_MODEL=<model-id-enabled-for-your-account>
SUMMARY_MODEL=<model-id-enabled-for-your-account>
ACCESS_CODE=<your-shared-demo-code>

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

The access code must contain at least four characters. Use a longer code for a shared deployment. Explicitly clear the Supabase URL copied from the example: leaving its placeholder filled in selects account mode.

Set both model IDs explicitly to values available to your Anthropic account. The strings in the example and source defaults are configuration examples, not a guarantee of model availability.

Start the app:

```bash
npm run dev
```

Open [localhost:3000](http://localhost:3000), enter the code, and start a conversation.

### Option B: Supabase account mode

Use a development Supabase project to exercise the existing account flow.

1. Review and apply [schema.sql](mat142-ai-tutor/webapp/supabase/schema.sql) in the project's SQL editor.
2. Configure email authentication and email delivery for the intended test recipients.
3. Allow the app's callback URL, such as `http://localhost:3000/auth/callback`, in Supabase authentication redirect settings.
4. Add approved student emails to `public.allowed_students`.
5. Set the Supabase variables below, along with the Anthropic variables above.
6. Restart the development server and sign in through the emailed link.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=<your-project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-project-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-server-only-service-role-key>
ALLOWED_EMAIL_DOMAIN=ahduni.edu.in
NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN=ahduni.edu.in
```

Example development allowlist entry; replace with an actual approved test address:

```sql
insert into public.allowed_students (email, display_name)
values ('approved.student@ahduni.edu.in', 'Test Student')
on conflict (email) do update
set display_name = excluded.display_name;
```

Store emails in lowercase. On a successful callback, the app checks the email domain and allowlist, then creates or updates the `students` record linked to `auth.users`.

The schema is a baseline, not a completed production migration system. Review the [access-control](https://github.com/clef-creator/mat142-ai-tutor/issues/5) and [enrollment](https://github.com/clef-creator/mat142-ai-tutor/issues/6) issues before using real student data. Adding rows to the faculty tables does not create a working professor login flow.

## Configuration reference

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Server-only key used by both modes |
| `TUTOR_MODEL` | Model ID for streaming tutor replies |
| `SUMMARY_MODEL` | Model ID for end-of-session assessment |
| `ACCESS_CODE` | Shared entry code for solo mode |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL and current mode switch |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public client key expected by the current code |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only privileged database key |
| `ALLOWED_EMAIL_DOMAIN` | Server callback domain check |
| `NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN` | Corresponding sign-in form check |
| `MAX_TURNS_PER_SESSION` | Default 40; current request/turn limit |
| `MAX_SESSIONS_PER_DAY` | Default 6; account-mode session-start limit |
| `NEXT_PUBLIC_SITE_URL` | Present in the example; current sign-in code builds the callback from the browser origin |

Keep the two domain settings consistent. Limits are not a complete spending budget; concurrent requests and usage accounting have [open issues](https://github.com/clef-creator/mat142-ai-tutor/issues/19).

Never commit filled-in environment files or expose the Anthropic/service-role key using a `NEXT_PUBLIC_` variable. Check `git status` before committing local setup files.

## Existing database

The checked-in schema has **eight application tables**, plus the `student_signals` view and Supabase-managed authentication tables.

| Table | Stores |
| --- | --- |
| `students` | Student identity, cohort and last-seen timestamp |
| `allowed_students` | Approved student email addresses |
| `faculty` | Faculty identities used by database policies |
| `allowed_faculty` | Faculty allowlist table; not wired into the current callback |
| `sessions` | Topic, timestamps, turn count, summary and assessment flags |
| `messages` | Student and assistant conversation text |
| `progress` | Per-student, per-topic status, attempts and learning note |
| `usage_daily` | Recorded daily tutor token and turn totals |

Account-mode writes use a service-role client, which bypasses row-level security. Those server operations require their own authorization checks.

Future schema proposals are tracked as work, not reflected as existing tables in this README.

## Professor dashboard and privacy

The [HTML prototype](mat142-ai-tutor/prototype/Calcu-Buddy-Mockup.html) shows weekly activity, session durations, topic progress, recurring difficulties, attention flags, a student detail drawer and summary export. All its student identities, metrics and narratives are invented. Open it in a browser and use the view toggle to inspect the design.

The intended access rule is that the professor sees approved learning signals and cannot read student transcripts. Implementing this requires database/API enforcement as well as UI design; see [private memory boundaries](https://github.com/clef-creator/mat142-ai-tutor/issues/20).

In solo mode, the application retains progress and the open conversation in the browser. In account mode, conversations are stored in Supabase. Both modes send conversation data to Anthropic for replies and assessment; browser-only application storage does not mean data stays entirely on the device.

## Checks

Run these from `mat142-ai-tutor/webapp` inside the repository:

```bash
npm run typecheck
npm test
npm run build
```

Or run all three with `npm run check`.

| Script | Coverage |
| --- | --- |
| `test:tutoring` | Curriculum structure, topic selection, prompt construction |
| `test:rendering` | LaTeX, currency, malformed formulas and partial streamed text |
| `test:solo` | Shared-code helpers, browser storage and rendered solo/account differences |

These tests do not establish live model quality, Supabase permission correctness or end-to-end account behavior. That coverage is tracked in [#24](https://github.com/clef-creator/mat142-ai-tutor/issues/24).

## Vercel deployment

For this repository layout, set the Vercel project root directory to **`mat142-ai-tutor/webapp`** and use the Next.js application build (`npm run build`).

Configure environment variables for the intended mode and redeploy after changes. For account mode, configure Supabase authentication redirects for the deployed app origin and its `/auth/callback` path. Preview environments need their own appropriate configuration.

The application includes server-side routes and cannot be treated as a static HTML export. Keep model and service-role secrets server-side. Database provisioning is separate from a Vercel deployment.

## Known limitations and next work

- [Professor login](https://github.com/clef-creator/mat142-ai-tutor/issues/7), [dashboard](https://github.com/clef-creator/mat142-ai-tutor/issues/8) and [export](https://github.com/clef-creator/mat142-ai-tutor/issues/9) are unfinished.
- [Retries and concurrent chat](https://github.com/clef-creator/mat142-ai-tutor/issues/13), [finalization and attempt counts](https://github.com/clef-creator/mat142-ai-tutor/issues/15), and [duplicate solo input](https://github.com/clef-creator/mat142-ai-tutor/issues/25) need fixes.
- [Assessment failures currently default to shaky](https://github.com/clef-creator/mat142-ai-tutor/issues/16).
- [Activity timing](https://github.com/clef-creator/mat142-ai-tutor/issues/17), [topic switching](https://github.com/clef-creator/mat142-ai-tutor/issues/18), and [session history](https://github.com/clef-creator/mat142-ai-tutor/issues/21) need defined behavior.
- [Curriculum scope and faculty validation](https://github.com/clef-creator/mat142-ai-tutor/issues/22) and [deployment/migrations](https://github.com/clef-creator/mat142-ai-tutor/issues/23) remain open.

The planning workbook contains historical cost assumptions, not current pricing or a guaranteed budget.

## Contributing and teaching materials

Use a focused branch and pull request, describe the user-visible effect, and report which checks you ran. Link the relevant issue and distinguish proposed behavior from implemented behavior.

Do not commit student conversations, credentials, the commercial textbook, or departmental lecture PDFs without the necessary permission. The broader curriculum and legacy prompts are reference material; changes there do not automatically update the active webapp curriculum.

Preserve the university branding: maroon `#85160F`, deep maroon `#63100B`, tint `#FBEEEC`, and grey `#4A4A48`. Place the supplied logo on a white or light background.

No LICENSE file is currently included. Public repository visibility alone does not grant an open-source license; clarify reuse terms with the maintainers.
