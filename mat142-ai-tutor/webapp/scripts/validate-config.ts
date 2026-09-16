import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateDeploymentConfig } from '../lib/deployment-config';

const envFile = process.argv[2];
if (envFile) {
  const resolved = resolve(envFile);
  if (!existsSync(resolved)) {
    console.error(`Configuration file not found: ${resolved}`);
    process.exit(1);
  }
  process.loadEnvFile(resolved);
}

const result = validateDeploymentConfig(process.env);
console.log(`Deployment mode: ${result.mode}`);
result.warnings.forEach((warning) => console.warn(`WARN  ${warning}`));
result.errors.forEach((error) => console.error(`ERROR ${error}`));

if (result.errors.length > 0) {
  console.error(`Configuration is invalid (${result.errors.length} error(s)).`);
  process.exit(1);
}

console.log('Configuration is valid.');
