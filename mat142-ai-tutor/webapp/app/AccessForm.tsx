'use client';

import { useState } from 'react';

export default function AccessForm() {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch('/api/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, name }),
      });

      if (!res.ok) {
        const info = await res.json().catch(() => ({}));
        setError(info.error ?? 'Something went wrong. Try again.');
        setBusy(false);
        return;
      }

      window.location.href = '/tutor';
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <label className="field" htmlFor="name">Your first name</label>
      <input
        id="name"
        type="text"
        autoComplete="given-name"
        placeholder="So the tutor knows what to call you"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <label className="field" htmlFor="code" style={{ marginTop: 14 }}>Access code</label>
      <input
        id="code"
        type="password"
        required
        autoComplete="off"
        placeholder="The code you were given"
        value={code}
        onChange={(e) => { setCode(e.target.value); if (error) setError(null); }}
      />

      <button className="btn" type="submit" disabled={busy || !code.trim()}>
        {busy ? 'Checking\u2026' : 'Start'}
      </button>

      {error ? <div className="notice bad">{error}</div> : null}
    </form>
  );
}
