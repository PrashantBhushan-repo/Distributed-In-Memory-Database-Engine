import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import { environmentBoolean } from './boolean.js';

// Automatically detect and load appropriate .env file based on NODE_ENV
const nodeEnv = process.env.NODE_ENV || 'development';
const envFiles = [
  path.resolve(process.cwd(), `.env.${nodeEnv}.local`),
  path.resolve(process.cwd(), `.env.${nodeEnv}`),
  path.resolve(process.cwd(), '.env.local'),
  path.resolve(process.cwd(), '.env'),
  // Root workspace lookups for monorepo development
  path.resolve(process.cwd(), `../../.env.${nodeEnv}`),
  path.resolve(process.cwd(), '../../.env'),
];

for (const envFile of envFiles) {
  if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile });
    break;
  }
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1024).max(65535).default(4000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  PUBLIC_DOMAIN: z.string().default('pbredisdb.pburls.online'),
  REDIS_HOST: z.string().default('127.0.0.1'),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
  REDIS_PASSWORD: z.string().default(''),
  REDIS_TLS: environmentBoolean.default(false),
  STUDIO_PLAYGROUND: environmentBoolean.default(false),
  DEMO_MODE: environmentBoolean.default(false),
  DEMO_FALLBACK: environmentBoolean.default(false),
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters for cryptographically safe HS256 tokens')
    .default('redisx-studio-super-secure-production-secret-key-32chars!'),
  ADMIN_PASS: z.string().min(6).default('admin123'),
  OPERATOR_PASS: z.string().min(6).default('operator123'),
  VIEWER_PASS: z.string().min(6).default('viewer123'),
  CORS_ORIGIN: z.string().default('http://localhost:3000,http://127.0.0.1:3000,https://pbredisdb.pburls.online'),
  METRICS_PORT: z.coerce.number().default(9121),
  PROMETHEUS_PORT: z.coerce.number().default(9090),
  GRAFANA_PORT: z.coerce.number().default(3002),
});

export type EnvConfig = z.infer<typeof EnvSchema>;

function validateEnv(): EnvConfig {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    console.error('\n================================================================');
    console.error('❌ FATAL: ENVIRONMENT CONFIGURATION VALIDATION FAILED');
    console.error('================================================================');
    const issues = result.error.format();
    for (const [key, val] of Object.entries(issues)) {
      if (key !== '_errors' && val && typeof val === 'object' && '_errors' in val) {
        console.error(`  👉 Variable: ${key} -> ${(val as any)._errors.join(', ')}`);
      }
    }
    console.error('================================================================\n');
    process.exit(1);
  }
  return Object.freeze(result.data);
}

export const env = validateEnv();
