/** RLS must reject a university password account, even with legacy roster data. */
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { localSupabase } from './local-supabase';

const { url, anonKey, serviceKey } = localSupabase();
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const student = createClient(url, anonKey, { auth: { persistSession: false } });
const email = `domain-test-${crypto.randomUUID()}@ahduni.edu.in`;
const password = `Test-${crypto.randomUUID()}!`;
let userId: string | undefined;

async function run() {
  try {
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw created.error ?? new Error('User creation failed');
    userId = created.data.user.id;
    const enrolled = await admin.from('students').insert({ id: userId, email });
    if (enrolled.error) throw enrolled.error;
    const legacy = await admin.from('allowed_students').insert({ email });
    if (legacy.error) throw legacy.error;

    const signedIn = await student.auth.signInWithPassword({ email, password });
    if (signedIn.error) throw signedIn.error;
    assert.equal(signedIn.data.user?.id, userId);
    const read = await student.from('students').select('id').eq('id', userId);
    if (read.error) throw read.error;
    assert.deepEqual(read.data, [], 'password sessions cannot read student data');
    console.log('University password account and legacy list cannot bypass Google-only RLS.');
  } finally {
    await student.auth.signOut();
    if (userId) await admin.auth.admin.deleteUser(userId);
    await admin.from('allowed_students').delete().eq('email', email);
  }
}

void run().catch((error) => { console.error(error); process.exitCode = 1; });
