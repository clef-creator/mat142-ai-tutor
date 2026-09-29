import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { isUniversityGoogleSession } from '@/lib/enrollment';
import { findActiveFaculty } from '@/lib/faculty';
import { isSoloMode } from '@/lib/mode';

/** Exchange the code from Google (or an emailed link), then route an
 *  authorized professor or student. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  // No accounts in this mode, so an emailed link cannot mean anything here.
  if (isSoloMode()) return NextResponse.redirect(`${origin}/`);

  // Google sends people back with an error instead of a code when they
  // cancel, or when the university has not allowed this app. Neither is an
  // expired link, so say what actually happened.
  if (searchParams.get('error')) {
    const emailScopeError = searchParams.get('error') === 'server_error' &&
      /error getting user email from external provider/i.test(
        searchParams.get('error_description') ?? '',
      );
    return NextResponse.redirect(`${origin}/auth/error?reason=${emailScopeError ? 'google-email' : 'google'}`);
  }

  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/error?reason=missing-code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user?.email) {
    return NextResponse.redirect(`${origin}/auth/error?reason=expired`);
  }

  const email = data.user.email.trim().toLowerCase();
  const domain = process.env.ALLOWED_EMAIL_DOMAIN ?? 'ahduni.edu.in';

  if (!email.endsWith('@' + domain)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/auth/error?reason=domain`);
  }

  const admin = createAdminClient();

  if (await findActiveFaculty(admin, data.user)) {
    return NextResponse.redirect(`${origin}/dashboard`);
  }

  const { data: claimsData, error: claimsError } = data.session
    ? await supabase.auth.getClaims(data.session.access_token)
    : { data: null, error: null };
  if (claimsError || !isUniversityGoogleSession(data.user, claimsData?.claims)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/auth/error?reason=google-required`);
  }

  const displayName = typeof data.user.user_metadata?.full_name === 'string'
    ? data.user.user_metadata.full_name.trim().slice(0, 120) || null
    : null;
  const { error: provisionError } = await admin.from('students').upsert(
    {
      id: data.user.id,
      email,
      display_name: displayName,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );

  if (provisionError) {
    console.error('[auth] student provisioning failed', provisionError);
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/auth/error?reason=provisioning`);
  }

  return NextResponse.redirect(`${origin}/tutor`);
}
