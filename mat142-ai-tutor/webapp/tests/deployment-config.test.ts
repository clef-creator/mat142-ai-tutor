import { validateDeploymentConfig } from '@/lib/deployment-config';

let failures = 0;
function check(name: string, condition: boolean, detail = '') {
  if (!condition) {
    failures += 1;
    console.log(`FAIL  ${name}${detail ? ' :: ' + detail : ''}`);
  } else {
    console.log(`ok    ${name}`);
  }
}

const common = {
  ANTHROPIC_API_KEY: 'secret-test-key',
  TUTOR_MODEL: 'tutor-model',
  SUMMARY_MODEL: 'summary-model',
  MAX_TURNS_PER_SESSION: '40',
  MAX_SESSIONS_PER_DAY: '6',
};

const solo = validateDeploymentConfig({ ...common, ACCESS_CODE: 'a-long-demo-code' });
check('a complete solo configuration is valid', solo.mode === 'solo' && solo.errors.length === 0);

const accountEnv = {
  ...common,
  NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-test-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-test-key',
  NEXT_PUBLIC_SITE_URL: 'https://calcu-buddy.example.edu',
  ALLOWED_EMAIL_DOMAIN: 'ahduni.edu.in',
  NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN: 'ahduni.edu.in',
};
const account = validateDeploymentConfig(accountEnv);
check('a complete account configuration is valid', account.mode === 'account' && account.errors.length === 0);

const partial = validateDeploymentConfig({ ...common, NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co' });
check('partial Supabase configuration is rejected', partial.errors.some((e) => e.includes('ANON_KEY')));

const mismatchedDomains = validateDeploymentConfig({
  ...accountEnv,
  NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN: 'example.edu',
});
check('client and server email domains must match', mismatchedDomains.errors.some((e) => e.includes('must match')));

const insecureProduction = validateDeploymentConfig({
  ...accountEnv,
  NEXT_PUBLIC_SITE_URL: 'http://calcu-buddy.example.edu',
});
check('production origins require HTTPS', insecureProduction.errors.some((e) => e.includes('HTTPS')));

const placeholder = validateDeploymentConfig({ ...common, ACCESS_CODE: 'demo', ANTHROPIC_API_KEY: 'sk-ant-...' });
check('example secret placeholders are rejected', placeholder.errors.some((e) => e.includes('placeholder')));

const sameKeys = validateDeploymentConfig({
  ...accountEnv,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'same-key',
  SUPABASE_SERVICE_ROLE_KEY: 'same-key',
});
check('the service-role key cannot be exposed as the anon key', sameKeys.errors.some((e) => e.includes('must be different')));

const invalidLimit = validateDeploymentConfig({ ...common, ACCESS_CODE: 'a-long-demo-code', MAX_TURNS_PER_SESSION: '0' });
check('limits must be positive integers', invalidLimit.errors.some((e) => e.includes('positive integer')));

const shortSetupToken = validateDeploymentConfig({ ...accountEnv, STUDENT_SETUP_TOKEN: 'too-short' });
check(
  'a guessable setup token is rejected outright',
  shortSetupToken.errors.some((e) => e.includes('STUDENT_SETUP_TOKEN')),
);

const setupTokenSet = validateDeploymentConfig({
  ...accountEnv,
  STUDENT_SETUP_TOKEN: 'a-long-enough-setup-token',
});
check(
  'leaving the account-creating page open is worth a warning',
  setupTokenSet.errors.length === 0 &&
    setupTokenSet.warnings.some((w) => w.includes('STUDENT_SETUP_TOKEN')),
);

if (failures > 0) process.exit(1);
