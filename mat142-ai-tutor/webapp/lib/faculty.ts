import type { SupabaseClient, User } from '@supabase/supabase-js';

/** Dashboard membership is granted by the privileged email allowlist. */
export async function findActiveFaculty(
  admin: SupabaseClient,
  user: Pick<User, 'id' | 'email'>,
): Promise<{ id: string; email: string } | null> {
  const email = user.email?.trim().toLowerCase();
  if (!email) return null;

  const { data, error } = await admin
    .from('allowed_faculty')
    .select('email')
    .eq('email', email)
    .maybeSingle();

  if (error) {
    console.error('[faculty] role lookup failed', error);
    return null;
  }
  return data ? { id: user.id, email: data.email } : null;
}
