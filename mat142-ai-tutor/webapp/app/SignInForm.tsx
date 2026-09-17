'use client';

import { useState } from 'react';

const DOMAIN = process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN ?? 'ahduni.edu.in';

export default function SignInForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch('/api/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });

      const info = await res.json().catch(() => ({}));

      if (!res.ok || !info.next) {
        setError(info.error ?? 'Something went wrong signing you in. Please try again.');
        setBusy(false);
        return;
      }

      // A full page load rather than a client navigation, so the page that
      // comes next is rendered by the server with the new session already in
      // place instead of with whatever it had cached a moment ago.
      window.location.href = info.next;
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <label className="field" htmlFor="email">University email</label>
      <input
        id="email"
        type="email"
        required
        autoComplete="username"
        placeholder={`yourname@${DOMAIN}`}
        value={email}
        onChange={(e) => { setEmail(e.target.value); if (error) setError(null); }}
      />

      <label className="field" htmlFor="password" style={{ marginTop: 14 }}>Password</label>
      <input
        id="password"
        type="password"
        required
        autoComplete="current-password"
        placeholder="The password you were given"
        value={password}
        onChange={(e) => { setPassword(e.target.value); if (error) setError(null); }}
      />

      <button className="btn" type="submit" disabled={busy || !email.trim() || !password}>
        {busy ? 'Signing you in\u2026' : 'Sign in'}
      </button>

      {error ? <div className="notice bad">{error}</div> : null}
    </form>
  );
}
