import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isSoloMode } from '@/lib/mode';
import {
  ACCESS_COOKIE,
  ACCESS_MAX_AGE,
  NAME_COOKIE,
  accessToken,
  isCodeCorrect,
} from '@/lib/access';

export const runtime = 'nodejs';

/** Checks the shared code and, if it is right, remembers it for a fortnight. */
export async function POST(req: Request) {
  if (!isSoloMode()) {
    return NextResponse.json({ error: 'Not available in this mode' }, { status: 404 });
  }

  let body: { code?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const code = (body.code ?? '').trim();
  if (!code) return NextResponse.json({ error: 'Enter the code.' }, { status: 400 });

  if (!(await isCodeCorrect(code))) {
    // Deliberately slow, so the code cannot be found by trying thousands.
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: 'That code is not right.' }, { status: 401 });
  }

  const jar = await cookies();
  const secure = process.env.NODE_ENV === 'production';

  jar.set(ACCESS_COOKIE, await accessToken(code), {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: ACCESS_MAX_AGE,
  });

  const name = (body.name ?? '').trim().slice(0, 40);
  if (name) {
    // Not secret, and the tutor page reads it — so no httpOnly here.
    jar.set(NAME_COOKIE, name, {
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: ACCESS_MAX_AGE,
    });
  }

  return NextResponse.json({ ok: true });
}

/** Forgets the code on this device. */
export async function DELETE() {
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE);
  jar.delete(NAME_COOKIE);
  return NextResponse.json({ ok: true });
}
