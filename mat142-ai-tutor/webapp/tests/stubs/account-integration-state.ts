import type { SupabaseClient } from '@supabase/supabase-js';

export const accountIntegrationState: {
  admin: SupabaseClient | null;
  user: { id: string; email: string } | null;
  holdModel: Promise<void> | null;
  modelFails: boolean;
  failComplete: boolean;
  failFinalize: boolean;
  tutorCalls: number;
} = {
  admin: null,
  user: null,
  holdModel: null,
  modelFails: false,
  failComplete: false,
  failFinalize: false,
  tutorCalls: 0,
};
