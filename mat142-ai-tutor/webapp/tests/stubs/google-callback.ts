export const callbackState = {
  email: 'existing@gmail.com',
  signOuts: 0,
  deletions: 0,
  adminClients: 0,
  studentWrites: 0,
  verified: true,
  method: 'oauth',
};

export const NextResponse = {
  redirect(url: string) {
    return { status: 307, headers: new Headers({ location: url }) };
  },
};

export function isSoloMode() { return false; }
export async function findActiveFaculty() { return null; }
export async function createClient() {
  return {
    auth: {
      async exchangeCodeForSession() {
        return { data: { user: { id: 'existing-user', email: callbackState.email,
          identities: [{ provider: 'google', identity_data: {
            email: callbackState.email, email_verified: callbackState.verified,
          } }], user_metadata: { full_name: 'Test Student' } },
          session: { access_token: 'test-token' } }, error: null };
      },
      async getClaims() {
        return { data: { claims: { email: callbackState.email,
          amr: [{ method: callbackState.method }] } }, error: null };
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
