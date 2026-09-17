'use client';

import { useState } from 'react';

interface Result {
  email: string;
  displayName: string | null;
  password: string | null;
  status: 'created' | 'password-reset' | 'already-set-up' | 'failed';
  detail?: string;
}

interface Problem {
  line: string;
  reason: string;
}

const STATUS_WORDS: Record<Result['status'], string> = {
  created: 'New account',
  'password-reset': 'New password',
  'already-set-up': 'Already had an account',
  failed: 'Did not work',
};

export default function SetupClient({ domain }: { domain: string }) {
  const [token, setToken] = useState('');
  const [roster, setRoster] = useState('');
  const [resetExisting, setResetExisting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [copied, setCopied] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);
    setCopied(false);

    try {
      const res = await fetch('/api/setup/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, roster, resetExisting }),
      });
      const info = await res.json().catch(() => ({}));

      setProblems(info.problems ?? []);

      if (!res.ok) {
        setError(info.error ?? 'Something went wrong. Please try again.');
        setBusy(false);
        return;
      }

      setResults(info.results ?? []);
      setBusy(false);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setBusy(false);
    }
  }

  async function copyList() {
    if (!results) return;
    const lines = results
      .filter((r) => r.password)
      .map((r) => [r.displayName ?? '', r.email, r.password].join('\t'));
    try {
      await navigator.clipboard.writeText(['Name\tEmail\tPassword', ...lines].join('\n'));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (results) {
    const withPasswords = results.filter((r) => r.password);
    const failed = results.filter((r) => r.status === 'failed');

    return (
      <main className="shell setup">
        <h1>Sign-ins for {results.length === 1 ? 'one student' : `${results.length} students`}</h1>

        <div className="notice bad setup-once">
          These passwords are shown once and cannot be looked up again. Copy them somewhere
          safe before you leave this page. If one goes missing, come back here and tick
          &ldquo;give everyone a new password&rdquo; &mdash; the student keeps all their work.
        </div>

        <div className="setup-actions">
          <button type="button" className="btn setup-inline" onClick={() => void copyList()}>
            {copied ? 'Copied' : `Copy ${withPasswords.length === 1 ? 'the row' : 'all rows'}`}
          </button>
          <span className="setup-hint">
            Pastes into a spreadsheet as three columns. Hand each student their own row in
            person or by a message only they can read &mdash; not a shared document.
          </span>
        </div>

        <div className="setup-table-wrap">
          <table>
            <thead>
              <tr><th>Name</th><th>Email</th><th>Password</th><th>What happened</th></tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.email}>
                  <td>{r.displayName ?? '\u2014'}</td>
                  <td>{r.email}</td>
                  <td className="setup-password">{r.password ?? '\u2014'}</td>
                  <td>
                    {STATUS_WORDS[r.status]}
                    {r.detail ? <span className="setup-detail">{r.detail}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {failed.length ? (
          <div className="notice bad">
            {failed.length === 1 ? 'One address' : `${failed.length} addresses`} could not be
            set up. Fix what the last column says and run those again on their own.
          </div>
        ) : null}

        {problems.length ? (
          <div className="notice bad">
            <strong>Lines that were skipped</strong>
            <ul>
              {problems.map((p, i) => (
                <li key={`${p.line}-${i}`}>{p.line} &mdash; {p.reason}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <button
          type="button"
          className="btn setup-inline"
          onClick={() => { setResults(null); setRoster(''); setCopied(false); }}
        >
          Set up more students
        </button>
      </main>
    );
  }

  return (
    <div className="signin-wrap">
      <div>
        <div className="signin">
          <h1>Student sign-ins</h1>
          <p className="lede">
            Paste your list of students below. Each one gets an account and a password to
            sign in with. Nothing is emailed to anybody &mdash; you hand the passwords out
            yourself.
          </p>

          <form onSubmit={onSubmit}>
            <label className="field" htmlFor="token">Setup password</label>
            <input
              id="token"
              type="password"
              required
              autoComplete="off"
              placeholder="The one you put in the site settings"
              value={token}
              onChange={(e) => { setToken(e.target.value); if (error) setError(null); }}
            />

            <label className="field" htmlFor="roster" style={{ marginTop: 14 }}>
              Students, one per line
            </label>
            <textarea
              id="roster"
              required
              rows={8}
              placeholder={`Aarav Shah, aarav.shah@${domain}\nMeera Patel, meera.patel@${domain}`}
              value={roster}
              onChange={(e) => { setRoster(e.target.value); if (error) setError(null); }}
            />
            <p className="setup-hint">
              Name and address on each line, in either order. An address on its own is fine
              too. Only @{domain} addresses are accepted.
            </p>

            <label className="setup-check">
              <input
                type="checkbox"
                checked={resetExisting}
                onChange={(e) => setResetExisting(e.target.checked)}
              />
              <span>
                Give everyone a new password, including students who already have one. Leave
                this unticked when you are only adding people.
              </span>
            </label>

            <button className="btn" type="submit" disabled={busy || !token.trim() || !roster.trim()}>
              {busy ? 'Setting them up\u2026' : 'Create the sign-ins'}
            </button>

            {error ? <div className="notice bad">{error}</div> : null}

            {problems.length ? (
              <div className="notice bad">
                <strong>Lines that could not be read</strong>
                <ul>
                  {problems.map((p, i) => (
                    <li key={`${p.line}-${i}`}>{p.line} &mdash; {p.reason}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </form>
        </div>
        <p className="footnote">
          This page exists only while a setup password is configured. Once your students are
          signed up, remove that setting and redeploy, and the page goes away.
        </p>
      </div>
    </div>
  );
}
