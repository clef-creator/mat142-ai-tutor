import { findActiveFaculty } from '@/lib/faculty';

let failures = 0;
function check(name: string, condition: boolean) {
  console.log(`${condition ? 'ok  ' : 'FAIL'}  ${name}`);
  if (!condition) failures++;
}

const professor = { id: 'professor-1', email: 'Professor@AHDUNI.EDU.IN' };

function database(row: { id: string; email: string } | null, lookupError = false) {
  const filters: Record<string, string> = {};
  return {
    from(table: string) {
      check('role lookup uses only the faculty table', table === 'faculty');
      return {
        select() { return this; },
        eq(key: string, value: string) { filters[key] = value; return this; },
        async maybeSingle() {
          return {
            data: !lookupError && row && row.id === filters.id && row.email === filters.email ? row : null,
            error: lookupError ? new Error('database unavailable') : null,
          };
        },
      };
    },
  };
}

async function run() {
  const row = { id: 'professor-1', email: 'professor@ahduni.edu.in' };
  check('provisioned faculty is recognized by ID and normalized email',
    (await findActiveFaculty(database(row) as never, professor))?.id === row.id);
  check('email alone cannot assign the professor role',
    await findActiveFaculty(database(row) as never, { ...professor, id: 'student-1' }) === null);
  check('an Auth email change revokes the role',
    await findActiveFaculty(database(row) as never, { ...professor, email: 'other@ahduni.edu.in' }) === null);
  check('deleting the faculty row revokes access',
    await findActiveFaculty(database(null) as never, professor) === null);
  check('missing Auth email cannot obtain the role',
    await findActiveFaculty(database(row) as never, { ...professor, email: undefined }) === null);

  const previousError = console.error;
  console.error = () => undefined;
  check('database lookup failures deny access',
    await findActiveFaculty(database(row, true) as never, professor) === null);
  console.error = previousError;

  if (failures) process.exit(1);
}

void run();
