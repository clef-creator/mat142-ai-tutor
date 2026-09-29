import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { findActiveFaculty } from '@/lib/faculty';
import { isSoloMode } from '@/lib/mode';

export const runtime = 'nodejs';

/** Faculty password sign-in. Students prove their university address with Google. */
export async function POST(req: Request) {
  if (isSoloMode()) return NextResponse.json({ error: 'Not available in this mode' }, { status: 404 });

  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const email = (body.email ?? '').trim().toLowerCase();
  const password = body.password ?? '';
  const domain = (process.env.ALLOWED_EMAIL_DOMAIN ?? 'ahduni.edu.in').toLowerCase();
  if (!email || !password) {
    return NextResponse.json({ error: 'Enter your email address and password.' }, { status: 400 });
  }
  if (!email.endsWith('@' + domain)) {
    return NextResponse.json({ error: `Please use your @${domain} address.` }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user?.email) {
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json(
      { error: 'That email address and password do not match. Check both and try again.' },
      { status: 401 },
    );
  }

  if (await findActiveFaculty(createAdminClient(), data.user)) {
    return NextResponse.json({ ok: true, next: '/dashboard' });
  }

  await supabase.auth.signOut();
  return NextResponse.json(
    { error: 'Students sign in with their university Google account.' },
    { status: 403 },
  );
}
