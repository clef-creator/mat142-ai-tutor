import { googleSignInEnabled } from '@/lib/mode';
import { findActiveStudentEnrollment, isUniversityGoogleSession } from '@/lib/enrollment';

let failures = 0;
function check(name: string, condition: boolean) {
  console.log(`${condition ? 'ok  ' : 'FAIL'}  ${name}`);
  if (!condition) failures++;
}

const email = 'student@ahduni.edu.in';
const googleUser = {
  id: 'student-id', email,
  identities: [{ provider: 'google', identity_data: { email, email_verified: true } }],
};
const oauth = { email, amr: [{ method: 'oauth' }] };
const password = { email, amr: [{ method: 'password' }] };

check('a verified university Google session is accepted',
  isUniversityGoogleSession(googleUser as never, oauth));
check('a university password session is refused',
  !isUniversityGoogleSession(googleUser as never, password));
check('a personal Google address is refused',
  !isUniversityGoogleSession({ ...googleUser, email: 'student@gmail.com' } as never,
    { ...oauth, email: 'student@gmail.com' }));
check('a Google identity for a different address is refused',
  !isUniversityGoogleSession({ ...googleUser, identities: [
    { provider: 'google', identity_data: { email: 'other@ahduni.edu.in', email_verified: true } },
  ] } as never, oauth));
check('an unverified Google email is refused',
  !isUniversityGoogleSession({ ...googleUser, identities: [
    { provider: 'google', identity_data: { email, email_verified: false } },
  ] } as never, oauth));
check('a forged claim email is refused',
  !isUniversityGoogleSession(googleUser as never, { ...oauth, email: 'other@ahduni.edu.in' }));

const saved = process.env.NEXT_PUBLIC_GOOGLE_SIGN_IN;
delete process.env.NEXT_PUBLIC_GOOGLE_SIGN_IN;
check('Google sign-in is off unless switched on', !googleSignInEnabled());
process.env.NEXT_PUBLIC_GOOGLE_SIGN_IN = 'on';
check('the configured Google sign-in switch works', googleSignInEnabled());
if (saved === undefined) delete process.env.NEXT_PUBLIC_GOOGLE_SIGN_IN;
else process.env.NEXT_PUBLIC_GOOGLE_SIGN_IN = saved;

let tableRead = '';
const admin = {
  from(table: string) {
    tableRead = table;
    return {
      select() { return this; },
      eq() { return this; },
      async maybeSingle() {
        return { data: { id: googleUser.id, email, display_name: 'Student' }, error: null };
      },
    };
  },
};

void (async () => {
  const active = await findActiveStudentEnrollment(admin as never, googleUser as never, oauth);
  check('a Google student needs no roster entry', active?.studentId === googleUser.id && tableRead === 'students');
  tableRead = '';
  const denied = await findActiveStudentEnrollment(admin as never, googleUser as never, password);
  check('a password session reads no student data', denied === null && tableRead === '');
  console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
  if (failures) process.exit(1);
})().catch((error) => { console.error(error); process.exit(1); });
