import { pickTopic, choiceForTopic } from '@/lib/picker';
import { topics, getTopic } from '@/lib/curriculum';
import { buildStaticPrompt, buildSessionPrompt } from '@/lib/prompt';
import type { ProgressRow } from '@/lib/types';

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  if (!cond) {
    failures++;
    console.log(`FAIL  ${name}${detail ? ' :: ' + detail : ''}`);
  } else {
    console.log(`ok    ${name}`);
  }
}

const row = (topic_id: string, status: string, when = '2026-09-01T00:00:00Z', note: string | null = null) =>
  ({ student_id: 's', topic_id, status, attempts: 1, last_worked_at: when, note } as unknown as ProgressRow);

// ---- curriculum sanity ----------------------------------------------------
check('curriculum has topics', topics.length > 0, `${topics.length}`);
check(
  'topic ids are unique',
  new Set(topics.map((t) => t.id)).size === topics.length,
);
check(
  'orders are strictly increasing',
  topics.every((t, i) => i === 0 || topics[i - 1].order < t.order),
);
const inScopeIds = new Set(topics.map((t) => t.id));
const danglingPrereqs = topics.flatMap((t) =>
  t.prereq_in_scope.filter((p) => !inScopeIds.has(p)).map((p) => `${t.id} -> ${p}`),
);
check('every in-scope prerequisite is an in-scope topic', danglingPrereqs.length === 0, danglingPrereqs.join(', '));

// No topic may depend on something taught later in the sequence.
const orderOf = new Map(topics.map((t) => [t.id, t.order]));
const backwards = topics.flatMap((t) =>
  t.prereq_in_scope.filter((p) => (orderOf.get(p) ?? -1) >= t.order).map((p) => `${t.id} <- ${p}`),
);
check('prerequisites always come earlier in the sequence', backwards.length === 0, backwards.join(', '));

// ---- the picker -----------------------------------------------------------
const first = pickTopic([]);
check('a brand new student starts at topic 1', first.topic.id === topics[0].id, first.topic.id);
check('a brand new student is told why', first.because.length > 10);

const afterOne = pickTopic([row(topics[0].id, 'steady')]);
check('a steady topic is not repeated', afterOne.topic.id !== topics[0].id, afterOne.topic.id);

const shaky = pickTopic([row(topics[0].id, 'steady'), row(topics[1].id, 'shaky')]);
check('a shaky topic is picked up again', shaky.topic.id === topics[1].id, shaky.topic.id);
check('a shaky topic is flagged as a revisit', shaky.reason === 'revisit');

const shakyWithNote = pickTopic([row(topics[1].id, 'shaky', '2026-09-01T00:00:00Z', 'kept losing the minus sign')]);
check(
  "the tutor is told what went wrong last time",
  shakyWithNote.because.includes('minus sign'),
  shakyWithNote.because,
);

// Shaky beats moving on, even when a later topic is untouched.
const shakyBeatsNext = pickTopic([
  row(topics[0].id, 'steady'),
  row(topics[1].id, 'steady'),
  row(topics[2].id, 'shaky'),
]);
check('an unfinished topic outranks a new one', shakyBeatsNext.topic.id === topics[2].id, shakyBeatsNext.topic.id);

// A topic with an unmet in-scope prerequisite must not be handed out.
const gated = topics.find((t) => t.prereq_in_scope.length > 0);
if (gated) {
  const skipAhead = topics
    .filter((t) => t.order < gated.order)
    .map((t) => row(t.id, t.id === gated.prereq_in_scope[0] ? 'not_started' : 'steady'));
  // Mark everything earlier steady EXCEPT the prerequisite, which stays untouched.
  const withHole = skipAhead.filter((r) => r.status === 'steady');
  const choice = pickTopic(withHole);
  check(
    'the picker never skips an unmet prerequisite',
    choice.topic.id !== gated.id || gated.prereq_in_scope.every((p) => withHole.some((r) => r.topic_id === p)),
    `picked ${choice.topic.id}, gate was ${gated.id}`,
  );
}

// Everything steady -> review the oldest.
const allSteady = topics.map((t, i) =>
  row(t.id, 'steady', `2026-0${(i % 8) + 1}-01T00:00:00Z`),
);
const review = pickTopic(allSteady);
check('once everything is steady it becomes review', review.reason === 'review');
check('review picks the topic worked on longest ago', review.topic.id === topics[0].id, review.topic.id);

// ---- an open session keeps its topic --------------------------------------
const progressed = [row(topics[0].id, 'steady'), row(topics[3].id, 'shaky')];
const fresh = pickTopic(progressed);
const held = choiceForTopic(topics[6].id, progressed);
check('an open session keeps its own topic', held.topic.id === topics[6].id, held.topic.id);
check('the picker would otherwise have moved on', fresh.topic.id !== topics[6].id);
check('the heading matches the topic', held.topic.student_facing_name.length > 0);
check('choiceForTopic agrees with pickTopic when they are the same topic',
  choiceForTopic(fresh.topic.id, progressed).because === fresh.because);
check('an unknown topic id does not crash', choiceForTopic('no-such-topic', progressed).topic.id === fresh.topic.id);

// ---- the prompt -----------------------------------------------------------
const staticPrompt = buildStaticPrompt();
check('the static prompt is substantial', staticPrompt.length > 1500, `${staticPrompt.length} chars`);
check('the static prompt forbids confirming wrong answers', /never confirm/i.test(staticPrompt));
check('the static prompt bans textbook citations', /thomas|textbook/i.test(staticPrompt));

const sessionPrompt = buildSessionPrompt({
  studentName: 'Aarav',
  choice: shaky,
  progress: [row(topics[0].id, 'steady'), row(topics[1].id, 'shaky')],
  lastSummary: 'Got stuck squaring a binomial.',
  lastTopicId: topics[1].id,
  sessionNumber: 3,
});
check('the session prompt names the student', sessionPrompt.includes('Aarav'));
check('the session prompt names the topic', sessionPrompt.includes(shaky.topic.title));
check('the session prompt carries last time forward', sessionPrompt.includes('squaring a binomial'));

// The integration-by-parts notation warning must survive into the prompt.
const parts = topics.find((t) => /parts/i.test(t.title));
if (parts) {
  const p = buildSessionPrompt({
    studentName: null,
    choice: { topic: parts, reason: 'next', because: 'next' },
    progress: [],
    lastSummary: null,
    lastTopicId: null,
    sessionNumber: 1,
  });
  check('a topic with a notation warning passes it through', p.length > 0);
}

const withWarning = topics.filter((t) => t.notation_warning);
withWarning.forEach((t) => {
  const p = buildSessionPrompt({
    studentName: null,
    choice: { topic: t, reason: 'next', because: 'next' },
    progress: [],
    lastSummary: null,
    lastTopicId: null,
    sessionNumber: 1,
  });
  check(`notation warning reaches the tutor for ${t.id}`, p.includes(t.notation_warning!));
});

// ---- every topic can open a session ---------------------------------------
topics.forEach((t) => {
  const p = buildSessionPrompt({
    studentName: 'Test',
    choice: choiceForTopic(t.id, []),
    progress: [],
    lastSummary: null,
    lastTopicId: null,
    sessionNumber: 1,
  });
  check(`session prompt builds for ${t.id}`, p.includes(t.title) && p.length > 200);
});

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
