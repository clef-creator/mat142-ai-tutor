'use client';

import { useEffect, useRef, useState } from 'react';
import MathText from '@/components/MathText';
import type { DashboardData, StudentSignal } from '@/lib/dashboard';

function dateLabel(value: string | null): string {
  if (!value) return 'No practice yet';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(value));
}

function countLabel(value: number, singular: string, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`;
}

function observationList(student: StudentSignal): string[] {
  const observations: string[] = [];
  if (!student.hasSignedIn) observations.push('Has not signed in');
  else if (!student.sessionsThisWeek) observations.push('No practice session in the last 7 days');
  if (student.shakyTopics.length) observations.push(countLabel(student.shakyTopics.length, 'topic') + ' currently marked shaky');
  if (student.answerSeekingSessions) observations.push(countLabel(student.answerSeekingSessions, 'session') + ' with answer seeking observed');
  return observations;
}

export default function DashboardClient({ data }: { data: DashboardData }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const selected = data.students.find((student) => student.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId]);

  const review = data.students.filter((student) => observationList(student).length);
  const maxDifficulty = Math.max(1, ...data.difficulty.map((topic) => topic.students));

  return (
    <main className="shell dashboard">
      <div className="dash-heading">
        <div>
          <p className="eyebrow">Teaching team view</p>
          <h1>Pilot cohort</h1>
          <p>{countLabel(data.students.length, 'student')} · Rolling seven days, {dateLabel(data.windowStart)} to {dateLabel(data.windowEnd)} (UTC)</p>
        </div>
      </div>

      <div className="dash-privacy"><strong>Signals, not conversations.</strong> This dashboard uses structured activity and outcome data. Student messages and private tutor memory are not loaded.</div>

      <section className="dash-stats" aria-label="Cohort overview">
        <div className="panel dash-stat"><b>{data.activeStudents}<small> / {data.students.length}</small></b><span>Students with a practice session</span></div>
        <div className="panel dash-stat"><b>{data.sessionsThisWeek}</b><span>Sessions started</span></div>
        <div className="panel dash-stat"><b>{data.medianSessionMinutes ?? '—'}{data.medianSessionMinutes !== null && <small> min</small>}</b><span>Median completed session</span></div>
        <div className="panel dash-stat"><b>{data.topicsAttempted}</b><span>Topics attempted</span></div>
      </section>

      <div className="dash-columns">
        <section className="panel">
          <h2 className="panel-h">Activity to review</h2>
          <div className="panel-b">
            <p className="dash-caption">Current shaky topic statuses and observations from the last seven days. These are prompts to check in, not judgements.</p>
            {!data.students.length ? <p>No students are on the pilot list yet.</p> : !review.length ? <p>No observations to review in this window.</p> : (
              <ul className="dash-review">
                {review.map((student) => (
                  <li key={student.id}>
                    <button type="button" onClick={() => setSelectedId(student.id)}>{student.name}</button>
                    <span>{observationList(student).join(' · ')}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="panel">
          <h2 className="panel-h">Where students met difficulty</h2>
          <div className="panel-b">
            <p className="dash-caption">Distinct students with a shaky session outcome for each topic in the last seven days.</p>
            {!data.difficulty.length ? <p>No shaky outcomes recorded in this window.</p> : (
              <div className="dash-difficulty">
                {data.difficulty.slice(0, 10).map((item) => (
                  <div className="dash-difficulty-row" key={item.topicId}>
                    <span><MathText text={item.topic} inline /></span>
                    <div className="dash-track" aria-hidden="true"><i style={{ width: `${item.students / maxDifficulty * 100}%` }} /></div>
                    <b aria-label={countLabel(item.students, 'student')}>{item.students}</b>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="panel dash-roster">
        <h2 className="panel-h">Student roster</h2>
        {!data.students.length ? <p className="panel-b">No students are on the pilot list yet.</p> : (
          <div className="dash-table-wrap">
            <table>
              <thead><tr><th>Student</th><th>Last practice</th><th>Sessions</th><th>Topics steady</th><th>Current shaky topics</th><th>Observations</th></tr></thead>
              <tbody>
                {data.students.map((student) => (
                  <tr key={student.id}>
                    <td><button type="button" className="dash-student-button" onClick={() => setSelectedId(student.id)}>{student.name}</button></td>
                    <td>{student.hasSignedIn ? dateLabel(student.lastPractice) : 'Not signed in'}</td>
                    <td>{student.sessions}</td>
                    <td>{student.steadyTopics}</td>
                    <td>{student.shakyTopics.length}</td>
                    <td>{observationList(student).length || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && (
        <div className="dash-modal-root">
          <button className="dash-scrim" type="button" aria-label="Close student details" onClick={() => setSelectedId(null)} />
          <aside className="dash-drawer" role="dialog" aria-modal="true" aria-labelledby="dash-drawer-title">
            <div className="dash-drawer-head">
              <div><h2 id="dash-drawer-title">{selected.name}</h2><p>{selected.email}</p></div>
              <button ref={closeRef} type="button" onClick={() => setSelectedId(null)} aria-label="Close student details">×</button>
            </div>
            <div className="dash-drawer-body">
              <h3>Activity</h3>
              <dl>
                <div><dt>Sessions, all time</dt><dd>{selected.sessions}</dd></div>
                <div><dt>Sessions, last 7 days</dt><dd>{selected.sessionsThisWeek}</dd></div>
                <div><dt>Last practice</dt><dd>{selected.hasSignedIn ? dateLabel(selected.lastPractice) : 'Not signed in'}</dd></div>
                <div><dt>Median completed session</dt><dd>{selected.medianSessionMinutes === null ? '—' : `${selected.medianSessionMinutes} min`}</dd></div>
                <div><dt>Topics steady</dt><dd>{selected.steadyTopics}</dd></div>
              </dl>
              <h3>Topics currently marked shaky</h3>
              {selected.shakyTopics.length ? <ul>{selected.shakyTopics.map((topic, index) => <li key={`${topic}-${index}`}><MathText text={topic} inline /></li>)}</ul> : <p>None recorded.</p>}
              <h3>Observations</h3>
              {observationList(selected).length ? <ul>{observationList(selected).map((item) => <li key={item}>{item}</li>)}</ul> : <p>None in this window.</p>}
              <div className="dash-sealed">Conversations and private tutor memory are not available in this dashboard.</div>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
