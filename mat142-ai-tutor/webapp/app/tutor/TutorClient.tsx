'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import MathText from '@/components/MathText';
import { readTutorStream } from '@/lib/chat-stream';
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

interface TopicOption {
  id: string;
  name: string;
  unit: string;
}

type PendingTurn = {
  sessionId: string;
  requestId: string;
  message?: string;
  opening?: boolean;
  history?: ChatMessage[];
};

const PENDING_TURN_KEY = 'calcu-buddy-pending-turn';

function rememberTurn(turn: PendingTurn) {
  try {
    sessionStorage.setItem(PENDING_TURN_KEY, JSON.stringify({
      sessionId: turn.sessionId, requestId: turn.requestId,
      message: turn.message, opening: turn.opening,
    }));
  } catch { /* In-memory retry still works when storage is unavailable. */ }
}

function forgetTurn() {
  try { sessionStorage.removeItem(PENDING_TURN_KEY); } catch { /* No storage available. */ }
}

function rememberedTurn(sessionId: string): PendingTurn | null {
  try {
    const raw = sessionStorage.getItem(PENDING_TURN_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingTurn>;
    if (value.sessionId === sessionId && typeof value.requestId === 'string' &&
      (value.opening === true || typeof value.message === 'string')) {
      return value as PendingTurn;
    }
  } catch { /* Ignore an unreadable pending turn. */ }
  forgetTurn();
  return null;
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
  /**
   * Leaves for another topic. The conversation goes with it, because the
   * session being left is ended and read exactly as `finish` would end it.
   */
  switchTopic: (topicId: string, messages: ChatMessage[]) => Promise<void>;
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
  topicOptions,
  totalTopics,
  unitIndex,
  unitCount,
  solo,
}: {
  studentName: string;
  initials: string;
  sessionCount: number;
  existingSessionId: string | null;
  existingMessages: ChatMessage[];
  topic: TopicSummary;
  because: string;
  /**
   * Only the topics this student has reached. The rest of the unit is
   * deliberately absent — see `visibleTopics` in lib/curriculum.
   */
  topicList: TopicListItem[];
  /** Full course list for an explicit signed-in topic change. */
  topicOptions?: TopicOption[];
  /** How many topics the unit holds in all, including those not yet shown. */
  totalTopics: number;
  unitIndex: number;
  unitCount: number;
  solo?: SoloHooks;
}) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(existingSessionId);
  const [messages, setMessages] = useState<ChatMessage[]>(existingMessages);
  const [streaming, setStreaming] = useState('');
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingTurn | null>(null);
  const [ending, setEnding] = useState(false);
  const [sessionClosed, setSessionClosed] = useState(false);

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

  /**
   * Streams one reply, appending deltas as they arrive.
   *
   * The contract with the solo endpoint is that `history` is the conversation
   * *before* this turn and `message` is the new thing being said; the server
   * joins them. The screen has already added the student's message to the
   * thread by the time this runs, so callers pass the history they captured
   * beforehand — otherwise the message would travel twice and the model would
   * be billed for reading it twice.
   */
  const run = useCallback(
    async (payload: PendingTurn) => {
      setBusy(true);
      setError(null);
      setStreaming('');

      const reconcile = async () => {
        const state = await fetch(`/api/chat?sessionId=${encodeURIComponent(payload.sessionId)}&requestId=${encodeURIComponent(payload.requestId ?? '')}`, {
          cache: 'no-store',
        });
        if (!state.ok) throw new Error('Could not check saved history');
        const turn = await state.json() as { status: string; history: ChatMessage[] };
        if (!Array.isArray(turn.history)) throw new Error('Invalid saved history');
        messagesRef.current = turn.history;
        setMessages(turn.history);
        return turn;
      };

      try {
        // Solo mode has no database, so the conversation so far travels with
        // the request. The full version reads it from Supabase instead.
        const res = solo
          ? await fetch('/api/solo/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...solo.context(),
                history: payload.history ?? messagesRef.current,
                message: payload.message,
                opening: payload.opening,
              }),
            })
          : await fetch('/api/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sessionId: payload.sessionId,
                requestId: payload.requestId,
                message: payload.message,
                opening: payload.opening,
              }),
            });

        if (!res.ok) {
          const info = await res.json().catch(() => ({}));
          if (!solo) {
            try {
              const turn = await reconcile();
              if (turn.status === 'completed') {
                setPending(null);
                forgetTurn();
                return;
              }
            } catch { /* Keep the turn available while its status is unknown. */ }
          }
          setError(info.message ?? 'The turn could not be started. Please try again.');
          if (!solo && info.error !== 'busy' && res.status < 500) {
            setPending(null);
            forgetTurn();
            if (payload.message) setInput(payload.message);
          }
          return;
        }

        const acc = await readTutorStream(res.body, setStreaming);

        if (!solo) {
          const turn = await reconcile();
          if (turn.status !== 'completed') throw new Error('Turn not complete');
        } else {
          setMessages((prev) => {
            const next = [...prev, { role: 'assistant' as const, content: acc }];
            messagesRef.current = next;
            solo.persist(next);
            return next;
          });
        }
        setPending(null);
        if (!solo) forgetTurn();
        setStreaming('');
      } catch {
        setStreaming('');
        if (!solo) {
          try {
            const turn = await reconcile();
            if (turn.status === 'completed') {
              setPending(null);
              forgetTurn();
              return;
            }
            setError(turn.status === 'processing'
              ? 'The tutor is still replying. Check this turn again shortly.'
              : 'The reply failed. Your message was not saved. Retry this turn.');
          } catch {
            setError('Could not verify whether the reply was saved. Check this turn again.');
          }
        } else {
          setError('The tutor reply was interrupted. Retry this turn.');
        }
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
        try {
          const res = await fetch('/api/session/start', { method: 'POST' });
          const data = await res.json();
          if (!res.ok) {
            setError(data.message ?? 'Could not start a session.');
            return;
          }
          id = data.sessionId as string;
          setSessionId(id);
        } catch {
          setError('Could not start a session. Check your connection and try again.');
          return;
        }
      }

      if (id && !solo) {
        const saved = rememberedTurn(id);
        if (saved) {
          setPending(saved);
          await run(saved);
          return;
        }
      }

      if (messages.length === 0 && id) {
        const requestId = crypto.randomUUID();
        const turn = { sessionId: id, opening: true, requestId };
        setPending(turn);
        if (!solo) rememberTurn(turn);
        await run(turn);
      }
    })();
    // Intentionally runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send() {
    const text = input.trim();
    if (!text || busy || pending || sessionClosed || !sessionId) return;

    // What was said before this turn, captured before the screen is updated.
    // The new message is sent separately, so it must not also be in here.
    const priorHistory = messagesRef.current;

    const next: ChatMessage[] = [...priorHistory, { role: 'user', content: text }];
    if (solo) {
      messagesRef.current = next;
      setMessages(next);
      solo.persist(next);
    }
    setInput('');
    const requestId = crypto.randomUUID();
    const turn = { sessionId, requestId, message: text, history: priorHistory };
    setPending(turn);
    if (!solo) rememberTurn(turn);
    await run(turn);
  }

  async function discardPending() {
    if (!pending?.message || busy || solo) return;
    try {
      const res = await fetch(`/api/chat?sessionId=${encodeURIComponent(pending.sessionId)}&requestId=${encodeURIComponent(pending.requestId)}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Could not check turn');
      const turn = await res.json() as { status: string; history: ChatMessage[] };
      if (!Array.isArray(turn.history)) throw new Error('Invalid history');
      messagesRef.current = turn.history;
      setMessages(turn.history);
      if (turn.status === 'processing') {
        setError('The tutor is still replying. Check this turn again shortly.');
        return;
      }
      if (turn.status !== 'completed') setInput(pending.message);
      setPending(null);
      forgetTurn();
      setError(null);
    } catch {
      setError('Could not verify whether the message was saved. Check this turn again.');
    }
  }

  async function saveAccountSession(id: string): Promise<boolean> {
    try {
      const res = await fetch('/api/session/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: id }),
      });
      if (!res.ok) {
        const info = await res.json().catch(() => ({}));
        setError(info.message ?? 'Could not save the session. Please try again.');
        return false;
      }
      setSessionClosed(true);
      return true;
    } catch {
      setError('Could not confirm the session was saved. Please try again.');
      return false;
    }
  }

  async function endSession() {
    if (!sessionId || ending || busy || pending) return;
    setEnding(true);

    if (solo) {
      await solo.finish(messagesRef.current);
      return;
    }

    try {
      if (!await saveAccountSession(sessionId)) return;
      router.refresh();
      window.location.href = '/tutor';
    } finally {
      setEnding(false);
    }
  }

  /**
   * Save the topic being left before opening a session on the chosen topic.
   *
   * This ends the current session rather than abandoning it, so the work
   * already done is read and remembered. It therefore takes as long as "End
   * session" does, which is why it shares the same waiting state.
   */
  async function jumpTo(topicId: string, topicName: string) {
    if (!sessionId || topicId === topic.id || busy || ending || pending) return;
    const started = messagesRef.current.some((m) => m.role === 'user');
    if (
      started &&
      !window.confirm(
        `Finish here and start on ${topicName}? What you have done so far will be saved first.`,
      )
    ) {
      return;
    }
    setEnding(true);
    if (solo) {
      await solo.switchTopic(topicId, messagesRef.current);
      return;
    }
    try {
      if (!await saveAccountSession(sessionId)) return;
      const res = await fetch('/api/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicId }),
      });
      const started = await res.json().catch(() => ({}));
      if (!res.ok || !started.sessionId || started.topicId !== topicId) {
        setError(`Your work was saved. ${started.message ?? 'The new topic could not be opened. Please try again.'}`);
        return;
      }
      router.refresh();
      window.location.href = '/tutor';
    } catch {
      setError('Your work was saved, but the new topic could not be opened. Please try again.');
    } finally {
      setEnding(false);
    }
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

  // The bar measures progress through the whole unit, not through the part of
  // it that happens to be on screen. Otherwise finishing the single topic a new
  // student can see would read as 100%.
  const total = Math.max(totalTopics, topicList.length, 1);
  const steadyCount = topicList.filter((t) => t.status === 'steady').length;
  const pct = Math.round((steadyCount / total) * 100);
  const locked = Math.max(total - topicList.length, 0);

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
            <div className="who-sub">Part {unitIndex} of {unitCount}</div>
            <div className="bar"><i style={{ width: `${pct}%` }} /></div>
            <div className="bar-lbl">
              {steadyCount} of {total} topics steady in this part
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
                    {/* Topic names carry maths of their own — "the precise
                        ($\epsilon$–$\delta$) definition" — so they are typeset
                        rather than printed as written. */}
                    <span className="nm">
                      {isNow
                        ? <b><MathText text={t.name} inline /></b>
                        : <MathText text={t.name} inline />}
                    </span>
                  </>
                );
                return (
                  <li key={t.id} className={!isNow && t.status === 'not_started' ? 'upcoming' : undefined}>
                    {!isNow ? (
                      <button
                        type="button"
                        className="tjump"
                        disabled={busy || ending || !!pending || !sessionId}
                        onClick={() => void jumpTo(t.id, t.name)}
                      >
                        {label}
                      </button>
                    ) : (
                      label
                    )}
                  </li>
                );
              })}

              {/* What is still ahead is counted, never named. A student can see
                  there is more to come without meeting the whole unit at once. */}
              {locked > 0 ? (
                <li className="tlocked">
                  <span className="tick t-next">+</span>
                  <span className="nm">
                    {locked === 1 ? '1 more topic' : `${locked} more topics`} unlock as you go
                  </span>
                </li>
              ) : null}
            </ul>
            {!solo && topicOptions && (
              <div className="topic-chooser">
                <label htmlFor="topic-chooser">Choose another topic</label>
                <select id="topic-chooser" value={topic.id}
                  disabled={busy || ending || !!pending || !sessionId}
                  onChange={(event) => {
                    const next = topicOptions.find((option) => option.id === event.target.value);
                    event.currentTarget.value = topic.id;
                    if (next) void jumpTo(next.id, next.name);
                  }}>
                  {topicOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.unit}: {option.name}</option>
                  ))}
                </select>
                <p>Your work here is saved before the new topic opens.</p>
              </div>
            )}
          </div>
        </div>

        {solo ? (
          <div className="panel">
            <div className="panel-h">Trying it out</div>
            <div className="panel-b">
              <p className="who-sub" style={{ marginBottom: 10 }}>
                Topics open up one at a time as you finish them. You can click back to any
                you have already done. Nothing here is saved anywhere except this browser.
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

          {!solo && pending?.message ? (
            <div className="msg you" aria-label="Message pending, not saved yet">
              <div className="speaker">You · pending, not saved yet</div>
              <MathText text={pending.message} />
            </div>
          ) : null}

          {streaming ? (
            <div className="msg tutor">
              <div className="speaker">Calcu-Buddy · reply in progress</div>
              <MathText text={streaming} />
            </div>
          ) : null}

          {busy && !streaming ? (
            <div className="typing"><i /><i /><i /></div>
          ) : null}

          {error ? <div className="notice bad">{error}</div> : null}
          {!sessionId && error ? (
            <button type="button" className="linkbtn" onClick={() => window.location.reload()}>Retry loading the session</button>
          ) : null}
          {pending && !busy ? (
            <div>
              <button type="button" className="linkbtn" onClick={() => void run(pending)}>Retry this turn</button>
              {!solo && pending.message ? (
                <button type="button" className="linkbtn" onClick={() => void discardPending()}>Edit or discard this turn</button>
              ) : null}
            </div>
          ) : null}
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
              disabled={busy || !!pending || sessionClosed || !sessionId}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <button type="button" onClick={() => void send()} disabled={busy || !!pending || sessionClosed || !input.trim()}>
              Send
            </button>
          </div>

          <div className="compfoot">
            <span>Enter to send, Shift+Enter for a new line</span>
            <span>&middot;</span>
            <button className="linkbtn" onClick={() => void endSession()} disabled={busy || ending || !!pending || !sessionId}>
              {ending ? 'Saving\u2026' : 'End session'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
