/** Keep provider text out of URLs, page content, and application logs. */
export function safeOAuthCode(value: string | null | undefined): string | null {
  return value && /^[a-z][a-z0-9_]{0,63}$/i.test(value) ? value.toLowerCase() : null;
}

export function classifyOAuthError(
  error: string,
  code: string | null,
  description: string | null,
) {
  const detail = description ?? '';
  let reason = 'google';
  if (/error getting user email from external provider/i.test(detail)) {
    reason = 'google-email';
  } else if (/unable to exchange external code/i.test(detail)) {
    reason = 'google-exchange';
  } else if (/signups? (?:are )?(?:not allowed|disabled)|signup_disabled/i.test(detail)) {
    reason = 'google-signups';
  } else if (/database error/i.test(detail)) {
    reason = 'google-database';
  }

  return {
    reason,
    providerError: safeOAuthCode(error),
    providerCode: safeOAuthCode(code),
  };
}
