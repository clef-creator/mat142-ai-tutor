import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { isSoloMode } from '@/lib/mode';

/** Where the emailed link lands. Exchanges the one-time code for a session,
 *  then makes sure the student has a row in our own table. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  // No accounts in this mode, so an emailed link cannot mean anything here.
  if (isSoloMode()) return NextResponse.redirect(`${origin}/`);

  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/error?reason=missing-code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user?.email) {
    return NextResponse.redirect(`${origin}/auth/error?reason=expired`);
  }

  const email = data.user.email.toLowerCase();
  const domain = process.env.ALLOWED_EMAIL_DOMAIN ?? 'ahduni.edu.in';

  if (!email.endsWith('@' + domain)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/auth/error?reason=domain`);
  }

  // The allow-list is what keeps the pilot at fifteen students.
  const admin = createAdminClient();
  const { data: allowed } = await admin
    .from('allowed_students')
    .select('email, display_name')
    .eq('email', email)
    .maybeSingle();

  if (!allowed) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/auth/error?reason=not-on-list`);
  }

  await admin.from('students').upsert(
    {
      id: data.user.id,
      email,
      display_name: allowed.display_name ?? null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );

  return NextResponse.redirect(`${origin}/tutor`);
}
