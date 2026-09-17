/** Run only against a disposable Supabase project with schema.sql applied. */
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { localSupabase } from './local-supabase';

const { url, serviceKey } = localSupabase();
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(name, args);
  if (error) throw error;
  return data as T;
}

type Claim = { status: string; generationId?: string; reply?: string };
const id = () => crypto.randomUUID();

async function main() {
  const email = `chat-turn-test-${id()}@example.invalid`;
  const { data: created, error: authError } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (authError || !created.user) throw authError ?? new Error('Could not create test user');
  const studentId = created.user.id;
  try {
    const { error: studentError } = await db.from('students').insert({ id: studentId, email });
    if (studentError) throw studentError;
    const { data: session, error: sessionError } = await db.from('sessions')
      .insert({ student_id: studentId, topic_id: 'what-is-a-function' }).select('id').single();
    if (sessionError || !session) throw sessionError ?? new Error('Could not create session');
    const sessionId = session.id as string;
    const claim = (requestId: string, opening: boolean, message: string, max = 40) =>
      rpc<Claim>('claim_chat_turn', { p_session_id: sessionId, p_student_id: studentId,
        p_request_id: requestId, p_opening: opening, p_message: message, p_max_turns: max });
    const complete = (requestId: string, generationId: string, reply: string) =>
      rpc<boolean>('complete_chat_turn', { p_session_id: sessionId, p_student_id: studentId,
        p_request_id: requestId, p_generation_id: generationId, p_reply: reply,
        p_input_tokens: 10, p_output_tokens: 5 });
    const fail = (requestId: string, generationId: string) =>
      rpc<boolean>('fail_chat_turn', { p_session_id: sessionId, p_student_id: studentId,
        p_request_id: requestId, p_generation_id: generationId });

    const openingId = id();
    const otherOpeningId = id();
    const [opening, duplicate] = await Promise.all([
      claim(openingId, true, ''), claim(otherOpeningId, true, ''),
    ]);
    assert.deepEqual([opening.status, duplicate.status].sort(), ['busy', 'claimed']);
    const winnerId = opening.status === 'claimed' ? openingId : otherOpeningId;
    const winner = opening.status === 'claimed' ? opening : duplicate;
    assert.equal(await complete(winnerId, winner.generationId!, 'Welcome'), true);
    assert.equal((await claim(winnerId, true, '')).status, 'completed');
    assert.equal((await claim(winnerId, true, '')).reply, 'Welcome');
    assert.equal((await claim(id(), true, '')).status, 'already_opened');

    const interruptedId = id();
    const first = await claim(interruptedId, false, 'What is a function?');
    assert.equal(first.status, 'claimed');
    assert.equal((await claim(interruptedId, false, 'What is a function?')).status, 'busy');
    assert.equal(await fail(interruptedId, first.generationId!), true);
    const retry = await claim(interruptedId, false, 'What is a function?');
    assert.equal(retry.status, 'claimed');
    assert.notEqual(retry.generationId, first.generationId);
    assert.equal(await complete(interruptedId, first.generationId!, 'stale'), false);
    assert.equal(await complete(interruptedId, retry.generationId!, 'A mapping.'), true);
    assert.equal(await complete(interruptedId, retry.generationId!, 'duplicate'), false);
    assert.equal((await claim(interruptedId, false, 'What is a function?')).reply, 'A mapping.');
    assert.equal((await claim(interruptedId, false, 'Different text')).status, 'conflict');

    const tabA = id();
    const tabB = id();
    const [a, b] = await Promise.all([
      claim(tabA, false, 'From tab A'), claim(tabB, false, 'From tab B'),
    ]);
    assert.deepEqual([a.status, b.status].sort(), ['busy', 'claimed']);
    const tabWinnerId = a.status === 'claimed' ? tabA : tabB;
    const tabWinner = a.status === 'claimed' ? a : b;
    assert.equal(await complete(tabWinnerId, tabWinner.generationId!, 'First tab reply'), true);
    const tabLoserId = a.status === 'busy' ? tabA : tabB;
    const tabLoserMessage = a.status === 'busy' ? 'From tab A' : 'From tab B';
    const tabLoser = await claim(tabLoserId, false, tabLoserMessage);
    assert.equal(tabLoser.status, 'claimed');
    assert.equal(await complete(tabLoserId, tabLoser.generationId!, 'Second tab reply'), true);

    const staleId = id();
    const stale = await claim(staleId, false, 'Try again');
    assert.equal(stale.status, 'claimed');
    const { error: leaseError } = await db.from('chat_turns')
      .update({ lease_until: new Date(0).toISOString() })
      .eq('session_id', sessionId).eq('request_id', staleId);
    if (leaseError) throw leaseError;
    const recovered = await claim(staleId, false, 'Try again');
    assert.equal(recovered.status, 'claimed');
    assert.notEqual(recovered.generationId, stale.generationId);
    assert.equal(await complete(staleId, stale.generationId!, 'too late'), false);
    assert.equal(await complete(staleId, recovered.generationId!, 'Recovered'), true);

    const [sessionRow, messages, usage] = await Promise.all([
      db.from('sessions').select('turn_count').eq('id', sessionId).single(),
      db.from('messages').select('role,content').eq('session_id', sessionId).order('id'),
      db.from('usage_daily').select('turns').eq('student_id', studentId).single(),
    ]);
    assert.equal(sessionRow.data?.turn_count, 5);
    assert.deepEqual(messages.data?.map((m) => m.role),
      ['assistant', 'user', 'assistant', 'user', 'assistant', 'user', 'assistant', 'user', 'assistant']);
    assert.equal(usage.data?.turns, 5);
    assert.equal((await claim(id(), false, 'One more', 5)).status, 'turn_limit');
    console.log('Chat turn integration checks passed.');
  } finally {
    const { error } = await db.auth.admin.deleteUser(studentId);
    if (error) throw error;
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
