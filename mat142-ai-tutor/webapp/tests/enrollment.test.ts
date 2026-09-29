/**
 * Active enrollment is checked on every account-mode tutoring operation.
 * These route-level checks model the important revocation case: the auth token
 * and an old open session still exist, but the session was authenticated with
 * a password. No student data may be read and no model may run.
 */

import { POST as startSession } from '@/app/api/session/start/route';
import { GET as chatStatus, POST as chat } from '@/app/api/chat/route';
import { POST as endSession } from '@/app/api/session/end/route';
import {
  findActiveStudentEnrollment,
  INACTIVE_ENROLLMENT_ERROR,
  normaliseEnrollmentEmail,
} from '@/lib/enrollment';
import { createAdminClient } from '@/lib/supabase/server';
import {
  enrollmentTestState,
  resetEnrollmentTestState,
} from './stubs/enrollment-state';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';

let failures = 0;
function check(name: string, condition: boolean, detail = '') {
  if (!condition) {
    failures += 1;
    console.log(`FAIL  ${name}${detail ? ' :: ' + detail : ''}`);
  } else {
    console.log(`ok    ${name}`);
  }
}

async function checkRevokedRoute(
  name: string,
  invoke: () => Promise<Response>,
) {
  resetEnrollmentTestState();
  const response = await invoke();
  const body = await response.json();

  check(`${name} rejects a password session`, response.status === 403, `status ${response.status}`);
  check(`${name} returns a stable access code`, body.error === INACTIVE_ENROLLMENT_ERROR);
  check(
    `${name} reads no session or student data after rejection`,
    enrollmentTestState.tablesRead.length === 0,
    enrollmentTestState.tablesRead.join(','),
  );
  check(`${name} does not call the tutor model`, enrollmentTestState.tutorCalls === 0);
  check(`${name} does not call the summary model`, enrollmentTestState.summaryCalls === 0);
}

async function run() {
  check(
    'enrollment emails are canonicalised',
    normaliseEnrollmentEmail('  Student@AHDUNI.EDU.IN ') === 'student@ahduni.edu.in',
  );

  resetEnrollmentTestState();
  enrollmentTestState.claims = { email: 'student@ahduni.edu.in', amr: [{ method: 'oauth' }] };
  const active = await findActiveStudentEnrollment(
    createAdminClient() as never,
    enrollmentTestState.user as never,
    enrollmentTestState.claims,
  );
  check('a verified Google student is active', active?.studentId === 'student-1');

  await checkRevokedRoute('session start', () => startSession(new Request('http://localhost/api/session/start', { method: 'POST' })));
  await checkRevokedRoute('chat with an existing session', () => chat(new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: enrollmentTestState.existingSessionId,
      requestId: '11111111-1111-4111-8111-111111111111', message: 'hello' }),
  })));
  await checkRevokedRoute('chat status with an existing session', () => chatStatus(new Request(
    `http://localhost/api/chat?sessionId=${enrollmentTestState.existingSessionId}&requestId=11111111-1111-4111-8111-111111111111`,
  )));
  await checkRevokedRoute('session end with an existing session', () => endSession(new Request('http://localhost/api/session/end', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: enrollmentTestState.existingSessionId }),
  })));

  resetEnrollmentTestState();
  enrollmentTestState.claims = { email: 'student@ahduni.edu.in', amr: [{ method: 'oauth' }] };
  enrollmentTestState.studentExists = false;
  const missing = await findActiveStudentEnrollment(createAdminClient() as never,
    enrollmentTestState.user as never, enrollmentTestState.claims);
  check('a missing student record fails closed', missing === null);

  enrollmentTestState.studentLookupError = true;
  const originalConsoleError = console.error;
  console.error = () => undefined;
  const unavailable = await findActiveStudentEnrollment(
    createAdminClient() as never,
    enrollmentTestState.user as never,
    enrollmentTestState.claims,
  );
  console.error = originalConsoleError;
  check('an unavailable student table fails closed', unavailable === null);

  if (failures > 0) process.exit(1);
}

void run();
