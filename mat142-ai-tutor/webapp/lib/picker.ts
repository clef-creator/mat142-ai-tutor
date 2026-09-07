import { topics, getTopic } from './curriculum';
import type { ProgressRow, Topic } from './types';

export interface Choice {
  topic: Topic;
  reason: 'revisit' | 'next' | 'review' | 'restart';
  /** Plain-language explanation, shown to the student and given to the tutor. */
  because: string;
}

/**
 * Decides what a session opens with.
 *
 * The whole design rests on this: students in this cohort freeze when handed a
 * blank box, so a session never begins by asking what they would like to do.
 * It begins with a specific topic and a reason for it.
 *
 * Order of preference:
 *   1. A topic they were shaky on last time — going forward on a weak
 *      foundation is how students end up lost three topics later.
 *   2. The earliest topic they have not started, provided its prerequisites
 *      inside the pilot scope are steady.
 *   3. If prerequisites are not met, the unmet prerequisite instead.
 *   4. If everything is steady, the oldest steady topic, for review.
 */
export function pickTopic(progress: ProgressRow[]): Choice {
  const byTopic = new Map(progress.map((p) => [p.topic_id, p]));

  const statusOf = (id: string) => byTopic.get(id)?.status ?? 'not_started';

  // 1. Anything shaky, earliest first.
  const shaky = topics.find((t) => statusOf(t.id) === 'shaky');
  if (shaky) {
    const row = byTopic.get(shaky.id);
    return {
      topic: shaky,
      reason: 'revisit',
      because: row?.note
        ? `Last time this one was not quite settled — ${row.note}`
        : 'This one was not quite settled last time, so we will finish it before moving on.',
    };
  }

  // 2 & 3. First unstarted topic whose in-scope prerequisites are steady.
  for (const t of topics) {
    if (statusOf(t.id) !== 'not_started') continue;

    const unmet = t.prereq_in_scope.filter((p) => statusOf(p) !== 'steady');
    if (unmet.length === 0) {
      return {
        topic: t,
        reason: 'next',
        because: 'This is the next topic in the course sequence.',
      };
    }

    // Fall back to the earliest unmet prerequisite instead of pushing ahead.
    const fallback = getTopic(unmet[0]);
    if (fallback) {
      return {
        topic: fallback,
        reason: 'restart',
        because: `Before ${t.student_facing_name.toLowerCase()}, this one needs to be solid.`,
      };
    }
  }

  // 4. Everything steady — review the one worked on longest ago.
  const oldest = [...topics].sort((a, b) => {
    const ta = byTopic.get(a.id)?.last_worked_at ?? '';
    const tb = byTopic.get(b.id)?.last_worked_at ?? '';
    return ta.localeCompare(tb);
  })[0];

  return {
    topic: oldest,
    reason: 'review',
    because: 'You have worked through everything in this unit, so this is a review to keep it fresh.',
  };
}

/**
 * The choice for a session that is already under way.
 *
 * A session's topic is fixed when it is created. If the student comes back
 * later, `pickTopic` might well suggest something else by then, but the open
 * session must stay on the topic it started on — otherwise the sidebar, the
 * heading and the tutor's own instructions would each be talking about a
 * different piece of the course.
 */
export function choiceForTopic(topicId: string, progress: ProgressRow[]): Choice {
  const fresh = pickTopic(progress);
  if (fresh.topic.id === topicId) return fresh;

  const topic = getTopic(topicId);
  if (!topic) return fresh;

  const row = progress.find((p) => p.topic_id === topicId);

  if (row?.status === 'shaky') {
    return {
      topic,
      reason: 'revisit',
      because: row.note
        ? `Carrying on with this one \u2014 ${row.note}`
        : 'Carrying on with the topic this session started on.',
    };
  }

  return {
    topic,
    reason: row?.status === 'steady' ? 'review' : 'next',
    because: 'Carrying on with the topic this session started on.',
  };
}
