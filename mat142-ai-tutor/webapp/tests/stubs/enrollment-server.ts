import { enrollmentTestState } from './enrollment-state';

class Query {
  private filters = new Map<string, unknown>();

  constructor(private readonly table: string) {}

  select() { return this; }

  eq(column: string, value: unknown) {
    this.filters.set(column, value);
    return this;
  }

  async maybeSingle() {
    if (this.table === 'allowed_students') {
      if (enrollmentTestState.allowedLookupError) {
        return { data: null, error: new Error('database unavailable') };
      }
      return {
        data: enrollmentTestState.allowed
          ? { email: 'student@ahduni.edu.in', display_name: 'Test Student' }
          : null,
        error: null,
      };
    }

    if (this.table === 'students') {
      const matchesIdentity =
        this.filters.get('id') === enrollmentTestState.user.id &&
        this.filters.get('email') === 'student@ahduni.edu.in';
      return {
        data: matchesIdentity
          ? { id: enrollmentTestState.user.id, email: 'student@ahduni.edu.in', display_name: 'Test Student' }
          : null,
        error: null,
      };
    }

    if (this.table === 'sessions') {
      return {
        data: { id: enrollmentTestState.existingSessionId, student_id: enrollmentTestState.user.id },
        error: null,
      };
    }

    return { data: null, error: null };
  }
}

export async function createClient() {
  return {
    auth: {
      async getUser() {
        return { data: { user: enrollmentTestState.user }, error: null };
      },
    },
  };
}

export function createAdminClient() {
  return {
    from(table: string) {
      enrollmentTestState.tablesRead.push(table);
      return new Query(table);
    },
  };
}
