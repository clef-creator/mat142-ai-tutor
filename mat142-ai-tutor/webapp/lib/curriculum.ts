import raw from '@/data/curriculum.json';
import type { Curriculum, Topic } from './types';

export const curriculum = raw as unknown as Curriculum;

/** Topics in the order the course teaches them. */
export const topics: Topic[] = [...curriculum.topics].sort((a, b) => a.order - b.order);

const byId = new Map(topics.map((t) => [t.id, t]));

export function getTopic(id: string): Topic | undefined {
  return byId.get(id);
}

export function topicName(id: string): string {
  return byId.get(id)?.student_facing_name ?? byId.get(id)?.title ?? id;
}

/** The units of the course, in teaching order. */
export const units: string[] = [...new Set(topics.map((t) => t.unit_title))];

/** Every topic in one unit, in the order the course teaches them. */
export function topicsInUnit(unitTitle: string): Topic[] {
  return topics.filter((t) => t.unit_title === unitTitle);
}

/** Which unit a topic sits in, counting from 1, for "Part 3 of 5". */
export function unitPosition(topicId: string): { index: number; total: number; title: string } {
  const unit = getTopic(topicId)?.unit_title ?? units[0];
  return { index: units.indexOf(unit) + 1, total: units.length, title: unit };
}

/**
 * The topics a student should be shown, given what they have reached.
 *
 * The whole course is fifty-eight topics. Putting that in front of someone in
 * the bottom fifth of the cohort is not information, it is a wall — so the list
 * opens one topic at a time. A student sees the unit they are in, up to and
 * including the furthest topic they have reached, and nothing beyond it.
 *
 * Two consequences worth stating plainly. Going back is always allowed: every
 * topic already reached stays on the list and stays clickable. Going forward is
 * not, so the list can never show a topic the course has not brought them to.
 *
 * The first topic of a unit is always visible, otherwise a student arriving in
 * a new unit would be looking at an empty list.
 */
export function visibleTopics(
  reachedIds: Iterable<string>,
  currentTopicId?: string | null,
): Topic[] {
  const current = (currentTopicId && getTopic(currentTopicId)) || topics[0];
  const inUnit = topicsInUnit(current.unit_title);

  const reached = new Set<string>(reachedIds);
  reached.add(current.id);

  let last = 0; // the unit's first topic is always visible
  inUnit.forEach((t, i) => {
    if (reached.has(t.id) && i > last) last = i;
  });

  return inUnit.slice(0, last + 1);
}

/**
 * Plain-English names for the skills the course assumes students arrive with.
 *
 * These are not topics. There are no slides for them, so the tutor cannot run a
 * session on one — but it is told it may drop back into any of them mid-session,
 * which for this cohort is very often the actual lesson.
 */
const PRECALCULUS_NAMES: Record<string, string> = {
  'pc-exponent-radical-rules': 'the rules for powers and roots',
  'pc-factoring': 'factoring',
  'pc-function-notation': 'reading and using function notation such as $f(x)$',
  'pc-order-of-operations': 'order of operations',
  'pc-rational-expressions': 'simplifying algebraic fractions',
  'pc-sign-rules': 'handling signs, especially a minus sign in front of a bracket',
  'pc-slope-coordinate-geometry': 'slope, straight lines and coordinates',
  'pc-solving-equations': 'solving equations, including quadratics',
};

/**
 * Derived from the curriculum rather than hand-maintained, because a list kept
 * by hand goes stale the moment the course widens. Every id a topic declares as
 * out of scope appears here exactly once, in a stable order.
 */
export const outOfScopePrerequisites: Record<string, string> = Object.fromEntries(
  [...new Set(topics.flatMap((t) => t.prereq_outside_scope))]
    .sort()
    .map((id) => [id, PRECALCULUS_NAMES[id] ?? id.replace(/^pc-/, '').replace(/-/g, ' ')]),
);
