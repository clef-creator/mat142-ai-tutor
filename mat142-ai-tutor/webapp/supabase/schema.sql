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

-- A turn is claimed before calling the model. Messages and the turn counter
-- are committed together only after a complete reply is available.
create table if not exists public.chat_turns (
  session_id uuid not null references public.sessions(id) on delete cascade,
  request_id uuid not null,
  student_id uuid not null references public.students(id) on delete cascade,
  opening boolean not null,
  message text not null,
  status text not null check (status in ('processing', 'failed', 'completed')),
  generation_id uuid,
  lease_until timestamptz,
  reply text,
  created_at timestamptz not null default now(),
  primary key (session_id, request_id)
);
create unique index if not exists chat_turns_one_processing_per_session
  on public.chat_turns (session_id) where status = 'processing';
create index if not exists chat_turns_student_idx on public.chat_turns (student_id, created_at desc);

create or replace function public.claim_chat_turn(
  p_session_id uuid, p_student_id uuid, p_request_id uuid,
  p_opening boolean, p_message text, p_max_turns integer
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.sessions%rowtype;
  t public.chat_turns%rowtype;
  active_turn public.chat_turns%rowtype;
  next_generation uuid := gen_random_uuid();
begin
  select * into s from public.sessions
    where id = p_session_id and student_id = p_student_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;

  select * into t from public.chat_turns
    where session_id = p_session_id and request_id = p_request_id;
  if found and (t.student_id <> p_student_id or t.opening <> p_opening or t.message <> p_message) then
    return jsonb_build_object('status', 'conflict');
  end if;
  if t.status = 'completed' then
    return jsonb_build_object('status', 'completed', 'reply', t.reply);
  end if;
  if s.ended_at is not null then return jsonb_build_object('status', 'ended'); end if;
  if s.turn_count >= p_max_turns then return jsonb_build_object('status', 'turn_limit'); end if;

  select * into active_turn from public.chat_turns
    where session_id = p_session_id and status = 'processing' for update;
  if found then
    if active_turn.lease_until > now() then
      return jsonb_build_object('status', 'busy');
    end if;
    update public.chat_turns set status = 'failed', generation_id = null, lease_until = null
      where session_id = p_session_id and request_id = active_turn.request_id;
  end if;

  if p_opening and exists (select 1 from public.messages where session_id = p_session_id) then
    return jsonb_build_object('status', 'already_opened');
  end if;
  if t.request_id is null then
    insert into public.chat_turns
      (session_id, request_id, student_id, opening, message, status, generation_id, lease_until)
    values (p_session_id, p_request_id, p_student_id, p_opening, p_message,
      'processing', next_generation, now() + interval '2 minutes');
  else
    update public.chat_turns set status = 'processing', generation_id = next_generation,
      lease_until = now() + interval '2 minutes'
    where session_id = p_session_id and request_id = p_request_id;
  end if;
  return jsonb_build_object('status', 'claimed', 'generationId', next_generation,
    'topicId', s.topic_id, 'turnCount', s.turn_count);
end $$;

create or replace function public.complete_chat_turn(
  p_session_id uuid, p_student_id uuid, p_request_id uuid, p_generation_id uuid,
  p_reply text, p_input_tokens bigint, p_output_tokens bigint
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  s public.sessions%rowtype;
  t public.chat_turns%rowtype;
begin
  select * into s from public.sessions where id = p_session_id and student_id = p_student_id for update;
  if not found or s.ended_at is not null then return false; end if;
  select * into t from public.chat_turns where session_id = p_session_id and request_id = p_request_id for update;
  if not found or t.status <> 'processing' or t.generation_id is distinct from p_generation_id then
    return false;
  end if;
  if not t.opening then
    insert into public.messages (session_id, student_id, role, content)
      values (p_session_id, p_student_id, 'user', t.message);
  end if;
  insert into public.messages (session_id, student_id, role, content)
    values (p_session_id, p_student_id, 'assistant', p_reply);
  update public.sessions set turn_count = turn_count + 1 where id = p_session_id;
  insert into public.usage_daily (student_id, day, input_tokens, output_tokens, turns)
    values (p_student_id, current_date, p_input_tokens, p_output_tokens, 1)
    on conflict (student_id, day) do update set
      input_tokens = public.usage_daily.input_tokens + excluded.input_tokens,
      output_tokens = public.usage_daily.output_tokens + excluded.output_tokens,
      turns = public.usage_daily.turns + 1;
  update public.chat_turns set status = 'completed', reply = p_reply,
    generation_id = null, lease_until = null
    where session_id = p_session_id and request_id = p_request_id;
  return true;
end $$;

create or replace function public.fail_chat_turn(
  p_session_id uuid, p_student_id uuid, p_request_id uuid, p_generation_id uuid
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.chat_turns set status = 'failed', generation_id = null, lease_until = null
    where session_id = p_session_id and student_id = p_student_id
      and request_id = p_request_id and generation_id = p_generation_id
      and status = 'processing';
  return found;
end $$;

revoke all on function public.claim_chat_turn(uuid, uuid, uuid, boolean, text, integer) from public, anon, authenticated;
revoke all on function public.complete_chat_turn(uuid, uuid, uuid, uuid, text, bigint, bigint) from public, anon, authenticated;
revoke all on function public.fail_chat_turn(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_chat_turn(uuid, uuid, uuid, boolean, text, integer) to service_role;
grant execute on function public.complete_chat_turn(uuid, uuid, uuid, uuid, text, bigint, bigint) to service_role;
grant execute on function public.fail_chat_turn(uuid, uuid, uuid, uuid) to service_role;

-- Session outcome, progress and last-seen time must be committed together.
create or replace function public.finalize_tutor_session(
  p_session_id uuid, p_student_id uuid, p_assessed boolean,
  p_outcome public.topic_status, p_summary text, p_sticking_point text,
  p_asked_for_answers boolean, p_self_critical boolean
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.sessions%rowtype;
  finished_at timestamptz := now();
begin
  select * into s from public.sessions
    where id = p_session_id and student_id = p_student_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if s.ended_at is not null then return jsonb_build_object('status', 'already_ended'); end if;
  if exists (select 1 from public.chat_turns
    where session_id = p_session_id and status = 'processing' and lease_until > now()) then
    return jsonb_build_object('status', 'busy');
  end if;
  if p_assessed and (p_outcome is null or p_outcome not in ('shaky', 'steady')) then
    return jsonb_build_object('status', 'invalid_outcome');
  end if;
  update public.sessions set ended_at = finished_at,
    outcome = case when p_assessed then p_outcome else null end,
    summary = p_summary,
    sticking_point = case when p_assessed then p_sticking_point else null end,
    asked_for_answers = p_assessed and p_asked_for_answers,
    self_critical = p_assessed and p_self_critical
    where id = p_session_id;
  update public.students set last_seen_at = finished_at where id = p_student_id;
  if p_assessed then
    insert into public.progress
      (student_id, topic_id, status, attempts, last_worked_at, note)
    values (p_student_id, s.topic_id, p_outcome, 1, finished_at, p_sticking_point)
    on conflict (student_id, topic_id) do update set
      status = excluded.status,
      attempts = public.progress.attempts + 1,
      last_worked_at = excluded.last_worked_at,
      note = excluded.note;
  end if;
  return jsonb_build_object('status', 'completed');
end $$;
revoke all on function public.finalize_tutor_session(uuid, uuid, boolean, public.topic_status, text, text, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.finalize_tutor_session(uuid, uuid, boolean, public.topic_status, text, text, boolean, boolean)
  to service_role;

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
alter table public.chat_turns       enable row level security;
alter table public.usage_daily      enable row level security;

create or replace function public.is_faculty()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.faculty f
    where f.id = auth.uid()
      and lower(f.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
$$;

-- A valid Supabase session is not, by itself, an active enrollment. This
-- function is used by student-facing RLS policies so removing an address from
-- allowed_students revokes direct database reads as well as application routes.
create or replace function public.has_active_student_enrollment()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.students st
    join public.allowed_students allowed
      on lower(allowed.email) = lower(st.email)
    where st.id = auth.uid()
      and lower(st.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
$$;

drop policy if exists "faculty read pilot allowlist" on public.allowed_students;
create policy "faculty read pilot allowlist" on public.allowed_students
  for select using (public.is_faculty());

-- --- students ---------------------------------------------------------------
drop policy if exists "student reads own record" on public.students;
create policy "student reads own record" on public.students
  for select using (id = auth.uid() and public.has_active_student_enrollment());

drop policy if exists "student updates own record" on public.students;
create policy "student updates own record" on public.students
  for update using (id = auth.uid() and public.has_active_student_enrollment())
  with check (id = auth.uid() and public.has_active_student_enrollment());

drop policy if exists "faculty read student roster" on public.students;
create policy "faculty read student roster" on public.students
  for select using (public.is_faculty());

-- --- progress ---------------------------------------------------------------
drop policy if exists "student reads own progress" on public.progress;
create policy "student reads own progress" on public.progress
  for select using (
    student_id = auth.uid() and public.has_active_student_enrollment()
  );

drop policy if exists "faculty read progress" on public.progress;
create policy "faculty read progress" on public.progress
  for select using (public.is_faculty());

-- --- sessions ---------------------------------------------------------------
drop policy if exists "student reads own sessions" on public.sessions;
create policy "student reads own sessions" on public.sessions
  for select using (
    student_id = auth.uid() and public.has_active_student_enrollment()
  );

drop policy if exists "faculty read sessions" on public.sessions;
create policy "faculty read sessions" on public.sessions
  for select using (public.is_faculty());

-- --- messages ---------------------------------------------------------------
-- A student may read their own messages. There is deliberately no faculty
-- policy here. Adding one would break the promise made to students, so if you
-- ever find yourself writing it, stop and re-read the privacy note in README.
drop policy if exists "student reads own messages" on public.messages;
create policy "student reads own messages" on public.messages
  for select using (
    student_id = auth.uid() and public.has_active_student_enrollment()
  );

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
