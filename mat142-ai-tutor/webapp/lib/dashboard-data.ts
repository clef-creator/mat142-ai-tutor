import type { SupabaseClient } from '@supabase/supabase-js';
import type { DashboardAllowedStudent, DashboardProgress, DashboardSession, DashboardStudent } from './dashboard';

const PAGE_SIZE = 1000;

/** Read every page so a growing term never silently truncates the dashboard. */
async function allRows<T>(
  page: (from: number, to: number) => Promise<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Dashboard data unavailable: ${error.message}`);
    rows.push(...(data ?? []) as T[]);
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

/** Uses the signed-in faculty client and its RLS policies, never the service role. */
export async function loadDashboardRows(supabase: SupabaseClient) {
  const [allowedStudents, students, progress, sessions] = await Promise.all([
    allRows<DashboardAllowedStudent>(async (from, to) => {
      const { data, error } = await supabase.from('allowed_students')
        .select('email, display_name').order('email').range(from, to);
      return { data, error };
    }),
    allRows<DashboardStudent>(async (from, to) => {
      const { data, error } = await supabase.from('students')
        .select('id, email, display_name').order('id').range(from, to);
      return { data, error };
    }),
    allRows<DashboardProgress>(async (from, to) => {
      const { data, error } = await supabase.from('progress')
        .select('student_id, topic_id, status').order('student_id').order('topic_id').range(from, to);
      return { data, error };
    }),
    allRows<DashboardSession>(async (from, to) => {
      const { data, error } = await supabase.from('sessions')
        .select('id, student_id, topic_id, started_at, ended_at, outcome, asked_for_answers')
        .order('id').range(from, to);
      return { data, error };
    }),
  ]);
  return { allowedStudents, students, progress, sessions };
}
