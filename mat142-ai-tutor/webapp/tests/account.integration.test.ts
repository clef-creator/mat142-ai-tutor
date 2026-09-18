/** Authenticated account lifecycle and RLS checks against a disposable Supabase project. */
import assert from 'node:assert/strict';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { POST as startSession } from '@/app/api/session/start/route';
import { POST as chat, GET as chatStatus } from '@/app/api/chat/route';
import { POST as endSession } from '@/app/api/session/end/route';
import { readTutorStream } from '@/lib/chat-stream';
import { findActiveFaculty } from '@/lib/faculty';
import { loadDashboardRows } from '@/lib/dashboard-data';
import { accountIntegrationState as state } from './stubs/account-integration-state';
import { localSupabase } from './local-supabase';

const { url, anonKey, serviceKey } = localSupabase();
process.env.NEXT_PUBLIC_SUPABASE_URL = url;
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
state.admin = admin;

type Person = { id: string; email: string; password: string; client: SupabaseClient };
const people: Person[] = [];
const allowedEmails: string[] = [];
let facultyEmail: string | null = null;

function value<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error) throw new Error(result.error.message);
  if (result.data == null) throw new Error('Expected database data');
  return result.data;
}

function successful(result: { error: { message: string } | null }) {
  if (result.error) throw new Error(result.error.message);
}

async function createPerson(role: 'student' | 'faculty'): Promise<Person> {
  const email = `issue24-${crypto.randomUUID()}@ahduni.edu.in`;
  const password = `Test-${crypto.randomUUID()}!`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (createError || !created.user) throw createError ?? new Error('Auth user was not created');
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const person = { id: created.user.id, email, password, client };
  people.push(person);
  if (role === 'faculty') {
    successful(await admin.from('allowed_faculty').insert({ email }));
    facultyEmail = email;
    successful(await admin.from('faculty').insert({ id: person.id, email }));
  }
  return person;
}

async function enroll(person: Person) {
  successful(await admin.from('allowed_students').insert({ email: person.email, display_name: 'Integration Student' }));
  allowedEmails.push(person.email);
  successful(await admin.from('students').insert({ id: person.id, email: person.email, display_name: 'Integration Student' }));
}

async function signIn(person: Person) {
  const { data: signedIn, error } = await person.client.auth.signInWithPassword({ email: person.email, password: person.password });
  if (error) throw error;
  assert.equal(signedIn.user?.id, person.id);
}

function asUser(person: Person) { state.user = { id: person.id, email: person.email }; }
const requestId = () => crypto.randomUUID();
const postChat = (sessionId: string, id: string, message?: string, opening = false) =>
  chat(new Request('http://localhost/api/chat', { method: 'POST',
    body: JSON.stringify({ sessionId, requestId: id, message, opening }) }));
const getChat = (sessionId: string, id: string) =>
  chatStatus(new Request(`http://localhost/api/chat?sessionId=${sessionId}&requestId=${id}`));
const postEnd = (sessionId: string) =>
  endSession(new Request('http://localhost/api/session/end', { method: 'POST',
    body: JSON.stringify({ sessionId }) }));
const startDefault = () => startSession(new Request('http://localhost/api/session/start', { method: 'POST' }));
async function reply(response: Response) {
  assert.equal(response.status, 200);
  return readTutorStream(response.body, () => undefined);
}
async function status(sessionId: string, id: string) {
  const response = await getChat(sessionId, id);
  assert.equal(response.status, 200);
  return response.json() as Promise<{ status: string; history: { role: string; content: string }[] }>;
}
function holdModel() {
  let release!: () => void;
  state.holdModel = new Promise<void>((resolve) => { release = resolve; });
  return () => { state.holdModel = null; release(); };
}

async function main() {
  try {
    const studentA = await createPerson('student');
    const studentB = await createPerson('student');
    const professor = await createPerson('faculty');
    await Promise.all(people.map(signIn));

    asUser(studentA);
    assert.equal((await startDefault()).status, 403, 'an Auth account alone is not enrollment');
    await enroll(studentA);
    await enroll(studentB);
    assert.equal((await findActiveFaculty(admin, studentA))?.id, undefined);
    assert.equal((await findActiveFaculty(admin, professor))?.id, professor.id);

    const startedA = await startDefault();
    assert.equal(startedA.status, 200);
    const sessionA = (await startedA.json()).sessionId as string;
    assert.equal((await (await startDefault()).json()).sessionId, sessionA, 'start resumes an open session');
    asUser(studentB);
    const sessionB = (await (await startDefault()).json()).sessionId as string;
    assert.notEqual(sessionA, sessionB);
    assert.equal((await postChat(sessionA, requestId(), 'Intrusion')).status, 404);

    asUser(studentA);
    const openingId = requestId();
    const releaseOpening = holdModel();
    const opening = await postChat(sessionA, openingId, undefined, true);
    const duplicateOpening = await postChat(sessionA, requestId(), undefined, true);
    assert.equal(duplicateOpening.status, 409, 'parallel opening is rejected');
    releaseOpening();
    await reply(opening);
    assert.deepEqual((await status(sessionA, openingId)).history.map((m) => m.role), ['assistant']);

    const firstId = requestId();
    const firstReply = await reply(await postChat(sessionA, firstId, 'What is a function?'));
    const calls = state.tutorCalls;
    assert.equal(await reply(await postChat(sessionA, firstId, 'What is a function?')), firstReply);
    assert.equal(state.tutorCalls, calls, 'retry replays the saved reply without another model call');
    assert.equal((await status(sessionA, firstId)).history.length, 3);

    const tabA = requestId();
    const releaseTab = holdModel();
    const active = await postChat(sessionA, tabA, 'Tab A');
    const tabB = requestId();
    assert.equal((await postChat(sessionA, tabB, 'Tab B')).status, 409);
    releaseTab();
    await reply(active);
    await reply(await postChat(sessionA, tabB, 'Tab B'));
    assert.equal((await status(sessionA, tabB)).history.length, 7);

    const failedModelId = requestId();
    state.modelFails = true;
    const failedModel = await postChat(sessionA, failedModelId, 'Model failure');
    await assert.rejects(readTutorStream(failedModel.body, () => undefined));
    state.modelFails = false;
    assert.equal((await status(sessionA, failedModelId)).status, 'failed');
    assert.equal((await status(sessionA, failedModelId)).history.length, 7);
    await reply(await postChat(sessionA, failedModelId, 'Model failure'));

    const failedWriteId = requestId();
    state.failComplete = true;
    const failedWrite = await postChat(sessionA, failedWriteId, 'Database failure');
    await assert.rejects(readTutorStream(failedWrite.body, () => undefined));
    state.failComplete = false;
    assert.equal((await status(sessionA, failedWriteId)).status, 'failed');
    await reply(await postChat(sessionA, failedWriteId, 'Database failure'));

    const closingTurnId = requestId();
    const releaseClosingTurn = holdModel();
    const closingTurn = await postChat(sessionA, closingTurnId, 'One more question');
    assert.equal((await postEnd(sessionA)).status, 409, 'ending waits for an in-flight reply');
    releaseClosingTurn();
    await reply(closingTurn);

    const assessmentClaim = value(await admin.rpc('claim_session_assessment', {
      p_session_id: sessionA, p_student_id: studentA.id,
    })) as { status: string; claimId: string };
    assert.equal(assessmentClaim.status, 'claimed');
    assert.equal((value(await admin.rpc('claim_session_assessment', {
      p_session_id: sessionA, p_student_id: studentA.id,
    })) as { status: string }).status, 'busy', 'a second ending cannot assess the same transcript');
    assert.equal((await postChat(sessionA, requestId(), 'Too late')).status, 409,
      'a new turn cannot change history during assessment');
    successful(await admin.rpc('release_session_assessment', {
      p_session_id: sessionA, p_student_id: studentA.id, p_claim_id: assessmentClaim.claimId,
    }));
    assert.equal((value(await admin.rpc('finalize_tutor_session', {
      p_session_id: sessionA, p_student_id: studentA.id, p_claim_id: assessmentClaim.claimId,
      p_assessed: true, p_outcome: 'steady', p_summary: 'Stale assessment',
      p_sticking_point: null, p_asked_for_answers: false, p_self_critical: false,
    })) as { status: string }).status, 'claim_expired', 'a released claim cannot finalize');

    asUser(studentB);
    await reply(await postChat(sessionB, requestId(), undefined, true));
    assert.deepEqual(value(await studentB.client.from('messages').select('id').eq('session_id', sessionA)), []);
    assert.deepEqual(value(await professor.client.from('messages').select('id')), [], 'faculty cannot read transcripts');
    assert.deepEqual(value(await professor.client.from('chat_turns').select('request_id')), [], 'faculty cannot read pending text');
    assert.deepEqual(value(await createClient(url, anonKey).from('messages').select('id')), [], 'anonymous users cannot read transcripts');
    assert.ok((value(await studentA.client.from('messages').select('id').eq('session_id', sessionA)) ?? []).length > 0);
    assert.ok((await studentA.client.from('messages').insert({
      session_id: sessionA, student_id: studentA.id, role: 'user', content: 'forged',
    })).error, 'students cannot forge transcripts');

    asUser(studentA);
    successful(await admin.from('allowed_students').delete().eq('email', studentA.email));
    assert.deepEqual(value(await studentA.client.from('messages').select('id').eq('session_id', sessionA)), []);
    assert.equal((await startDefault()).status, 403);
    assert.equal((await postChat(sessionA, requestId(), 'Revoked')).status, 403);
    assert.equal((await getChat(sessionA, firstId)).status, 403);
    assert.equal((await postEnd(sessionA)).status, 403);
    successful(await admin.from('allowed_students').insert({ email: studentA.email }));

    state.failFinalize = true;
    assert.equal((await postEnd(sessionA)).status, 500);
    assert.equal(value(await admin.from('sessions').select('ended_at').eq('id', sessionA).single()).ended_at, null);
    assert.equal(value(await admin.from('progress').select('attempts').eq('student_id', studentA.id).single()).attempts, 0,
      'failed finalization does not count an attempt');
    state.failFinalize = false;
    assert.equal((await postEnd(sessionA)).status, 200);
    assert.equal((await (await postEnd(sessionA)).json()).alreadyEnded, true);
    const ended = value(await admin.from('sessions').select('ended_at, outcome').eq('id', sessionA).single());
    assert.ok(ended.ended_at);
    assert.equal(ended.outcome, 'steady');
    assert.equal(value(await admin.from('progress').select('attempts').eq('student_id', studentA.id).single()).attempts, 1);

    const invalidTopic = await startSession(new Request('http://localhost/api/session/start', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicId: 'not-a-course-topic' }),
    }));
    assert.equal(invalidTopic.status, 400, 'unknown topics cannot be selected');
    const chosenTopic = 'derivative-chain-rule';
    const chosenStart = await startSession(new Request('http://localhost/api/session/start', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicId: chosenTopic }),
    }));
    assert.equal(chosenStart.status, 200);
    const chosenSession = (await chosenStart.json()).sessionId as string;
    assert.equal(value(await admin.from('sessions').select('topic_id').eq('id', chosenSession).single()).topic_id, chosenTopic);
    const conflictingStart = await startSession(new Request('http://localhost/api/session/start', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicId: 'what-is-a-function' }),
    }));
    assert.equal(conflictingStart.status, 409, 'a topic change cannot reuse an open session');
    await reply(await postChat(chosenSession, requestId(), undefined, true));
    await reply(await postChat(chosenSession, requestId(), 'Can we practice the chain rule?'));
    assert.equal((await postEnd(chosenSession)).status, 200);
    assert.equal(value(await admin.from('progress').select('attempts').eq('student_id', studentA.id)
      .eq('topic_id', chosenTopic).single()).attempts, 1, 'new work is assessed on the chosen topic');
    assert.equal(value(await admin.from('progress').select('attempts').eq('student_id', studentA.id)
      .eq('topic_id', 'what-is-a-function').single()).attempts, 1, 'earlier progress is unchanged');

    const dashboard = await loadDashboardRows(professor.client);
    assert.ok(dashboard.allowedStudents.some((row) => row.email === studentA.email));
    assert.ok(dashboard.students.some((row) => row.id === studentB.id));
    assert.ok(dashboard.sessions.some((row) => row.id === sessionA));
    console.log('Authenticated account integration checks passed.');
  } finally {
    state.holdModel = null;
    state.failComplete = false;
    state.failFinalize = false;
    for (const person of people) {
      await admin.auth.admin.deleteUser(person.id);
    }
    for (const email of allowedEmails) {
      await admin.from('allowed_students').delete().eq('email', email);
    }
    if (facultyEmail) await admin.from('allowed_faculty').delete().eq('email', facultyEmail);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
