import { buildDashboard, type DashboardSession } from '@/lib/dashboard';
import { loadDashboardRows } from '@/lib/dashboard-data';

let failures = 0;
function check(name: string, condition: boolean) {
  console.log(`${condition ? 'ok  ' : 'FAIL'}  ${name}`);
  if (!condition) failures++;
}

const now = new Date('2026-09-16T12:00:00.000Z');
const students = [
  { id: 'a', email: 'a@example.test', display_name: 'A Student' },
  { id: 'b', email: 'b@example.test', display_name: 'B Student' },
  { id: 'c', email: 'c@example.test', display_name: 'C Student' },
];
const allowed = students.map((student) => ({ email: student.email, display_name: student.display_name }))
  .concat([{ email: 'invited@example.test', display_name: 'Invited Student' }]);
const progress = [
  { student_id: 'a', topic_id: 'derivative-chain-rule', status: 'shaky' as const },
  { student_id: 'b', topic_id: 'derivative-chain-rule', status: 'steady' as const },
];

function session(id: string, student_id: string, started_at: string, changes: Partial<DashboardSession> = {}): DashboardSession {
  return {
    id, student_id, started_at, ended_at: '2026-09-15T11:20:00.000Z',
    topic_id: 'derivative-chain-rule', outcome: 'shaky',
    asked_for_answers: false, ...changes,
  };
}

const sessions = [
  session('1', 'a', '2026-09-15T11:00:00.000Z', { asked_for_answers: true }),
  session('2', 'a', '2026-09-15T11:10:00.000Z'),
  session('3', 'b', '2026-09-14T11:00:00.000Z', { ended_at: '2026-09-14T11:40:00.000Z', outcome: null }),
  session('4', 'b', '2026-09-09T12:00:00.000Z', { ended_at: '2026-09-09T12:10:00.000Z' }),
  session('5', 'revoked', '2026-09-15T11:00:00.000Z'),
];

const result = buildDashboard(allowed, students, progress, sessions, now);
check('rolling window starts exactly seven days earlier', result.windowStart === '2026-09-09T12:00:00.000Z');
check('weekly totals include the start boundary and exclude revoked students', result.sessionsThisWeek === 4);
check('active students are distinct, not session count', result.activeStudents === 2);
check('an unassessed session is not called a difficulty', result.difficulty[0]?.students === 2);
check('repeated shaky sessions count each student once per topic', result.difficulty.length === 1);
check('median includes completed sessions and uses their durations', result.medianSessionMinutes === 15);
check('roster includes students who have not practiced', result.students.find((s) => s.id === 'c')?.sessions === 0);
check('roster includes invited students without an Auth identity',
  result.students.find((s) => s.email === 'invited@example.test')?.hasSignedIn === false);
check('the drawer data uses status without progress notes', result.students.find((s) => s.id === 'a')?.shakyTopics.length === 1);
check('answer seeking counts sessions, not turns', result.students.find((s) => s.id === 'a')?.answerSeekingSessions === 1);
const selections: string[] = [];
const client = {
  from(table: string) {
    return {
      select(columns: string) {
        selections.push(`${table}:${columns}`);
        return {
          order() { return this; },
          async range() { return { data: [], error: null }; },
        };
      },
    };
  },
};

void loadDashboardRows(client as never).then(() => {
  check('dashboard queries only the four authorized roster and signal tables',
    selections.length === 4 && selections.every((selection) => /^(allowed_students|students|progress|sessions):/.test(selection)));
  check('queries exclude transcripts, summaries and private notes',
    selections.every((selection) => !/messages|content|summary|sticking_point|note|self_critical/.test(selection)));
  const failingClient = {
    from() {
      return {
        select() {
          return {
            order() { return this; },
            async range() { return { data: null, error: { message: 'database unavailable' } }; },
          };
        },
      };
    },
  };
  return loadDashboardRows(failingClient as never).then(
    () => check('read errors cannot produce partial dashboard totals', false),
    () => check('read errors cannot produce partial dashboard totals', true),
  );
}).then(() => {
  if (failures) process.exit(1);
}).catch((error) => { console.error(error); process.exit(1); });
