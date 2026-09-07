'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import MathText from '@/components/MathText';
import type { ChatMessage } from '@/lib/types';

interface TopicSummary {
  id: string;
  title: string;
  studentFacingName: string;
  unit: string;
}

interface TopicListItem {
  id: string;
  name: string;
  status: string;
}

/**
 * Supplied only in solo mode, where there is no database and the browser is
 * responsible for remembering things. In the full version this is absent and
 * the server does all of it.
 */
export interface SoloHooks {
  /** Everything the tutor needs to know about this student, right now. */
  context: () => {
    topicId: string;
    progress: unknown[];
    studentName: string | null;
    sessionNumber: number;
    lastSummary: string | null;
    lastTopicId: string | null;
  };
  persist: (messages: ChatMessage[]) => void;
  finish: (messages: ChatMessage[]) => Promise<void>;
  switchTopic: (topicId: string) => void;
  reset: () => void;
}

const MATH_BUTTONS: { label: string; insert: string; caret?: number }[] = [
  { label: 'x²', insert: '^2' },
  { label: '√', insert: '\\sqrt{}', caret: -1 },
  { label: 'a/b', insert: '\\frac{}{}', caret: -3 },
  { label: 'dy/dx', insert: '\\frac{dy}{dx}' },
  { label: 'eˣ', insert: 'e^{}', caret: -1 },
  { label: 'ln', insert: '\\ln()', caret: -1 },
];

export default function TutorClient({
  studentName,
  initials,
  sessionCount,
  existingSessionId,
  existingMessages,
  topic,
  because,
  topicList,
  solo,
}: {
  studentName: string;
  initials: string;
  sessionCount: number;
  existingSessionId: string | null;
  existingMessages: ChatMessage[];
  topic: TopicSummary;
  because: string;
  topicList: TopicListItem[];
  solo?: SoloHooks;
}) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(existingSessionId);
  const [messages, setMessages] = useState<ChatMessage[]>(existingMessages);
  const [streaming, setStreaming] = useState('');
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);

  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const openedRef = useRef(false);

  const scrollDown = useCallback(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(scrollDown, [messages, streaming, scrollDown]);

  // Kept in a ref so the streaming callback always sees the current thread,
  // rather than whatever it was when the request started.
  const messagesRef = useRef<ChatMessage[]>(existingMessages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  /** Streams one reply, appending deltas as they arrive. */
  const run = useCallback(
    async (payload: { sessionId: string; message?: string; opening?: boolean }) => {
      setBusy(true);
      setError(null);
      setStreaming('');

      try {
        // Solo mode has no database, so the conversation so far travels with
        // the request. The full version reads it from Supabase instead.
        const res = solo
          ? await fetch('/api/solo/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...solo.context(),
                history: messagesRef.current,
                message: payload.message,
                opening: payload.opening,
              }),
            })
          : await fetch('/api/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });

        if (!res.ok) {
          const info = await res.json().catch(() => ({}));
          setError(info.message ?? 'Something went wrong. Please try again.');
          setBusy(false);
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let acc = '';

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setStreaming(acc);
        }

        setMessages((prev) => {
          const next = [...prev, { role: 'assistant' as const, content: acc }];
          messagesRef.current = next;
          solo?.persist(next);
          return next;
        });
        setStreaming('');
      } catch {
        setError('Lost the connection. Your message was saved — try again.');
      } finally {
        setBusy(false);
        inputRef.current?.focus();
      }
    },
    [solo],
  );

  /** On first load, make sure a session exists and the tutor has opened it. */
  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;

    (async () => {
      let id = sessionId;

      // Solo mode creates its own session id in the browser; there is nothing
      // to ask the server for.
      if (!id && !solo) {
        const res = await fetch('/api/session/start', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) {
          setError(data.message ?? 'Could not start a session.');
          return;
        }
        id = data.sessionId as string;
        setSessionId(id);
      }

      if (messages.length === 0 && id) {
        await run({ sessionId: id, opening: true });
      }
    })();
    // Intentionally runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send() {
    const text = input.trim();
    if (!text || busy || !sessionId) return;

    const next: ChatMessage[] = [...messagesRef.current, { role: 'user', content: text }];
    messagesRef.current = next;
    setMessages(next);
    solo?.persist(next);
    setInput('');
    await run({ sessionId, message: text });
  }

  async function endSession() {
    if (!sessionId || ending) return;
    setEnding(true);

    if (solo) {
      await solo.finish(messagesRef.current);
      return;
    }

    await fetch('/api/session/end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    router.refresh();
    window.location.href = '/tutor';
  }

  /**
   * Jump to another topic (try-it-out version only). Anything typed in the
   * current conversation goes, so say so before it does.
   */
  function jumpTo(topicId: string, topicName: string) {
    if (!solo || busy) return;
    const started = messagesRef.current.some((m) => m.role === 'user');
    if (started && !window.confirm(`Leave this conversation and start on ${topicName}?`)) return;
    solo.switchTopic(topicId);
  }

  function startOver() {
    if (!solo) return;
    if (!window.confirm('This clears the progress kept in this browser and starts from the beginning. Continue?')) return;
    solo.reset();
  }

  function insertMath(snippet: string, caret?: number) {
    const el = inputRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = input.slice(0, start) + snippet + input.slice(end);
    setInput(next);
    requestAnimationFrame(() => {
      const pos = start + snippet.length + (caret ?? 0);
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  const steadyCount = topicList.filter((t) => t.status === 'steady').length;
  const pct = Math.round((steadyCount / topicList.length) * 100);

  return (
    <div className="layout">
      <aside className="side">
        <div className="panel">
          <div className="panel-b" style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <div className="avatar">{initials}</div>
            <div>
              <div className="who-name">{studentName}</div>
              <div className="who-sub">
                {sessionCount === 0 ? 'First session' : `Session ${sessionCount}`}
              </div>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-h">Where you are</div>
          <div className="panel-b">
            <div className="who-name">{topic.unit}</div>
            <div className="bar"><i style={{ width: `${pct}%` }} /></div>
            <div className="bar-lbl">
              {steadyCount} of {topicList.length} topics steady
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-h">This unit</div>
          <div className="panel-b">
            <ul className="tlist">
              {topicList.map((t) => {
                const isNow = t.id === topic.id;
                const cls = isNow
                  ? 't-now'
                  : t.status === 'steady'
                    ? 't-steady'
                    : t.status === 'shaky'
                      ? 't-shaky'
                      : 't-next';
                const glyph = isNow ? '●' : t.status === 'steady' ? '✓' : t.status === 'shaky' ? '~' : '·';
                const label = (
                  <>
                    <span className={`tick ${cls}`}>{glyph}</span>
                    <span className="nm">{isNow ? <b>{t.name}</b> : t.name}</span>
                  </>
                );
                return (
                  <li key={t.id} className={!isNow && t.status === 'not_started' ? 'upcoming' : undefined}>
                    {/* Only the try-it-out version lets you jump about. Students
                        follow the order the course teaches things in. */}
                    {solo && !isNow ? (
                      <button type="button" className="tjump" onClick={() => jumpTo(t.id, t.name)}>
                        {label}
                      </button>
                    ) : (
                      label
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {solo ? (
          <div className="panel">
            <div className="panel-h">Trying it out</div>
            <div className="panel-b">
              <p className="who-sub" style={{ marginBottom: 10 }}>
                Click any topic above to jump straight to it. Nothing here is saved anywhere
                except this browser.
              </p>
              <button type="button" className="linkbtn" onClick={startOver}>
                Clear everything and start again
              </button>
            </div>
          </div>
        ) : null}
      </aside>

      <main className="chat">
        <div className="plan">
          <div>
            <div className="eyebrow">Today&rsquo;s session</div>
            <h2>{topic.studentFacingName}</h2>
            <div className="meta">{because}</div>
          </div>
        </div>

        <div className="thread" ref={threadRef}>
          {messages.map((m, i) => (
            <div key={i} className={m.role === 'assistant' ? 'msg tutor' : 'msg you'}>
              <div className="speaker">{m.role === 'assistant' ? 'Calcu-Buddy' : 'You'}</div>
              <MathText text={m.content} />
            </div>
          ))}

          {streaming ? (
            <div className="msg tutor">
              <div className="speaker">Calcu-Buddy</div>
              <MathText text={streaming} />
            </div>
          ) : null}

          {busy && !streaming ? (
            <div className="typing"><i /><i /><i /></div>
          ) : null}

          {error ? <div className="notice bad">{error}</div> : null}
        </div>

        <div className="composer">
          <div className="mathbar">
            {MATH_BUTTONS.map((b) => (
              <button key={b.label} type="button" onClick={() => insertMath(b.insert, b.caret)}>
                {b.label}
              </button>
            ))}
            <span className="hint">Tap to insert &mdash; or just type it however you like</span>
          </div>

          <div className="inputrow">
            <textarea
              ref={inputRef}
              rows={2}
              value={input}
              placeholder={'Type your answer, or tell me you\u2019re stuck\u2026'}
              disabled={busy || !sessionId}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <button type="button" onClick={() => void send()} disabled={busy || !input.trim()}>
              Send
            </button>
          </div>

          <div className="compfoot">
            <span>Enter to send, Shift+Enter for a new line</span>
            <span>&middot;</span>
            <button className="linkbtn" onClick={() => void endSession()} disabled={ending || !sessionId}>
              {ending ? 'Saving\u2026' : 'End session'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
