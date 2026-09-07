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
 * Prerequisites that sit outside the piloted decks — algebra and earlier
 * calculus the course assumes students already have. The tutor is allowed to
 * drop back to these mid-session, which for this cohort is often the whole
 * point, but it cannot run a full session on one because we have no slide
 * material for them in scope.
 */
export const outOfScopePrerequisites: Record<string, string> = {
  'function-composition': 'writing one function inside another, such as f(g(x))',
  'limit-concept-and-motivation': 'what a limit means',
  'slope-and-average-rate-of-change': 'slope between two points, and average rate of change',
  'pc-exponent-radical-rules': 'the rules for powers and roots',
  'pc-rational-expressions': 'simplifying algebraic fractions',
  'pc-factoring': 'factoring',
};
