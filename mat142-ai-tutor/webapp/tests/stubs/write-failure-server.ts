import { writeFailureState as state } from './write-failure-state';

class Query {
  private action = 'read';
  private filters = new Map<string, unknown>();
  private countOnly = false;

  constructor(private readonly table: string) {}
  select(_columns?: string, options?: { head?: boolean }) {
    this.countOnly = options?.head ?? false;
    return this;
  }
  eq(column: string, value: unknown) { this.filters.set(column, value); return this; }
  is() { return this; }
  not() { return this; }
  gte() { return this; }
  order() { return this; }
  limit() { return this; }
  insert() { this.action = 'insert'; return this; }
  delete() { this.action = 'delete'; return this; }
  update() { this.action = 'update'; return this; }
  upsert() {
    return Promise.resolve({ data: null,
      error: state.progressWriteFails ? new Error('progress write failed') : null });
  }
  private execute() {
    if (this.table === 'sessions') {
      if (this.action === 'delete') {
        state.deletedFailedStart = true;
        return { data: null, error: null };
      }
      if (this.action === 'insert') return { data: { id: state.sessionId }, error: null };
      if (this.countOnly) return { data: null, count: 0, error: null };
      if (this.filters.has('id')) {
        return { data: { id: state.sessionId, topic_id: 'what-is-a-function',
          student_id: state.userId, ended_at: null }, error: null };
      }
      return { data: null, error: null };
    }
    if (this.table === 'messages') {
      return state.historyReadFails
        ? { data: null, error: new Error('history read failed') }
        : { data: [{ role: 'assistant', content: 'Saved reply' }], error: null };
    }
    if (this.table === 'chat_turns') return { data: { status: 'completed', lease_until: null }, error: null };
    if (this.table === 'progress') return { data: [], error: null };
    return { data: null, error: null };
  }
  maybeSingle() { return Promise.resolve(this.execute()); }
  single() { return Promise.resolve(this.execute()); }
  then(resolve: (value: unknown) => unknown) { return Promise.resolve(this.execute()).then(resolve); }
}

export async function createClient() {
  return { auth: { async getUser() { return { data: { user: { id: state.userId } } }; } } };
}

export function createAdminClient() {
  return {
    from(table: string) { return new Query(table); },
    async rpc(name: string) {
      if (name === 'finalize_tutor_session') {
        return state.finalSaveFails
          ? { data: null, error: new Error('database write failed') }
          : { data: { status: 'completed' }, error: null };
      }
      return { data: null, error: new Error('unexpected RPC') };
    },
  };
}
