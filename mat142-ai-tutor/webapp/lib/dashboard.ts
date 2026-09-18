import { topicName } from './curriculum';

export interface DashboardStudent {
  id: string;
  email: string;
  display_name: string | null;
}

export interface DashboardAllowedStudent {
  email: string;
  display_name: string | null;
}

export interface DashboardProgress {
  student_id: string;
  topic_id: string;
  status: 'not_started' | 'shaky' | 'steady';
  attempts: number;
}

export type DashboardFlag = 'Quiet' | 'Stuck' | 'Short' | 'Answers';

// Short and Answers are pilot calibration settings; revisit after the first week.
export const FLAG_THRESHOLDS = {
  quietDays: 7,
  stuckAttempts: 3,
  shortMinutes: 3,
  shortSessions: 3,
  answerSeekingSessions: 3,
} as const;

export interface DashboardSession {
  id: string;
  student_id: string;
  topic_id: string;
  started_at: string;
  ended_at: string | null;
  outcome: 'not_started' | 'shaky' | 'steady' | null;
  asked_for_answers: boolean;
}

export interface StudentSignal {
  id: string;
  name: string;
  email: string;
  hasSignedIn: boolean;
  lastPractice: string | null;
  sessions: number;
  sessionsThisWeek: number;
  steadyTopics: number;
  shakyTopics: string[];
  answerSeekingSessions: number;
  shortSessions: number;
  stuckTopics: string[];
  flags: DashboardFlag[];
  medianSessionMinutes: number | null;
}

export interface DashboardData {
  windowStart: string;
  windowEnd: string;
  activeStudents: number;
  sessionsThisWeek: number;
  medianSessionMinutes: number | null;
  topicsAttempted: number;
  difficulty: { topicId: string; topic: string; students: number }[];
  students: StudentSignal[];
}

const WEEK_MS = FLAG_THRESHOLDS.quietDays * 24 * 60 * 60 * 1000;

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return Math.round(sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2);
}

function durationMinutes(session: DashboardSession): number | null {
  if (!session.ended_at) return null;
  const duration = Date.parse(session.ended_at) - Date.parse(session.started_at);
  return Number.isFinite(duration) && duration >= 0 ? duration / 60_000 : null;
}

/** A rolling seven-day UTC window, inclusive of its start and exclusive of now. */
export function buildDashboard(
  allowedStudents: DashboardAllowedStudent[],
  students: DashboardStudent[],
  progress: DashboardProgress[],
  sessions: DashboardSession[],
  now = new Date(),
): DashboardData {
  const end = now.getTime();
  const start = end - WEEK_MS;
  const inWeek = (date: string) => {
    const value = Date.parse(date);
    return Number.isFinite(value) && value >= start && value < end;
  };
  const provisionedByEmail = new Map(students.map((student) => [student.email.toLowerCase(), student]));
  const cohortIds = new Set(allowedStudents.map((allowed) =>
    provisionedByEmail.get(allowed.email.toLowerCase())?.id).filter((id): id is string => Boolean(id)));
  const cohortSessions = sessions.filter((session) => cohortIds.has(session.student_id));
  const weeklySessions = cohortSessions.filter((session) => inWeek(session.started_at));
  const sessionsByStudent = new Map<string, DashboardSession[]>();
  const weeklyByStudent = new Map<string, DashboardSession[]>();
  const progressByStudent = new Map<string, DashboardProgress[]>();
  for (const session of cohortSessions) {
    const list = sessionsByStudent.get(session.student_id) ?? [];
    list.push(session);
    sessionsByStudent.set(session.student_id, list);
  }
  for (const session of weeklySessions) {
    const list = weeklyByStudent.get(session.student_id) ?? [];
    list.push(session);
    weeklyByStudent.set(session.student_id, list);
  }
  for (const row of progress) {
    const list = progressByStudent.get(row.student_id) ?? [];
    list.push(row);
    progressByStudent.set(row.student_id, list);
  }

  const studentSignals = allowedStudents.map((allowed) => {
    const student = provisionedByEmail.get(allowed.email.toLowerCase());
    const id = student?.id ?? `invited:${allowed.email}`;
    const all = sessionsByStudent.get(id) ?? [];
    const weekly = weeklyByStudent.get(id) ?? [];
    const rows = progressByStudent.get(id) ?? [];
    const answerSeekingSessions = weekly.filter((session) => session.ended_at && session.asked_for_answers).length;
    const shortSessions = weekly.filter((session) => {
      const minutes = durationMinutes(session);
      return minutes !== null && minutes < FLAG_THRESHOLDS.shortMinutes;
    }).length;
    const stuckTopics = rows.filter((row) =>
      row.status === 'shaky' && row.attempts >= FLAG_THRESHOLDS.stuckAttempts)
      .map((row) => topicName(row.topic_id));
    const flags: DashboardFlag[] = [];
    if (student && !weekly.length) flags.push('Quiet');
    if (stuckTopics.length) flags.push('Stuck');
    if (shortSessions >= FLAG_THRESHOLDS.shortSessions) flags.push('Short');
    if (answerSeekingSessions >= FLAG_THRESHOLDS.answerSeekingSessions) flags.push('Answers');
    return {
      id,
      name: student?.display_name?.trim() || allowed.display_name?.trim() || allowed.email,
      email: allowed.email,
      hasSignedIn: Boolean(student),
      lastPractice: all.reduce<string | null>((latest, session) =>
        !latest || session.started_at > latest ? session.started_at : latest, null),
      sessions: all.length,
      sessionsThisWeek: weekly.length,
      steadyTopics: rows.filter((row) => row.status === 'steady').length,
      shakyTopics: rows.filter((row) => row.status === 'shaky').map((row) => topicName(row.topic_id)),
      answerSeekingSessions,
      shortSessions,
      stuckTopics,
      flags,
      medianSessionMinutes: median(all.map(durationMinutes).filter((n): n is number => n !== null)),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const difficulty = new Map<string, Set<string>>();
  for (const session of weeklySessions) {
    if (session.outcome !== 'shaky') continue;
    const studentsForTopic = difficulty.get(session.topic_id) ?? new Set<string>();
    studentsForTopic.add(session.student_id);
    difficulty.set(session.topic_id, studentsForTopic);
  }

  return {
    windowStart: new Date(start).toISOString(),
    windowEnd: now.toISOString(),
    activeStudents: new Set(weeklySessions.map((session) => session.student_id)).size,
    sessionsThisWeek: weeklySessions.length,
    medianSessionMinutes: median(weeklySessions.map(durationMinutes).filter((n): n is number => n !== null)),
    topicsAttempted: new Set(weeklySessions.map((session) => session.topic_id)).size,
    difficulty: [...difficulty].map(([topicId, studentIds]) => ({
      topicId, topic: topicName(topicId), students: studentIds.size,
    })).sort((a, b) => b.students - a.students || a.topic.localeCompare(b.topic)),
    students: studentSignals,
  };
}
