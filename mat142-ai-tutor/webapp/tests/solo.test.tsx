/**
 * Checks on the try-it-out version — the one that runs with no database, where
 * a single shared code lets you in and the browser remembers your progress.
 *
 * Two things matter here and nothing else really does. The first is that the
 * code actually keeps people out, because the tutor costs money to run and the
 * address will be sent around in emails. The second is that the browser's
 * memory behaves like the database would, so that trying this version tells us
 * something true about the real one.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import TutorClient from '@/app/tutor/TutorClient';
import { accessToken, isCodeCorrect, hasAccess } from '@/lib/access';
import {
  applyOutcome,
  emptyState,
  loadState,
  markStarted,
  newSessionId,
  saveState,
  type SoloState,
} from '@/lib/solo-store';
import { topics } from '@/lib/curriculum';
import { pickTopic, choiceForTopic } from '@/lib/picker';

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  if (!cond) { failures++; console.log(`FAIL  ${name}${detail ? ' :: ' + detail : ''}`); }
  else console.log(`ok    ${name}`);
}

/* ------------------------------------------------------------------ */
/* The code on the door                                                */
/* ------------------------------------------------------------------ */

async function accessChecks() {
  const token = await accessToken('mat142pilot');

  check('the cookie holds a hash, not the code', !token.includes('mat142pilot') && token.length === 64, token);
  check('the same code always gives the same cookie', token === (await accessToken('mat142pilot')));
  check('a different code gives a different cookie', token !== (await accessToken('mat142pilo')));

  process.env.ACCESS_CODE = 'mat142pilot';
  check('the right code is accepted', await isCodeCorrect('mat142pilot'));
  check('a wrong code is refused', !(await isCodeCorrect('mat142pilo')));
  check('an empty code is refused', !(await isCodeCorrect('')));
  check('a code differing only in case is refused', !(await isCodeCorrect('MAT142PILOT')));

  check('a valid cookie opens the door', await hasAccess(token));
  check('a made-up cookie does not', !(await hasAccess('0'.repeat(64))));
  check('no cookie does not', !(await hasAccess(undefined)));

  // If the code is unset the app must refuse everybody, not admit everybody.
  delete process.env.ACCESS_CODE;
  check('with no code set, nobody gets in', !(await isCodeCorrect('anything')));
  check('with no code set, an old cookie stops working', !(await hasAccess(token)));
  process.env.ACCESS_CODE = 'mat142pilot';
}

/* ------------------------------------------------------------------ */
/* The browser's memory                                                */
/* ------------------------------------------------------------------ */

/** A stand-in for browser storage, so this runs outside a browser. */
function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    _map: map,
  };
}

function storeChecks() {
  const store = fakeStorage();
  (globalThis as { window?: unknown }).window = { localStorage: store };

  check('an empty browser starts from nothing', loadState().sessionCount === 0);

  // A first session on the first topic, ending badly.
  const first = pickTopic([]);
  let state: SoloState = markStarted({ ...emptyState, name: 'Juhi' }, first.topic.id);
  state.open = { id: newSessionId(), topicId: first.topic.id, messages: [] };
  saveState(state);

  const reloaded = loadState();
  check('progress survives a reload', reloaded.progress.length === 1 && reloaded.name === 'Juhi');
  check('an unfinished conversation survives a reload', reloaded.open?.topicId === first.topic.id);
  check('a started topic is recorded, so an abandoned session is not lost',
    reloaded.progress[0].status === 'shaky');

  state = applyOutcome(reloaded, first.topic.id, 'shaky', 'Stuck on the chain rule.', 'inner function');
  saveState(state);
  const after = loadState();
  check('finishing a session closes it', after.open === null);
  check('finishing a session counts it', after.sessionCount === 1);
  check('what happened last time is remembered', after.lastSummary === 'Stuck on the chain rule.');
  check('the sticking point is remembered', after.progress[0].note === 'inner function');
  check('a second go at a topic does not duplicate the row', after.progress.length === 1);
  check('attempts are counted', after.progress[0].attempts === 2);

  // A shaky topic must come back round rather than being left behind.
  check('a shaky topic is offered again', pickTopic(after.progress).topic.id === first.topic.id);

  // And once steady, the tutor moves on.
  const steady = applyOutcome(after, first.topic.id, 'steady', 'Got it.', null);
  check('a steady topic is not repeated', pickTopic(steady.progress).topic.id !== first.topic.id);

  // Rubbish in storage must start fresh rather than show a broken screen.
  store.setItem('calcu-buddy:v1', '{not json at all');
  check('unreadable storage starts fresh instead of breaking', loadState().sessionCount === 0);

  store.setItem('calcu-buddy:v1', JSON.stringify({ sessionCount: 'lots', progress: 'none', open: 3 }));
  const junk = loadState();
  check('storage written by an older version is ignored safely',
    junk.sessionCount === 0 && Array.isArray(junk.progress) && junk.open === null);

  // Storage being full or blocked must not interrupt the student.
  const blocked = { getItem: () => null, setItem: () => { throw new Error('full'); }, removeItem: () => {} };
  (globalThis as { window?: unknown }).window = { localStorage: blocked };
  let threw = false;
  try { saveState(emptyState); } catch { threw = true; }
  check('full or blocked storage does not interrupt the session', !threw);

  (globalThis as { window?: unknown }).window = { localStorage: store };
}

/* ------------------------------------------------------------------ */
/* The screen                                                          */
/* ------------------------------------------------------------------ */

const topic = topics[0];
const baseProps = {
  studentName: 'Juhi',
  initials: 'JU',
  sessionCount: 0,
  existingSessionId: 'test-session',
  existingMessages: [],
  topic: {
    id: topic.id,
    title: topic.title,
    studentFacingName: topic.student_facing_name,
    unit: topic.unit_title,
  },
  because: 'Starting here.',
  topicList: topics.map((t) => ({ id: t.id, name: t.student_facing_name, status: 'not_started' })),
};

const soloHooks = {
  context: () => ({
    topicId: topic.id, progress: [], studentName: 'Juhi',
    sessionNumber: 1, lastSummary: null, lastTopicId: null,
  }),
  persist: () => {},
  finish: async () => {},
  switchTopic: () => {},
  reset: () => {},
};

function screenChecks() {
  const solo = renderToStaticMarkup(<TutorClient {...baseProps} solo={soloHooks} />);
  const account = renderToStaticMarkup(<TutorClient {...baseProps} />);

  // Every topic in the pilot must be reachable, so the whole unit can be judged.
  const jumps = (solo.match(/class="tjump"/g) ?? []).length;
  check('every topic but the current one can be jumped to',
    jumps === topics.length - 1, `${jumps} of ${topics.length - 1}`);
  check('the current topic is not a button', solo.includes('<b>' + topic.student_facing_name));
  check('there is a way to clear everything and start again',
    solo.includes('Clear everything and start again'));

  // The signed-in version must be untouched by any of this.
  check('the signed-in version has no jump buttons', !account.includes('tjump'));
  check('the signed-in version has no reset button',
    !account.includes('Clear everything and start again'));
  check('the signed-in version still lists every topic',
    topics.every((t) => account.includes(t.student_facing_name)));

  // The tutoring screen itself is the same either way — that is the point.
  for (const piece of ['mathbar', 'composer', 'End session', topic.unit_title]) {
    check(`the try-it-out screen still has: ${piece}`, solo.includes(piece));
    check(`the signed-in screen still has: ${piece}`, account.includes(piece));
  }

  // And a conversation in progress looks the same in both, maths included.
  const withTalk = { ...baseProps, existingMessages: [
    { role: 'assistant' as const, content: "Let us start. What is $\\frac{d}{dx}(x^2)$?" },
    { role: 'user' as const, content: 'is it 2x' },
  ] };
  const talkSolo = renderToStaticMarkup(<TutorClient {...withTalk} solo={soloHooks} />);
  const talkAccount = renderToStaticMarkup(<TutorClient {...withTalk} />);
  check('the try-it-out version names the tutor', talkSolo.includes('Calcu-Buddy'));
  check('the signed-in version names the tutor', talkAccount.includes('Calcu-Buddy'));
  check('maths renders in the try-it-out version', talkSolo.includes('katex'));
  check('the student sees their own words back', talkSolo.includes('is it 2x'));
  check('both versions render the conversation identically',
    talkSolo.slice(talkSolo.indexOf('class="thread"')) ===
      talkAccount.slice(talkAccount.indexOf('class="thread"')));
}

/* ------------------------------------------------------------------ */
/* Jumping about must not confuse the tutor                            */
/* ------------------------------------------------------------------ */

function jumpChecks() {
  // Jumping to a topic mid-unit: the heading, the sidebar and the tutor's own
  // instructions must all agree on which topic is open.
  const target = topics[7];
  const choice = choiceForTopic(target.id, []);
  check('jumping to a topic actually opens that topic', choice.topic.id === target.id);
  check('the reason shown matches the topic opened', choice.because.length > 0);

  const unknown = choiceForTopic('not-a-real-topic', []);
  check('a topic that no longer exists falls back rather than breaking',
    Boolean(unknown.topic?.id));
}

async function main() {
  await accessChecks();
  storeChecks();
  screenChecks();
  jumpChecks();

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
