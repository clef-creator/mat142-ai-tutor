import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { findAllowedStudent } from '@/lib/enrollment';
import { findActiveFaculty } from '@/lib/faculty';
import { isSoloMode } from '@/lib/mode';

export const runtime = 'nodejs';

/**
 * Signing in with an address and a password.
 *
 * The pilot cannot send email. Getting a university mail domain to accept a
 * new sender means DNS records and a request to IT, and the students need to
 * be using this on Monday — so sign-in had to be something that sends nothing.
 * Supabase Auth's password flow does exactly that: the account is created for
 * the student in advance, the password is handed over in person, and no
 * message ever leaves the server.
 *
 * Nothing else changes. This is the same Supabase Auth identity a sign-in link
 * would have produced, so the row-level security policies, the allow-list, the
 * progress rows and the professor's dashboard all carry on as they were. If a
 * mail sender is ever configured, `/auth/callback` still works and links can
 * be turned back on without undoing any of this.
 *
 * What happens after the password is checked is deliberately identical to the
 * callback: the professor goes to the dashboard, a student on the allow-list
 * is provisioned and goes to the tutor, and anyone else is signed straight
 * back out.
 */
export async function POST(req: Request) {
  if (isSoloMode()) {
    return NextResponse.json({ error: 'Not available in this mode' }, { status: 404 });
  }

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
    return NextResponse.json(
      { error: `Please use your @${domain} address.` },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user?.email) {
    // Slow, and the same answer either way: a faster or different reply for a
    // real address would tell a stranger which of the two they had got right.
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json(
      { error: 'That email address and password do not match. Check both and try again.' },
      { status: 401 },
    );
  }

  const admin = createAdminClient();

  if (await findActiveFaculty(admin, data.user)) {
    return NextResponse.json({ ok: true, next: '/dashboard' });
  }

  const allowed = await findAllowedStudent(admin, data.user.email);

  if (!allowed) {
    await supabase.auth.signOut();
    return NextResponse.json(
      {
        error:
          'That address is not on the pilot list. If you think it should be, contact your instructor.',
      },
      { status: 403 },
    );
  }

  // First sign-in is what creates the student row, exactly as it does through
  // the emailed-link route. The professor's dashboard reads the absence of
  // this row as "has not signed in yet", so it must not be written earlier.
  const { error: provisionError } = await admin.from('students').upsert(
    {
      id: data.user.id,
      email: allowed.email,
      display_name: allowed.display_name ?? null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );

  if (provisionError) {
    console.error('[auth] student provisioning failed', provisionError);
    await supabase.auth.signOut();
    return NextResponse.json(
      { error: 'Your account could not be set up just now. Please try again in a moment.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, next: '/tutor' });
}
