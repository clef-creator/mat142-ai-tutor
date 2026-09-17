import { execFileSync } from 'node:child_process';

/** Integration checks default to the disposable Supabase CLI project. */
export function localSupabase() {
  if (process.env.TEST_SUPABASE_URL && process.env.TEST_SUPABASE_ANON_KEY &&
      process.env.TEST_SUPABASE_SERVICE_ROLE_KEY) {
    if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(process.env.TEST_SUPABASE_URL)) {
      throw new Error('Integration checks may only run against local Supabase');
    }
    return {
      url: process.env.TEST_SUPABASE_URL,
      anonKey: process.env.TEST_SUPABASE_ANON_KEY,
      serviceKey: process.env.TEST_SUPABASE_SERVICE_ROLE_KEY,
    };
  }
  const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const output = execFileSync(executable, ['supabase', 'status', '-o', 'env'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  const values = new Map<string, string>();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (!match) continue;
    const raw = match[2].trim();
    values.set(match[1], raw.startsWith('"') ? JSON.parse(raw) as string : raw);
  }
  const url = values.get('API_URL');
  const anonKey = values.get('ANON_KEY');
  const serviceKey = values.get('SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey || !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(url)) {
    throw new Error('Start the local Supabase project before running integration checks');
  }
  return { url, anonKey, serviceKey };
}
