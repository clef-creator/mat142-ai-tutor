import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isSoloMode } from '@/lib/mode';
import { ACCESS_COOKIE, hasAccess } from '@/lib/access';

/** Keeps the sign-in session fresh, and sends visitors who have not got past
 *  the door back to the front page. What "the door" means depends on the mode:
 *  a university sign-in in the full version, one shared code in solo mode. */
export async function middleware(request: NextRequest) {
  const wantsTutor = request.nextUrl.pathname.startsWith('/tutor');

  if (isSoloMode()) {
    if (wantsTutor && !(await hasAccess(request.cookies.get(ACCESS_COOKIE)?.value))) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user && wantsTutor) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
