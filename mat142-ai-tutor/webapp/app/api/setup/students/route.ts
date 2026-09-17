import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { isSoloMode } from '@/lib/mode';
import { isSetupTokenCorrect, setupEnabled } from '@/lib/setup-token';
import { MAX_ROSTER_ENTRIES, parseRoster } from '@/lib/roster';
import { provisionStudents } from '@/lib/provisioning';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Creates the pilot sign-ins and answers with their passwords, once.
 *
 * This is the only part of the app that can mint an account, so the order of
 * the checks matters: the page does not exist unless a setup token is
 * configured, the token is checked before anything is read, and a wrong token
 * costs the same wait as a wrong access code. Nothing is remembered between
 * requests — no cookie, no session — so the token is typed again every time.
 *
 * The passwords are in this response and nowhere else. They are not logged,
 * not stored in readable form, and cannot be recovered afterwards; a lost one
 * is replaced by running this again with "give everyone a new password".
 */
export async function POST(req: Request) {
  if (isSoloMode() || !setupEnabled()) {
    return NextResponse.json({ error: 'Not available' }, { status: 404 });
  }

  let body: { token?: string; roster?: string; resetExisting?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  if (!isSetupTokenCorrect(body.token ?? '')) {
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: 'That setup password is not right.' }, { status: 401 });
  }

  const domain = (process.env.ALLOWED_EMAIL_DOMAIN ?? 'ahduni.edu.in').toLowerCase();
  const { entries, problems } = parseRoster(body.roster ?? '', domain);

  if (entries.length === 0) {
    return NextResponse.json(
      { error: 'No usable email addresses were found in that list.', problems },
      { status: 400 },
    );
  }

  if (entries.length > MAX_ROSTER_ENTRIES) {
    return NextResponse.json(
      {
        error: `That is ${entries.length} addresses. This page will do ${MAX_ROSTER_ENTRIES} at a time.`,
        problems,
      },
      { status: 400 },
    );
  }

  try {
    const results = await provisionStudents(createAdminClient(), entries, {
      resetExisting: body.resetExisting === true,
    });
    return NextResponse.json({ ok: true, results, problems });
  } catch (error) {
    console.error('[setup] provisioning students failed', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Something went wrong.', problems },
      { status: 500 },
    );
  }
}
