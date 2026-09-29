export const callbackState = {
  email: 'existing@gmail.com',
  signOuts: 0,
  deletions: 0,
  adminClients: 0,
  studentWrites: 0,
  allowed: false,
};

export const NextResponse = {
  redirect(url: string) {
    return { status: 307, headers: new Headers({ location: url }) };
  },
};

export function isSoloMode() { return false; }
export async function findActiveFaculty() { return null; }
export async function findAllowedStudent() {
  return callbackState.allowed
    ? { email: callbackState.email, display_name: null }
    : null;
}

export async function createClient() {
  return {
    auth: {
      async exchangeCodeForSession() {
        return { data: { user: { id: 'existing-user', email: callbackState.email } }, error: null };
      },
      async signOut() {
        callbackState.signOuts++;
        return { error: null };
      },
    },
  };
}

export function createAdminClient() {
  callbackState.adminClients++;
  return {
    auth: {
      admin: {
        async deleteUser() {
          callbackState.deletions++;
          return { error: null };
        },
      },
    },
    from() {
      return {
        async upsert() {
          callbackState.studentWrites++;
          return { error: null };
        },
      };
    },
  };
}
