import { MIN_SETUP_TOKEN_LENGTH } from './setup-token';

export type DeploymentMode = 'solo' | 'account';

export type DeploymentConfigResult = {
  mode: DeploymentMode;
  errors: string[];
  warnings: string[];
};

type Environment = Record<string, string | undefined>;

const PLACEHOLDER = /(?:^<[^>]+>$|\.\.\.$|x{4,}|^your[-_])/i;

function value(env: Environment, name: string): string {
  return env[name]?.trim() ?? '';
}

function requireUsable(env: Environment, name: string, errors: string[]): string {
  const configured = value(env, name);
  if (!configured) {
    errors.push(`${name} is required.`);
  } else if (PLACEHOLDER.test(configured)) {
    errors.push(`${name} still contains an example placeholder.`);
  }
  return configured;
}

function validateOrigin(name: string, configured: string, errors: string[]) {
  if (!configured || PLACEHOLDER.test(configured)) return;

  try {
    const url = new URL(configured);
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
      errors.push(`${name} must use HTTPS outside local development.`);
    }
    if (url.pathname !== '/' || url.search || url.hash) {
      errors.push(`${name} must be an origin without a path, query or fragment.`);
    }
  } catch {
    errors.push(`${name} must be a valid absolute URL.`);
  }
}

function validatePositiveInteger(env: Environment, name: string, errors: string[]) {
  const configured = value(env, name);
  if (!configured) return;
  if (!/^\d+$/.test(configured) || Number(configured) < 1) {
    errors.push(`${name} must be a positive integer.`);
  }
}

/**
 * Validates a complete runtime environment without reading or printing secret
 * values. The app can still build without configuration; this is the explicit
 * pre-deployment gate used by operators.
 */
export function validateDeploymentConfig(env: Environment): DeploymentConfigResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  requireUsable(env, 'ANTHROPIC_API_KEY', errors);
  requireUsable(env, 'TUTOR_MODEL', errors);
  requireUsable(env, 'SUMMARY_MODEL', errors);

  const supabaseNames = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ] as const;
  const mode: DeploymentMode = supabaseNames.some((name) => Boolean(value(env, name)))
    ? 'account'
    : 'solo';

  if (mode === 'solo') {
    const accessCode = requireUsable(env, 'ACCESS_CODE', errors);
    if (accessCode && accessCode.length < 4) {
      errors.push('ACCESS_CODE must contain at least four characters.');
    } else if (accessCode && accessCode.length < 12) {
      warnings.push('ACCESS_CODE is valid but a longer shared code is safer.');
    }
  } else {
    const supabaseUrl = requireUsable(env, 'NEXT_PUBLIC_SUPABASE_URL', errors);
    const anonKey = requireUsable(env, 'NEXT_PUBLIC_SUPABASE_ANON_KEY', errors);
    const serviceKey = requireUsable(env, 'SUPABASE_SERVICE_ROLE_KEY', errors);
    const siteUrl = requireUsable(env, 'NEXT_PUBLIC_SITE_URL', errors);
    const serverDomain = requireUsable(env, 'ALLOWED_EMAIL_DOMAIN', errors).toLowerCase();
    const publicDomain = requireUsable(
      env,
      'NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN',
      errors,
    ).toLowerCase();

    validateOrigin('NEXT_PUBLIC_SUPABASE_URL', supabaseUrl, errors);
    validateOrigin('NEXT_PUBLIC_SITE_URL', siteUrl, errors);

    if (serverDomain && (serverDomain.includes('@') || /\s/.test(serverDomain))) {
      errors.push('ALLOWED_EMAIL_DOMAIN must be a bare domain such as ahduni.edu.in.');
    }
    if (publicDomain && serverDomain && publicDomain !== serverDomain) {
      errors.push('ALLOWED_EMAIL_DOMAIN and NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN must match.');
    }
    if (anonKey && serviceKey && anonKey === serviceKey) {
      errors.push('The Supabase anon key and service-role key must be different.');
    }
    if (value(env, 'ACCESS_CODE')) {
      warnings.push('ACCESS_CODE is ignored in account mode.');
    }

    // The page this token opens can create sign-ins and show their passwords,
    // so a short one is worse than none at all, and leaving it set for longer
    // than the afternoon it is needed is worth saying out loud.
    const setupToken = value(env, 'STUDENT_SETUP_TOKEN');
    if (setupToken && setupToken.length < MIN_SETUP_TOKEN_LENGTH) {
      errors.push(
        `STUDENT_SETUP_TOKEN must contain at least ${MIN_SETUP_TOKEN_LENGTH} characters.`,
      );
    } else if (setupToken) {
      warnings.push(
        'STUDENT_SETUP_TOKEN is set, so /setup can create accounts. Remove it once the students have signed in.',
      );
    }
  }

  validatePositiveInteger(env, 'MAX_TURNS_PER_SESSION', errors);
  validatePositiveInteger(env, 'MAX_SESSIONS_PER_DAY', errors);

  return { mode, errors, warnings };
}
