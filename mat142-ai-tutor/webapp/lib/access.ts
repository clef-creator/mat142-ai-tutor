/**
 * The shared-code door for solo mode.
 *
 * One code, typed once, remembered in a cookie for a fortnight. This is not
 * meant to be strong security — it is meant to stop the address being forwarded
 * on and quietly running up an Anthropic bill. The real backstop is the spend
 * limit on the Anthropic account, which no amount of code here can substitute
 * for.
 *
 * The cookie holds a hash of the code rather than the code itself, so a copy of
 * someone's cookies does not hand over the code they would need to tell a
 * friend. Web Crypto is used rather than Node's, because this has to run in
 * middleware as well as in ordinary server code.
 */

export const ACCESS_COOKIE = 'cb_access';
export const NAME_COOKIE = 'cb_name';

/** Two weeks. Long enough not to be a nuisance, short enough to expire. */
export const ACCESS_MAX_AGE = 60 * 60 * 24 * 14;

export async function accessToken(code: string): Promise<string> {
  const data = new TextEncoder().encode(`calcu-buddy:v1:${code}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Compares without leaking how much of the value matched, via timing. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function isCodeCorrect(supplied: string): Promise<boolean> {
  const expected = process.env.ACCESS_CODE;
  if (!expected) return false;
  return constantTimeEqual(supplied.trim(), expected);
}

export async function hasAccess(cookieValue: string | undefined): Promise<boolean> {
  const expected = process.env.ACCESS_CODE;
  if (!expected || !cookieValue) return false;
  return constantTimeEqual(cookieValue, await accessToken(expected));
}
