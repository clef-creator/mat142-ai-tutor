import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { findAllowedStudent } from '@/lib/enrollment';
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
    return NextResponse.redirect(`${origin}/auth/error?reason=google`);
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

  const admin = createAdminClient();

  if (!email.endsWith('@' + domain)) {
    await supabase.auth.signOut();
    // Google sign-in creates an account for whoever arrives, including a
    // personal Gmail. Nobody outside the university domain can ever be let
    // in, as student or professor, so that account is removed rather than
    // left to accumulate in the user list.
    const { error: deleteError } = await admin.auth.admin.deleteUser(data.user.id);
    if (deleteError) console.error('[auth] could not remove an outside account', deleteError);
    return NextResponse.redirect(`${origin}/auth/error?reason=domain`);
  }

  if (await findActiveFaculty(admin, data.user)) {
    return NextResponse.redirect(`${origin}/dashboard`);
  }

  // The student allow-list keeps the pilot at fifteen students.
  const allowed = await findAllowedStudent(admin, email);

  if (!allowed) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/auth/error?reason=not-on-list`);
  }

  const { error: provisionError } = await admin.from('students').upsert(
    {
      id: data.user.id,
      email,
      display_name: allowed.display_name ?? null,
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
