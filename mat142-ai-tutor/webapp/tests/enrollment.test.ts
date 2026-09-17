/**
 * Active enrollment is checked on every account-mode tutoring operation.
 * These route-level checks model the important revocation case: the auth token
 * and an old open session still exist, but the student's allow-list row has
 * been removed. Nothing beyond the allow-list may be read and no model may run.
 */

import { POST as startSession } from '@/app/api/session/start/route';
import { POST as chat } from '@/app/api/chat/route';
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

  check(`${name} rejects a revoked student`, response.status === 403, `status ${response.status}`);
  check(`${name} returns a stable revocation code`, body.error === INACTIVE_ENROLLMENT_ERROR);
  check(
    `${name} reads no session or student data after revocation`,
    enrollmentTestState.tablesRead.join(',') === 'allowed_students',
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
  enrollmentTestState.allowed = true;
  const active = await findActiveStudentEnrollment(
    createAdminClient() as never,
    enrollmentTestState.user,
  );
  check('an allow-listed, provisioned student is active', active?.studentId === 'student-1');

  await checkRevokedRoute('session start', () => startSession());
  await checkRevokedRoute('chat with an existing session', () => chat(new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: enrollmentTestState.existingSessionId,
      requestId: '11111111-1111-4111-8111-111111111111', message: 'hello' }),
  })));
  await checkRevokedRoute('session end with an existing session', () => endSession(new Request('http://localhost/api/session/end', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: enrollmentTestState.existingSessionId }),
  })));

  resetEnrollmentTestState();
  enrollmentTestState.allowedLookupError = true;
  const originalConsoleError = console.error;
  console.error = () => undefined;
  const unavailable = await findActiveStudentEnrollment(
    createAdminClient() as never,
    enrollmentTestState.user,
  );
  console.error = originalConsoleError;
  check('an unavailable allow-list fails closed', unavailable === null);

  if (failures > 0) process.exit(1);
}

void run();
