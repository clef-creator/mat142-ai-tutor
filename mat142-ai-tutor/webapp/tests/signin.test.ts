import { parseRoster, MAX_ROSTER_ENTRIES } from '@/lib/roster';
import { newPassword, looksLikeGeneratedPassword, PASSWORD_LENGTH } from '@/lib/passwords';
import { WORDS } from '@/lib/words';
import { isSetupTokenCorrect, setupEnabled, MIN_SETUP_TOKEN_LENGTH } from '@/lib/setup-token';
import { provisionStudents, type ProvisionResult } from '@/lib/provisioning';

let failures = 0;
function check(name: string, condition: boolean) {
  console.log(`${condition ? 'ok  ' : 'FAIL'}  ${name}`);
  if (!condition) failures++;
}

const DOMAIN = 'ahduni.edu.in';

// --- reading the pasted list ------------------------------------------------

const roster = parseRoster(
  [
    'Aarav Shah, aarav.shah@ahduni.edu.in',
    'meera.patel@ahduni.edu.in',
    'Rohan Desai <rohan.desai@ahduni.edu.in>',
    'kabir.mehta@ahduni.edu.in\tKabir Mehta',
    '',
    '# a note to self',
    'Someone Outside, someone@gmail.com',
    'Aarav Again, AARAV.SHAH@ahduni.edu.in',
    'no address on this line',
  ].join('\n'),
  DOMAIN,
);

check('every usable line becomes an entry', roster.entries.length === 4);
check('a name before the address is kept', roster.entries[0].displayName === 'Aarav Shah');
check('an address on its own is fine', roster.entries[1].displayName === null);
check('angle brackets are not part of the name', roster.entries[2].displayName === 'Rohan Desai');
check('a name after the address is kept', roster.entries[3].displayName === 'Kabir Mehta');
check('addresses are lower-cased', roster.entries[0].email === 'aarav.shah@ahduni.edu.in');
check(
  'an outside address is refused rather than ignored',
  roster.problems.some((p) => p.reason.includes('@ahduni.edu.in')),
);
check(
  'the same address twice is reported, not duplicated',
  roster.problems.some((p) => p.reason.includes('already on the list')),
);
check(
  'a line with no address is reported',
  roster.problems.some((p) => p.reason.includes('No email address')),
);
check('blank lines and notes are neither entries nor problems', roster.problems.length === 3);
check('the page will not take an unbounded list', MAX_ROSTER_ENTRIES > 15 && MAX_ROSTER_ENTRIES <= 100);

// --- the passwords ----------------------------------------------------------

const passwords = Array.from({ length: 400 }, () => newPassword());
check('a password has the shape it is meant to', passwords.every(looksLikeGeneratedPassword));
check('a password is long enough to be worth typing carefully', PASSWORD_LENGTH >= 14);
check('a password is four words', passwords.every((p) => p.split('-').length === 4));

// Not "all 400 differ": two identical draws are possible and would be a fluke,
// not a fault. A generator that had stopped being random would repeat far more
// than twice, and this still catches that.
check('four hundred passwords are very nearly all different', new Set(passwords).size >= 398);

check(
  'nothing to mistype: lower case letters and hyphens only',
  passwords.every((p) => /^[a-z]+(?:-[a-z]+){3}$/.test(p)),
);

// The word list is the password. If it shrinks, or a word creeps in that has to
// be spelled out over the phone, the passwords get worse without anything else
// in the app changing.
check('the word list is long enough for four words to be hard to guess', WORDS.length >= 300);
check('every word is short enough to read off a slip', WORDS.every((w) => w.length >= 3 && w.length <= 7));
check('every word is plain lower case letters', WORDS.every((w) => /^[a-z]+$/.test(w)));
check('no word appears twice', new Set(WORDS).size === WORDS.length);

// --- the lock on the setup page --------------------------------------------

const savedToken = process.env.STUDENT_SETUP_TOKEN;

delete process.env.STUDENT_SETUP_TOKEN;
check('with no token configured the page does not exist', !setupEnabled());
check('and nothing opens it', !isSetupTokenCorrect(''));

process.env.STUDENT_SETUP_TOKEN = 'short';
check('a guessable token is refused rather than accepted quietly', !setupEnabled());
check('and it does not open the page either', !isSetupTokenCorrect('short'));

const goodToken = 'a'.repeat(MIN_SETUP_TOKEN_LENGTH);
process.env.STUDENT_SETUP_TOKEN = goodToken;
check('a long enough token turns the page on', setupEnabled());
check('the right token opens it', isSetupTokenCorrect(goodToken));
check('a near miss does not', !isSetupTokenCorrect(goodToken.slice(0, -1) + 'b'));
check('surrounding spaces are not a wrong answer', isSetupTokenCorrect(`  ${goodToken}  `));

if (savedToken === undefined) delete process.env.STUDENT_SETUP_TOKEN;
else process.env.STUDENT_SETUP_TOKEN = savedToken;

// --- creating the accounts --------------------------------------------------

interface FakeUser { id: string; email: string; password: string }

function fakeAdmin(existing: FakeUser[], options: { listFails?: boolean; allowListFails?: boolean } = {}) {
  const users = [...existing];
  const upserts: unknown[] = [];

  const client = {
    from() {
      return {
        async upsert(values: unknown) {
          upserts.push(values);
          return { error: options.allowListFails ? { message: 'no such table' } : null };
        },
      };
    },
    auth: {
      admin: {
        async listUsers() {
          if (options.listFails) return { data: null, error: { message: 'unavailable' } };
          return { data: { users: users.map((u) => ({ id: u.id, email: u.email })) }, error: null };
        },
        async createUser(attrs: { email: string; password: string }) {
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

  const first = fakeAdmin([{ id: 'id-old', email: 'old.student@ahduni.edu.in', password: 'kept' }]);
  const kept = await provisionStudents(first.client as never, entries);

  check('a student without an account gets one', byEmail(kept, 'new.student@ahduni.edu.in').status === 'created');
  check(
    'and a password to go with it',
    looksLikeGeneratedPassword(byEmail(kept, 'new.student@ahduni.edu.in').password ?? ''),
  );
  check(
    'a student who already has an account keeps their password',
    byEmail(kept, 'old.student@ahduni.edu.in').status === 'already-set-up' &&
      first.users.find((u) => u.email === 'old.student@ahduni.edu.in')?.password === 'kept',
  );
  check(
    'and is not handed a password that was not changed',
    byEmail(kept, 'old.student@ahduni.edu.in').password === null,
  );
  check('every address is put on the pilot list', first.upserts.length === 1);

  const second = fakeAdmin([{ id: 'id-old', email: 'old.student@ahduni.edu.in', password: 'kept' }]);
  const reset = await provisionStudents(second.client as never, entries, { resetExisting: true });
  check(
    'asking for new passwords replaces the existing one',
    byEmail(reset, 'old.student@ahduni.edu.in').status === 'password-reset' &&
      second.users.find((u) => u.email === 'old.student@ahduni.edu.in')?.password !== 'kept',
  );

  const partial = fakeAdmin([]);
  const mixed = await provisionStudents(partial.client as never, [
    { email: 'broken.student@ahduni.edu.in', displayName: null },
    { email: 'fine.student@ahduni.edu.in', displayName: null },
  ]);
  check('one account failing does not stop the rest', byEmail(mixed, 'fine.student@ahduni.edu.in').status === 'created');
  check('a failure says so rather than showing a password',
    byEmail(mixed, 'broken.student@ahduni.edu.in').status === 'failed' &&
    byEmail(mixed, 'broken.student@ahduni.edu.in').password === null);

  const cannotList = fakeAdmin([], { listFails: true });
  await provisionStudents(cannotList.client as never, entries).then(
    () => check('no accounts are created when the existing ones cannot be read', false),
    () => check('no accounts are created when the existing ones cannot be read', cannotList.users.length === 0),
  );

  const cannotAllow = fakeAdmin([], { allowListFails: true });
  await provisionStudents(cannotAllow.client as never, entries).then(
    () => check('no accounts are created when the pilot list cannot be written', false),
    () => check('no accounts are created when the pilot list cannot be written', cannotAllow.users.length === 0),
  );

  console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
  if (failures) process.exit(1);
})().catch((error) => { console.error(error); process.exit(1); });
