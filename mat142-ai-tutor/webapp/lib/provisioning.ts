import type { SupabaseClient } from '@supabase/supabase-js';
import type { RosterEntry } from './roster';
import { newPassword } from './passwords';

/**
 * Creating the fifteen sign-ins.
 *
 * Two things have to be true before a student can sign in: their address is on
 * `allowed_students`, and an account exists for it with a password somebody can
 * tell them. Doing those in two separate places is how one gets done and the
 * other does not, so they are done together, from one pasted list.
 *
 * An account that already exists is left alone unless a new password is asked
 * for explicitly. Re-running this after adding two names to the list must not
 * silently change the passwords of the thirteen students already using it.
 *
 * The student row in `public.students` is deliberately *not* written here.
 * That row is created at first sign-in, and the professor's dashboard reads
 * its absence as "invited, has not signed in yet" — which is a thing worth
 * knowing on Monday afternoon.
 */

export type ProvisionStatus = 'created' | 'password-reset' | 'already-set-up' | 'failed';

export interface ProvisionResult {
  email: string;
  displayName: string | null;
  /** Set only when a password was just generated; never read back afterwards. */
  password: string | null;
  status: ProvisionStatus;
  detail?: string;
}

export interface ProvisionOptions {
  /** Replace the password of accounts that already exist. Off by default. */
  resetExisting?: boolean;
}

/** Supabase pages its user list; read every page or the last student vanishes. */
async function existingUsersByEmail(admin: SupabaseClient): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  const perPage = 200;

  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Could not read the existing accounts: ${error.message}`);

    const users = data?.users ?? [];
    for (const user of users) {
      const email = user.email?.trim().toLowerCase();
      if (email) found.set(email, user.id);
    }

    if (users.length < perPage) return found;
  }
}

export async function provisionStudents(
  admin: SupabaseClient,
  entries: RosterEntry[],
  options: ProvisionOptions = {},
): Promise<ProvisionResult[]> {
  if (entries.length === 0) return [];

  // The allow-list first. If this fails nothing else should be attempted:
  // an account whose address is not allow-listed is signed straight back out,
  // so handing out its password would waste somebody's Monday.
  const { error: allowError } = await admin.from('allowed_students').upsert(
    entries.map((entry) => ({ email: entry.email, display_name: entry.displayName })),
    { onConflict: 'email' },
  );

  if (allowError) {
    throw new Error(`Could not update the pilot list: ${allowError.message}`);
  }

  const existing = await existingUsersByEmail(admin);
  const results: ProvisionResult[] = [];

  for (const entry of entries) {
    const known = existing.get(entry.email);

    if (known && !options.resetExisting) {
      results.push({
        email: entry.email,
        displayName: entry.displayName,
        password: null,
        status: 'already-set-up',
        detail: 'This address already has an account. Its password was left as it is.',
      });
      continue;
    }

    const password = newPassword();

    if (known) {
      const { error } = await admin.auth.admin.updateUserById(known, { password });
      results.push(
        error
          ? {
              email: entry.email,
              displayName: entry.displayName,
              password: null,
              status: 'failed',
              detail: error.message,
            }
          : {
              email: entry.email,
              displayName: entry.displayName,
              password,
              status: 'password-reset',
            },
      );
      continue;
    }

    // `email_confirm` is what makes this work without a mail sender: the
    // address is marked confirmed here rather than by the student clicking a
    // link in an email nobody can send.
    const { error } = await admin.auth.admin.createUser({
      email: entry.email,
      password,
      email_confirm: true,
      user_metadata: entry.displayName ? { full_name: entry.displayName } : undefined,
    });

    results.push(
      error
        ? {
            email: entry.email,
            displayName: entry.displayName,
            password: null,
            status: 'failed',
            detail: error.message,
          }
        : {
            email: entry.email,
            displayName: entry.displayName,
            password,
            status: 'created',
          },
    );
  }

  return results;
}
