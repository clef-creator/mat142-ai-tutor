/** A short, printable summary of what Google or Supabase reported. Only
 *  letters, digits and plain punctuation survive, so nothing from the query
 *  string can become markup or a link on the error page. */
export function describeOAuthError(
  error: string,
  code: string | null,
  description: string | null,
): string {
  const clean = (value: string | null) =>
    (value ?? '').replace(/\+/g, ' ').replace(/[^\w .,:;'()\/-]/g, '').replace(/\s+/g, ' ').trim();
  const parts = [clean(description), clean(code), clean(error)].filter(Boolean);
  const unique = parts.filter((part, i) => parts.indexOf(part) === i);
  return unique.join(' / ').slice(0, 200) || 'unknown error';
}
