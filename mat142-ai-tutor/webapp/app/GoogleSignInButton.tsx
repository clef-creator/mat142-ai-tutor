'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const DOMAIN = process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN ?? 'ahduni.edu.in';

/**
 * Hands the student to Google and back.
 *
 * Google returns them to /auth/callback with the chosen role. The callback
 * checks the admin allowlist or verifies the student Google session. `hd` asks Google to offer
 * university accounts first and `select_account` stops it silently picking a
 * personal Gmail that happens to be signed in; neither is relied on, since the
 * callback checks the address itself.
 */
export default function GoogleSignInButton({ role = 'student' }: { role?: 'student' | 'admin' }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (busy) return;
    setBusy(true);
    setError(null);

    const { error: oauthError } = await createClient().auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?role=${role}`,
        scopes: 'https://www.googleapis.com/auth/userinfo.email',
        queryParams: { hd: DOMAIN, prompt: 'select_account' },
      },
    });

    if (oauthError) {
      setError('Google sign-in is not available just now. Please try again in a moment.');
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" className="btn" style={BUTTON} onClick={() => void onClick()} disabled={busy}>
        <GoogleMark />
        <span>{busy ? 'Opening Google…' : 'Sign in with Google'}</span>
      </button>
      {error ? <div className="notice bad">{error}</div> : null}
    </div>
  );
}

// White with a hairline, as Google asks its button to look, so it reads as
// "your university Google account" rather than as our own maroon button.
const BUTTON: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
  background: '#fff', color: 'var(--ink)', border: '1px solid #d0d0cc',
};

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
      <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.8-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.4 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}
