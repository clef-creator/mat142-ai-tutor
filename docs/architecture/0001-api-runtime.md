# ADR 0001: Run the application API on Vercel

- Status: Accepted
- Date: 2026-09-16
- Issue: [#23](https://github.com/clef-creator/mat142-ai-tutor/issues/23)

## Context

The application is a Next.js App Router project. Its tutoring, session and
access endpoints are implemented as `app/api/**/route.ts` route handlers. The
same server code owns prompt construction, calls Anthropic and uses the
Supabase service-role key for trusted persistence.

Connecting the application to Supabase changes authentication and persistence;
it does not move those route handlers into Supabase Edge Functions. Maintaining
two API runtimes would duplicate authorization, error handling and deployment
configuration without solving a current requirement.

## Decision

Application APIs run as Next.js route handlers on Vercel. Supabase provides
hosted Auth and PostgreSQL. No Supabase Edge Functions are part of the deployed
architecture.

- Vercel holds `ANTHROPIC_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` as
  server-only environment variables.
- The browser receives only the Supabase URL and anon key. Row-level security
  remains mandatory for browser-accessible data.
- Database changes are deployed separately through versioned Supabase
  migrations before application code that depends on them.
- Faculty never receive access to `messages`; dashboard APIs may expose only
  approved aggregate signals.

## Consequences

- Vercel and Supabase are both required for account mode, and their deployment
  configuration must be kept in sync.
- Route duration, streaming and regional latency are Vercel concerns; database
  permissions, backups and migrations are Supabase concerns.
- A future move to Edge Functions requires a new decision and migration plan.
  It may be justified by measured latency, transactional or scheduling needs,
  but it is not implied by enabling Supabase.
