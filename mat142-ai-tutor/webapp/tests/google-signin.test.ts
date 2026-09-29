import { googleSignInEnabled } from '@/lib/mode';
import { provisionStudents, type ProvisionResult } from '@/lib/provisioning';

let failures = 0;
function check(name: string, condition: boolean) {
  console.log(`${condition ? 'ok  ' : 'FAIL'}  ${name}`);
  if (!condition) failures++;
}

// --- the switch -------------------------------------------------------------

const saved = process.env.NEXT_PUBLIC_GOOGLE_SIGN_IN;
delete process.env.NEXT_PUBLIC_GOOGLE_SIGN_IN;
check('Google sign-in is off unless it is switched on', !googleSignInEnabled());
process.env.NEXT_PUBLIC_GOOGLE_SIGN_IN = 'yes';
check('only the word "on" switches it on', !googleSignInEnabled());
process.env.NEXT_PUBLIC_GOOGLE_SIGN_IN = ' On ';
check('"on" works whatever its case and spacing', googleSignInEnabled());
if (saved === undefined) delete process.env.NEXT_PUBLIC_GOOGLE_SIGN_IN;
else process.env.NEXT_PUBLIC_GOOGLE_SIGN_IN = saved;

// --- adding students without passwords -------------------------------------

interface FakeUser { id: string; email: string; password?: string }

function fakeAdmin(existing: FakeUser[]) {
  const users = [...existing];
  const upserts: unknown[] = [];
  const client = {
    from() {
      return {
        async upsert(values: unknown) {
          upserts.push(values);
          return { error: null };
        },
      };
    },
    auth: {
      admin: {
        async listUsers() {
          return { data: { users: users.map((u) => ({ id: u.id, email: u.email })) }, error: null };
        },
        async createUser(attrs: { email: string; password?: string }) {
          if (attrs.email.startsWith('broken')) {
            return { data: { user: null }, error: { message: 'could not create' } };
          }
          const user = { id: `id-${users.length + 1}`, email: attrs.email, password: attrs.password };
          users.push(user);
          return { data: { user }, error: null };
        },
        async updateUserById(id: string, attrs: { password: string }) {
          const user = users.find((u) => u.id === id);
          if (user) user.password = attrs.password;
          return { data: { user }, error: null };
        },
      },
    },
  };
  return { client, users, upserts };
}

function byEmail(results: ProvisionResult[], email: string) {
  return results.find((r) => r.email === email)!;
}

void (async () => {
  const entries = [
    { email: 'new.student@ahduni.edu.in', displayName: 'New Student' },
    { email: 'old.student@ahduni.edu.in', displayName: 'Old Student' },
  ];

  // No password anywhere in the answer, and nobody who already has an
  // account has theirs changed, even if a reset is asked for.
  const admin = fakeAdmin([{ id: 'id-old', email: 'old.student@ahduni.edu.in', password: 'kept' }]);
  const added = await provisionStudents(admin.client as never, entries, { passwords: false, resetExisting: true });
  check('a new student is added', byEmail(added, 'new.student@ahduni.edu.in').status === 'added');
  check('nobody is shown a password', added.every((r) => r.password === null));
  check(
    'the new account has no password at all',
    admin.users.find((u) => u.email === 'new.student@ahduni.edu.in')?.password === undefined,
  );
  check(
    'an existing password is never replaced, even if asked',
    admin.users.find((u) => u.email === 'old.student@ahduni.edu.in')?.password === 'kept' &&
      byEmail(added, 'old.student@ahduni.edu.in').status === 'already-set-up',
  );
  check('every address still goes on the pilot list', admin.upserts.length === 1);

  const partial = fakeAdmin([]);
  const mixed = await provisionStudents(partial.client as never, [
    { email: 'broken.student@ahduni.edu.in', displayName: null },
    { email: 'fine.student@ahduni.edu.in', displayName: null },
  ], { passwords: false });
  check(
    'one failure does not stop the rest',
    byEmail(mixed, 'fine.student@ahduni.edu.in').status === 'added' &&
      byEmail(mixed, 'broken.student@ahduni.edu.in').status === 'failed',
  );

  console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
  if (failures) process.exit(1);
})().catch((error) => { console.error(error); process.exit(1); });
