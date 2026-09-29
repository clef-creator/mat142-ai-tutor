import { GET } from '@/app/auth/callback/route';
import { callbackState } from './stubs/google-callback';

let failures = 0;
function check(name: string, condition: boolean) {
  console.log(`${condition ? 'ok  ' : 'FAIL'}  ${name}`);
  if (!condition) failures++;
}

function reset(email: string) {
  Object.assign(callbackState, {
    email, verified: true, method: 'oauth', signOuts: 0, deletions: 0,
    adminClients: 0, studentWrites: 0,
  });
}

const originalDomain = process.env.ALLOWED_EMAIL_DOMAIN;
const originalGoogle = process.env.NEXT_PUBLIC_GOOGLE_SIGN_IN;
process.env.ALLOWED_EMAIL_DOMAIN = 'ahduni.edu.in';

void (async () => {
  // A pre-existing account may belong to an older deployment. Rejecting this
  // sign-in must never delete that account or its dependent student work.
  for (const google of ['off', 'on']) {
    process.env.NEXT_PUBLIC_GOOGLE_SIGN_IN = google;
    reset('existing@gmail.com');
    const response = await GET(new Request('https://tutor.example/auth/callback?code=valid') as never);
    check(`outside-domain account is rejected when Google is ${google}`,
      response.headers.get('location') === 'https://tutor.example/auth/error?reason=domain');
    check(`outside-domain account is signed out when Google is ${google}`,
      callbackState.signOuts === 1);
    check(`outside-domain account is preserved when Google is ${google}`,
      callbackState.deletions === 0);
    check(`outside-domain account needs no admin client when Google is ${google}`,
      callbackState.adminClients === 0);
  }

  reset('student@ahduni.edu.in');
  const admitted = await GET(new Request('https://tutor.example/auth/callback?code=valid') as never);
  check('a verified university Google student reaches the tutor without a roster entry',
    admitted.headers.get('location') === 'https://tutor.example/tutor' &&
    callbackState.studentWrites === 1 && callbackState.signOuts === 0);

  reset('student@ahduni.edu.in');
  callbackState.verified = false;
  const unverified = await GET(new Request('https://tutor.example/auth/callback?code=valid') as never);
  check('an unverified Google address is rejected',
    unverified.headers.get('location') === 'https://tutor.example/auth/error?reason=google-required' &&
    callbackState.studentWrites === 0 && callbackState.signOuts === 1);

  reset('student@ahduni.edu.in');
  callbackState.method = 'password';
  const password = await GET(new Request('https://tutor.example/auth/callback?code=valid') as never);
  check('a password session cannot use the callback to enroll',
    password.headers.get('location') === 'https://tutor.example/auth/error?reason=google-required' &&
    callbackState.studentWrites === 0 && callbackState.signOuts === 1);

  if (originalDomain === undefined) delete process.env.ALLOWED_EMAIL_DOMAIN;
  else process.env.ALLOWED_EMAIL_DOMAIN = originalDomain;
  if (originalGoogle === undefined) delete process.env.NEXT_PUBLIC_GOOGLE_SIGN_IN;
  else process.env.NEXT_PUBLIC_GOOGLE_SIGN_IN = originalGoogle;

  console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
  if (failures) process.exit(1);
})().catch((error) => { console.error(error); process.exit(1); });
