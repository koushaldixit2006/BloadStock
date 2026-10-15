import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform((val) => parseInt(val, 10)).default('3001'),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/bloodstock?replicaSet=rs0'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters').default('super-secret-jwt-access-token-key-32chars-min!'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters').default('super-secret-jwt-refresh-token-key-32chars-min!'),
  INTERNAL_SECRET: z.string().min(16, 'INTERNAL_SECRET must be at least 16 characters').default('bloodstock-dev-secret-key-32chars-min'),
  OPTIMIZER_URL: z.string().url().default('http://127.0.0.1:8000'),
  SHARED_RULES_PATH: z.string().default(path.resolve(__dirname, '../../../../shared/rules.json')),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ FATAL: Invalid or missing environment configuration:');
  console.error(JSON.stringify(parsedEnv.error.format(), null, 2));
  throw new Error('Invalid environment configuration');
}

export const config = {
  nodeEnv: parsedEnv.data.NODE_ENV,
  port: parsedEnv.data.PORT,
  mongodbUri: parsedEnv.data.MONGODB_URI,
  jwtAccessSecret: parsedEnv.data.JWT_ACCESS_SECRET,
  jwtRefreshSecret: parsedEnv.data.JWT_REFRESH_SECRET,
  internalSecret: parsedEnv.data.INTERNAL_SECRET,
  optimizerUrl: parsedEnv.data.OPTIMIZER_URL,
  sharedRulesPath: parsedEnv.data.SHARED_RULES_PATH,
  corsOrigin: parsedEnv.data.CORS_ORIGIN,
};

export type AppConfig = typeof config;
