import type { SupabaseClient, User } from '@supabase/supabase-js';

/** Faculty membership is granted only by a privileged database administrator. */
export async function findActiveFaculty(
  admin: SupabaseClient,
  user: Pick<User, 'id' | 'email'>,
): Promise<{ id: string; email: string } | null> {
  const email = user.email?.trim().toLowerCase();
  if (!email) return null;

  const { data, error } = await admin
    .from('faculty')
    .select('id, email')
    .eq('id', user.id)
    .eq('email', email)
    .maybeSingle();

  if (error) {
    console.error('[faculty] role lookup failed', error);
    return null;
  }
  return data ? { id: data.id, email: data.email } : null;
}
