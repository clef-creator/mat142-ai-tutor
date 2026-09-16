import type { SupabaseClient, User } from '@supabase/supabase-js';

export const INACTIVE_ENROLLMENT_ERROR = 'enrollment-inactive';
export const INACTIVE_ENROLLMENT_MESSAGE =
  'Your access to this pilot is no longer active. Contact your instructor if you think this is a mistake.';

export type AllowedStudent = {
  email: string;
  display_name: string | null;
};

export type ActiveStudentEnrollment = {
  studentId: string;
  email: string;
  displayName: string | null;
};

/**
 * Emails are compared in the same canonical form used when the callback
 * provisions a student. Supabase Auth emails are normally already lower-case,
 * but normalising here keeps every entry point consistent.
 */
export function normaliseEnrollmentEmail(email: string | null | undefined): string | null {
  const normalised = email?.trim().toLowerCase();
  return normalised || null;
}

/** Reads the current allow-list and fails closed when it cannot be checked. */
export async function findAllowedStudent(
  admin: SupabaseClient,
  email: string | null | undefined,
): Promise<AllowedStudent | null> {
  const normalisedEmail = normaliseEnrollmentEmail(email);
  if (!normalisedEmail) return null;

  const { data, error } = await admin
    .from('allowed_students')
    .select('email, display_name')
    .eq('email', normalisedEmail)
    .maybeSingle();

  if (error) {
    console.error('[enrollment] allow-list lookup failed', error);
    return null;
  }

  return data
    ? { email: normalisedEmail, display_name: data.display_name ?? null }
    : null;
}

/**
 * Active enrollment is deliberately stronger than "has a valid auth token".
 * The signed-in address must still be on the current allow-list and its
 * provisioned student row must belong to the same auth user. Removing the
 * allow-list row therefore revokes old browser sessions immediately.
 */
export async function findActiveStudentEnrollment(
  admin: SupabaseClient,
  user: Pick<User, 'id' | 'email'>,
): Promise<ActiveStudentEnrollment | null> {
  const allowed = await findAllowedStudent(admin, user.email);
  if (!allowed) return null;

  const { data: student, error } = await admin
    .from('students')
    .select('id, email, display_name')
    .eq('id', user.id)
    .eq('email', allowed.email)
    .maybeSingle();

  if (error) {
    console.error('[enrollment] student lookup failed', error);
    return null;
  }

  if (!student) return null;

  return {
    studentId: student.id,
    email: allowed.email,
    displayName: student.display_name ?? allowed.display_name,
  };
}
