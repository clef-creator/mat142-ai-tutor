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
