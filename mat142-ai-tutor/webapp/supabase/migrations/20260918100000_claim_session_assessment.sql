-- Claim assessment before reading history, and fence new chat turns until it is saved.
alter table public.sessions
  add column if not exists assessment_claim_id uuid,
  add column if not exists assessment_lease_until timestamptz;

create or replace function public.claim_session_assessment(p_session_id uuid, p_student_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.sessions%rowtype;
  claim_id uuid := gen_random_uuid();
begin
  select * into s from public.sessions
    where id = p_session_id and student_id = p_student_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if s.ended_at is not null then return jsonb_build_object('status', 'already_ended'); end if;
  if s.assessment_lease_until > now() then
    return jsonb_build_object('status', 'busy');
  end if;
  if exists (select 1 from public.chat_turns
    where session_id = p_session_id and status = 'processing' and lease_until > now()) then
    return jsonb_build_object('status', 'reply_in_progress');
  end if;
  update public.sessions set assessment_claim_id = claim_id,
    assessment_lease_until = now() + interval '2 minutes'
    where id = p_session_id;
  return jsonb_build_object('status', 'claimed', 'claimId', claim_id, 'topicId', s.topic_id);
end $$;
revoke all on function public.claim_session_assessment(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_session_assessment(uuid, uuid) to service_role;

create function public.release_session_assessment(p_session_id uuid, p_student_id uuid, p_claim_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.sessions set assessment_claim_id = null, assessment_lease_until = null
    where id = p_session_id and student_id = p_student_id
      and assessment_claim_id = p_claim_id and ended_at is null;
end $$;
revoke all on function public.release_session_assessment(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.release_session_assessment(uuid, uuid, uuid) to service_role;

-- This also serializes the claim with a chat turn's claim on the session row.
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
  if s.assessment_lease_until > now() then return jsonb_build_object('status', 'finalizing'); end if;
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

-- A reply whose lease expired cannot land after assessment has claimed history.
create or replace function public.complete_chat_turn(
  p_session_id uuid, p_student_id uuid, p_request_id uuid, p_generation_id uuid,
  p_reply text, p_input_tokens bigint, p_output_tokens bigint
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  s public.sessions%rowtype;
  t public.chat_turns%rowtype;
begin
  select * into s from public.sessions where id = p_session_id and student_id = p_student_id for update;
  if not found or s.ended_at is not null or s.assessment_lease_until > now() then return false; end if;
  select * into t from public.chat_turns where session_id = p_session_id and request_id = p_request_id for update;
  if not found or t.status <> 'processing' or t.generation_id is distinct from p_generation_id
    or t.lease_until <= now() then
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

-- Replace the older unfenced entry point so every finalization requires its claim.
drop function public.finalize_tutor_session(uuid, uuid, boolean, public.topic_status, text, text, boolean, boolean);
create function public.finalize_tutor_session(
  p_session_id uuid, p_student_id uuid, p_claim_id uuid, p_assessed boolean,
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
  if p_claim_id is null or s.assessment_claim_id is distinct from p_claim_id
    or s.assessment_lease_until is null or s.assessment_lease_until <= now() then
    return jsonb_build_object('status', 'claim_expired');
  end if;
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
    self_critical = p_assessed and p_self_critical,
    assessment_claim_id = null, assessment_lease_until = null
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
revoke all on function public.finalize_tutor_session(uuid, uuid, uuid, boolean, public.topic_status, text, text, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.finalize_tutor_session(uuid, uuid, uuid, boolean, public.topic_status, text, text, boolean, boolean)
  to service_role;
