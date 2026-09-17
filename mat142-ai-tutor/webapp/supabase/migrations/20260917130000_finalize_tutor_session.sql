-- Save session outcomes, progress and last-seen time atomically.
-- This function does not expose student transcripts to faculty.

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
