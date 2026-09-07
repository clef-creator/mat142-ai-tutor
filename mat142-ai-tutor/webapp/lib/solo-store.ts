'use client';

import type { ChatMessage, ProgressRow, TopicStatus } from './types';

/**
 * Solo mode's memory, kept in the browser.
 *
 * This holds exactly what the database holds in the full version — what the
 * student is steady or shaky on, what happened last session, and the
 * conversation currently in progress — so that the tutor behaves identically
 * either way. When Supabase is eventually connected, this file becomes
 * unnecessary and nothing else has to change.
 *
 * Everything here is read and written defensively. Browser storage can be
 * disabled, full, or holding something written by an older version of the app,
 * and none of those should produce anything worse than starting fresh.
 */

const KEY = 'calcu-buddy:v1';

export interface OpenSession {
  id: string;
  topicId: string;
  messages: ChatMessage[];
}

export interface SoloState {
  name: string | null;
  sessionCount: number;
  progress: ProgressRow[];
  lastSummary: string | null;
  lastTopicId: string | null;
  open: OpenSession | null;
}

export const emptyState: SoloState = {
  name: null,
  sessionCount: 0,
  progress: [],
  lastSummary: null,
  lastTopicId: null,
  open: null,
};

export function loadState(): SoloState {
  if (typeof window === 'undefined') return emptyState;

  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return emptyState;

    const parsed = JSON.parse(raw) as Partial<SoloState>;

    return {
      name: typeof parsed.name === 'string' ? parsed.name : null,
      sessionCount: Number.isFinite(parsed.sessionCount) ? Number(parsed.sessionCount) : 0,
      progress: Array.isArray(parsed.progress) ? parsed.progress : [],
      lastSummary: typeof parsed.lastSummary === 'string' ? parsed.lastSummary : null,
      lastTopicId: typeof parsed.lastTopicId === 'string' ? parsed.lastTopicId : null,
      open:
        parsed.open && typeof parsed.open.id === 'string' && typeof parsed.open.topicId === 'string'
          ? {
              id: parsed.open.id,
              topicId: parsed.open.topicId,
              messages: Array.isArray(parsed.open.messages) ? parsed.open.messages : [],
            }
          : null,
    };
  } catch {
    // Corrupt or unreadable. Starting fresh is better than a blank screen.
    return emptyState;
  }
}

export function saveState(state: SoloState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked. The session still works; it just will not be
    // remembered, which is better than interrupting the student to say so.
  }
}

export function clearState(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing useful to do */
  }
}

/** Records the outcome of a finished session against its topic. */
export function applyOutcome(
  state: SoloState,
  topicId: string,
  outcome: TopicStatus,
  summary: string,
  stickingPoint: string | null,
): SoloState {
  const now = new Date().toISOString();
  const existing = state.progress.find((p) => p.topic_id === topicId);

  const progress: ProgressRow[] = [
    ...state.progress.filter((p) => p.topic_id !== topicId),
    {
      student_id: 'local',
      topic_id: topicId,
      status: outcome,
      attempts: (existing?.attempts ?? 0) + 1,
      last_worked_at: now,
      note: stickingPoint,
    } as ProgressRow,
  ];

  return {
    ...state,
    progress,
    lastSummary: summary,
    lastTopicId: topicId,
    sessionCount: state.sessionCount + 1,
    open: null,
  };
}

/** Marks a topic as being worked on, so an abandoned session is not forgotten. */
export function markStarted(state: SoloState, topicId: string): SoloState {
  if (state.progress.some((p) => p.topic_id === topicId)) return state;

  return {
    ...state,
    progress: [
      ...state.progress,
      {
        student_id: 'local',
        topic_id: topicId,
        status: 'shaky',
        attempts: 1,
        last_worked_at: new Date().toISOString(),
        note: null,
      } as ProgressRow,
    ],
  };
}

export function newSessionId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
