'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const DOMAIN = process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN ?? 'ahduni.edu.in';

export default function SignInForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const address = email.trim().toLowerCase();

    if (!address.endsWith('@' + DOMAIN)) {
      setState('error');
      setMessage(`Please use your @${DOMAIN} address.`);
      return;
    }

    setState('sending');

    const { error } = await createClient().auth.signInWithOtp({
      email: address,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: true,
      },
    });

    if (error) {
      setState('error');
      // Supabase returns this when the address is not on the pilot allow-list.
      setMessage(
        error.message.toLowerCase().includes('not allowed') ||
        error.message.toLowerCase().includes('signups not allowed')
          ? 'That address is not on the pilot list. If you think it should be, contact your instructor.'
          : 'Something went wrong sending the link. Please try again in a moment.',
      );
      return;
    }

    setState('sent');
  }

  if (state === 'sent') {
    return (
      <div className="notice ok">
        Check your inbox. We&rsquo;ve sent a sign-in link to <strong>{email.trim().toLowerCase()}</strong>.
        It works once and expires in an hour.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <label className="field" htmlFor="email">University email</label>
      <input
        id="email"
        type="email"
        required
        autoComplete="email"
        placeholder={`yourname@${DOMAIN}`}
        value={email}
        onChange={(e) => { setEmail(e.target.value); if (state === 'error') setState('idle'); }}
      />
      <button className="btn" type="submit" disabled={state === 'sending'}>
        {state === 'sending' ? 'Sending\u2026' : 'Email me a sign-in link'}
      </button>
      {state === 'error' ? <div className="notice bad">{message}</div> : null}
    </form>
  );
}
