import { accountIntegrationState as state } from './account-integration-state';

export async function createClient() {
  return { auth: { async getUser() { return { data: { user: state.user } }; } } };
}

export function createAdminClient() {
  if (!state.admin) throw new Error('Integration database not configured');
  const admin = state.admin;
  return {
    from: (table: string) => admin.from(table),
    rpc: (name: string, args: Record<string, unknown>) => {
      if (name === 'complete_chat_turn' && state.failComplete) {
        return Promise.resolve({ data: null, error: new Error('injected database write failure') });
      }
      if (name === 'finalize_tutor_session' && state.failFinalize) {
        return Promise.resolve({ data: null, error: new Error('injected final save failure') });
      }
      return admin.rpc(name, args);
    },
  };
}
