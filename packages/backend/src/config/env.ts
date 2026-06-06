import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) {
    throw new Error(`Eksik ortam değişkeni: ${name}`);
  }
  return v;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000', 10),
  DATABASE_URL: required('DATABASE_URL', 'postgresql://localhost:5432/finanstakip'),
  JWT_SECRET: required('JWT_SECRET', 'dev-access-secret-change-me-please-32chars'),
  JWT_REFRESH_SECRET: required('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me-please-32chars'),
  JWT_ACCESS_EXPIRES: process.env.JWT_ACCESS_EXPIRES || '15m',
  JWT_REFRESH_EXPIRES: process.env.JWT_REFRESH_EXPIRES || '7d',
  APP_NAME: process.env.APP_NAME || 'FinansTakip',
  APP_DOMAIN: process.env.APP_DOMAIN || 'http://localhost:5173',
  TRIAL_DAYS: parseInt(process.env.TRIAL_DAYS || '7', 10),
  UPLOAD_DIR: process.env.UPLOAD_DIR || './uploads',
  MAX_UPLOAD_MB: parseInt(process.env.MAX_UPLOAD_MB || '10', 10),
  SEED_ADMIN_EMAIL: process.env.SEED_ADMIN_EMAIL || 'admin@diljar.com',
  SEED_ADMIN_PASSWORD: process.env.SEED_ADMIN_PASSWORD || 'Admin1234!',
  SEED_ADMIN_NAME: process.env.SEED_ADMIN_NAME || 'Platform Yöneticisi',
  isProd: (process.env.NODE_ENV || 'development') === 'production',
};
