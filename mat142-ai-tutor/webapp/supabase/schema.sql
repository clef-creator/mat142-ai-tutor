-- ============================================================================
-- Calcu-Buddy — MAT142 AI tutor
-- Database schema for Supabase (PostgreSQL)
--
-- Run this once, in the Supabase SQL Editor, on a new project.
-- It is safe to run again: everything is written to be idempotent.
--
-- The important thing in this file is the ROW LEVEL SECURITY at the bottom.
-- It is what makes "faculty see signals, not transcripts" a property of the
-- database rather than a promise about how the app is written. Even if the
-- application code had a bug, the database itself will not hand a student's
-- messages to anyone but that student.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Who is allowed in
--
-- One row per student in the pilot. Sign-in is refused for any address that
-- is not listed here, which is how the cohort stays at fifteen.
-- ---------------------------------------------------------------------------
create table if not exists public.students (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null unique,
  display_name text,
  cohort       text not null default 'monsoon-2026-pilot',
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz
);

-- The allow-list. Add the fifteen addresses here before students try to sign in.
create table if not exists public.allowed_students (
  email        text primary key,
  display_name text,
  added_at     timestamptz not null default now()
);

-- Teaching staff who may see the dashboard. Deliberately a separate table:
-- being faculty is not a flag on a student row.
create table if not exists public.faculty (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null unique,
  full_name  text,
  created_at timestamptz not null default now()
);

create table if not exists public.allowed_faculty (
  email    text primary key,
  added_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- What each student can do, topic by topic
--
-- This is the tutor's memory of progress, and it is what the dashboard will
-- eventually read. It holds judgements ("shaky on the chain rule"), never
-- anything the student typed.
-- ---------------------------------------------------------------------------
do $$ begin
  create type topic_status as enum ('not_started', 'shaky', 'steady');
exception when duplicate_object then null;
end $$;

create table if not exists public.progress (
  student_id     uuid not null references public.students(id) on delete cascade,
  topic_id       text not null,
  status         topic_status not null default 'not_started',
  attempts       int  not null default 0,
  last_worked_at timestamptz,
  -- A short factual note written by the tutor, e.g. "omits the derivative of
  -- the inner function". Signals, not transcript.
  note           text,
  primary key (student_id, topic_id)
);

-- ---------------------------------------------------------------------------
-- Sessions
-- ---------------------------------------------------------------------------
create table if not exists public.sessions (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.students(id) on delete cascade,
  topic_id      text not null,
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  turn_count    int not null default 0,
  -- Filled in when the session ends, by a cheap summarising model call.
  outcome       topic_status,
  summary       text,          -- carried into the next session as memory
  sticking_point text,
  -- Signals for the four dashboard flags.
  asked_for_answers boolean not null default false,
  self_critical     boolean not null default false
);

create index if not exists sessions_student_idx  on public.sessions (student_id, started_at desc);
create index if not exists sessions_topic_idx    on public.sessions (topic_id);

-- ---------------------------------------------------------------------------
-- Messages
--
-- Stored, because the tutor cannot remember a student's progress without them.
-- Never shown to faculty. Students are told exactly this.
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id         bigserial primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_session_idx on public.messages (session_id, id);

-- ---------------------------------------------------------------------------
-- Cost guard rail
--
-- One row per student per day, so runaway usage is visible and can be capped
-- before it becomes a bill.
-- ---------------------------------------------------------------------------
create table if not exists public.usage_daily (
  student_id    uuid not null references public.students(id) on delete cascade,
  day           date not null default current_date,
  input_tokens  bigint not null default 0,
  output_tokens bigint not null default 0,
  turns         int not null default 0,
  primary key (student_id, day)
);

-- ============================================================================
-- ROW LEVEL SECURITY
--
-- Default position: nobody can read anything. Each policy below then opens
-- exactly one door. Note there is NO policy granting faculty access to
-- public.messages — that omission is the privacy guarantee.
-- ============================================================================

alter table public.students         enable row level security;
alter table public.allowed_students enable row level security;
alter table public.faculty          enable row level security;
alter table public.allowed_faculty  enable row level security;
alter table public.progress         enable row level security;
alter table public.sessions         enable row level security;
alter table public.messages         enable row level security;
alter table public.usage_daily      enable row level security;

create or replace function public.is_faculty()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.faculty f where f.id = auth.uid()) $$;

-- --- students ---------------------------------------------------------------
drop policy if exists "student reads own record" on public.students;
create policy "student reads own record" on public.students
  for select using (id = auth.uid());

drop policy if exists "student updates own record" on public.students;
create policy "student updates own record" on public.students
  for update using (id = auth.uid());

drop policy if exists "faculty read student roster" on public.students;
create policy "faculty read student roster" on public.students
  for select using (public.is_faculty());

-- --- progress ---------------------------------------------------------------
drop policy if exists "student reads own progress" on public.progress;
create policy "student reads own progress" on public.progress
  for select using (student_id = auth.uid());

drop policy if exists "faculty read progress" on public.progress;
create policy "faculty read progress" on public.progress
  for select using (public.is_faculty());

-- --- sessions ---------------------------------------------------------------
drop policy if exists "student reads own sessions" on public.sessions;
create policy "student reads own sessions" on public.sessions
  for select using (student_id = auth.uid());

drop policy if exists "faculty read sessions" on public.sessions;
create policy "faculty read sessions" on public.sessions
  for select using (public.is_faculty());

-- --- messages ---------------------------------------------------------------
-- A student may read their own messages. There is deliberately no faculty
-- policy here. Adding one would break the promise made to students, so if you
-- ever find yourself writing it, stop and re-read the privacy note in README.
drop policy if exists "student reads own messages" on public.messages;
create policy "student reads own messages" on public.messages
  for select using (student_id = auth.uid());

-- --- usage ------------------------------------------------------------------
drop policy if exists "faculty read usage" on public.usage_daily;
create policy "faculty read usage" on public.usage_daily
  for select using (public.is_faculty());

-- Writes are performed by the server using the service role key, which bypasses
-- these policies. No insert/update policies are granted to signed-in users, so
-- a student cannot fabricate progress or edit their own transcript.

-- ============================================================================
-- Convenience view for the future dashboard.
-- Signals only. Contains no message text, by construction.
-- ============================================================================
create or replace view public.student_signals as
select
  st.id                                   as student_id,
  st.email,
  st.display_name,
  st.last_seen_at,
  count(distinct s.id)                    as session_count,
  coalesce(
    percentile_cont(0.5) within group (
      order by extract(epoch from (s.ended_at - s.started_at)) / 60.0
    ) filter (where s.ended_at is not null), 0
  )                                       as median_minutes,
  count(distinct p.topic_id) filter (where p.status = 'steady') as topics_steady,
  bool_or(s.asked_for_answers)            as ever_asked_for_answers,
  bool_or(s.self_critical)                as ever_self_critical
from public.students st
left join public.sessions s on s.student_id = st.id
left join public.progress p on p.student_id = st.id
group by st.id, st.email, st.display_name, st.last_seen_at;
