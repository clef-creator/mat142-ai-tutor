import type { SupabaseClient, User } from '@supabase/supabase-js';

export const INACTIVE_ENROLLMENT_ERROR = 'student-access-denied';
export const INACTIVE_ENROLLMENT_MESSAGE =
  'Sign in with your Ahmedabad University Google account to use the tutor.';

export type ActiveStudentEnrollment = {
  studentId: string;
  email: string;
  displayName: string | null;
};

type AuthClaims = {
  email?: string;
  amr?: Array<string | { method: string }>;
};

export function normaliseEnrollmentEmail(email: string | null | undefined): string | null {
  const normalised = email?.trim().toLowerCase();
  return normalised || null;
}

/** A university address must have been proved by this Google sign-in session.
 * A password account with the same address is not enough. */
export function isUniversityGoogleSession(
  user: Pick<User, 'email' | 'identities'>,
  claims: AuthClaims | null | undefined,
): boolean {
  const email = normaliseEnrollmentEmail(user.email);
  const domain = (process.env.ALLOWED_EMAIL_DOMAIN ?? 'ahduni.edu.in').trim().toLowerCase();
  if (!email || !email.endsWith('@' + domain) ||
      normaliseEnrollmentEmail(claims?.email) !== email) return false;

  const usedOAuth = claims?.amr?.some((entry) =>
    typeof entry === 'string' ? entry === 'oauth' : entry.method === 'oauth');
  if (!usedOAuth) return false;

  return Boolean(user.identities?.some((identity) =>
    identity.provider === 'google' &&
    normaliseEnrollmentEmail(identity.identity_data?.email as string | undefined) === email &&
    identity.identity_data?.email_verified === true));
}

/** Every tutor request checks the verified session and the matching student
 * record. The record is created at first Google sign-in. */
export async function findActiveStudentEnrollment(
  admin: SupabaseClient,
  user: Pick<User, 'id' | 'email' | 'identities'>,
  claims: AuthClaims | null | undefined,
): Promise<ActiveStudentEnrollment | null> {
  if (!isUniversityGoogleSession(user, claims)) return null;
  const email = normaliseEnrollmentEmail(user.email)!;

  const { data: student, error } = await admin
    .from('students')
    .select('id, email, display_name')
    .eq('id', user.id)
    .eq('email', email)
    .maybeSingle();

  if (error) {
    console.error('[enrollment] student lookup failed', error);
    return null;
  }
  if (!student) return null;

  return { studentId: student.id, email, displayName: student.display_name ?? null };
}
