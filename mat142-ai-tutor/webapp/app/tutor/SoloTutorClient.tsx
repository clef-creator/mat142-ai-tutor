'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import TutorClient from './TutorClient';
import { pickTopic, choiceForTopic } from '@/lib/picker';
import { topics, getTopic } from '@/lib/curriculum';
import {
  applyOutcome,
  clearState,
  emptyState,
  loadState,
  markStarted,
  newSessionId,
  saveState,
  type SoloState,
} from '@/lib/solo-store';
import type { ChatMessage } from '@/lib/types';

/**
 * Solo mode's half of the tutor screen.
 *
 * The full version works this out on the server, where the database is. Here
 * there is no database, so the same decisions — which topic, what to tell the
 * tutor about last time — are made in the browser from what is in local
 * storage. The chat itself is the identical component either way; only where
 * the memory lives differs.
 */
export default function SoloTutorClient({ initialName }: { initialName: string | null }) {
  const [state, setState] = useState<SoloState | null>(null);
  const stateRef = useRef<SoloState | null>(null);

  // Local storage is not available while rendering on the server, so the real
  // state arrives on the first paint in the browser.
  useEffect(() => {
    const loaded = loadState();
    const withName = loaded.name ?? initialName ?? null;

    let next: SoloState = { ...loaded, name: withName };

    if (!next.open) {
      const choice = pickTopic(next.progress);
      next = markStarted(next, choice.topic.id);
      next.open = { id: newSessionId(), topicId: choice.topic.id, messages: [] };
    }

    stateRef.current = next;
    setState(next);
    saveState(next);
    // Runs once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update(next: SoloState) {
    stateRef.current = next;
    setState(next);
    saveState(next);
  }

  const choice = useMemo(() => {
    if (!state?.open) return null;
    return choiceForTopic(state.open.topicId, state.progress);
  }, [state]);

  if (!state || !state.open || !choice) {
    return (
      <div className="shell">
        <div className="panel"><div className="panel-b">Loading&hellip;</div></div>
      </div>
    );
  }

  const open = state.open;
  const statusMap: Record<string, string> = {};
  state.progress.forEach((p) => { statusMap[p.topic_id] = p.status; });

  const name = state.name?.trim() || 'there';

  return (
    <div className="shell">
      <TutorClient
        studentName={name}
        initials={(state.name?.trim() || 'You').slice(0, 2).toUpperCase()}
        sessionCount={state.sessionCount}
        existingSessionId={open.id}
        existingMessages={open.messages}
        topic={{
          id: choice.topic.id,
          title: choice.topic.title,
          studentFacingName: choice.topic.student_facing_name,
          unit: choice.topic.unit_title,
        }}
        because={choice.because}
        topicList={topics.map((t) => ({
          id: t.id,
          name: t.student_facing_name,
          status: statusMap[t.id] ?? 'not_started',
        }))}
        solo={{
          context() {
            const s = stateRef.current ?? emptyState;
            return {
              topicId: s.open?.topicId ?? choice.topic.id,
              progress: s.progress,
              studentName: s.name,
              sessionNumber: s.sessionCount + 1,
              lastSummary: s.lastSummary,
              lastTopicId: s.lastTopicId,
            };
          },

          persist(messages: ChatMessage[]) {
            const s = stateRef.current;
            if (!s?.open) return;
            update({ ...s, open: { ...s.open, messages } });
          },

          async finish(messages: ChatMessage[]) {
            const s = stateRef.current;
            if (!s?.open) return;

            const topicId = s.open.topicId;
            let outcome: 'steady' | 'shaky' = 'shaky';
            let summary = `Worked on ${getTopic(topicId)?.student_facing_name ?? topicId}.`;
            let sticking: string | null = null;

            try {
              const res = await fetch('/api/solo/end', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ history: messages, topicId }),
              });
              const data = await res.json();
              if (res.ok && data.signals) {
                outcome = data.signals.outcome === 'steady' ? 'steady' : 'shaky';
                summary = data.signals.summary ?? summary;
                sticking = data.signals.sticking_point ?? null;
              }
            } catch {
              // Keep whatever we can rather than losing the session entirely.
            }

            const ended = applyOutcome(
              { ...s, open: null },
              topicId,
              outcome,
              summary,
              sticking,
            );

            const nextChoice = pickTopic(ended.progress);
            const started = markStarted(ended, nextChoice.topic.id);
            update({
              ...started,
              open: { id: newSessionId(), topicId: nextChoice.topic.id, messages: [] },
            });

            // Reload so the new session opens cleanly, exactly as it does in the
            // full version. The state above is already written to disk.
            window.location.reload();
          },

          switchTopic(topicId: string) {
            const s = stateRef.current;
            if (!s || !getTopic(topicId)) return;
            const started = markStarted(s, topicId);
            update({
              ...started,
              open: { id: newSessionId(), topicId, messages: [] },
            });
            window.location.reload();
          },

          reset() {
            clearState();
            saveState({ ...emptyState, name: stateRef.current?.name ?? null });
            window.location.reload();
          },
        }}
      />
    </div>
  );
}
