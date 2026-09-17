-- Retry-safe, serialized chat turns.
-- The service role alone may claim or complete turns.
-- A chat turn also holds raw student text, so no faculty read policy is added.

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


alter table public.chat_turns enable row level security;
