import dotenv from 'dotenv';

dotenv.config();

export const env = {
  // Application
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000', 10),
  API_PREFIX: process.env.API_PREFIX || '/api/v1',

  // Database
  DATABASE_URL: process.env.DATABASE_URL || '',
  DIRECT_URL: process.env.DIRECT_URL || process.env.DATABASE_URL || '',

  // Authentication
  JWT_SECRET: process.env.JWT_SECRET || 'development-secret-change-in-production',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
  BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),

  // Security
  CORS_ORIGINS: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),

  // SePay Webhook
  SEPAY_WEBHOOK_SECRET: process.env.SEPAY_WEBHOOK_SECRET || '',
  SEPAY_ALLOWED_IPS: process.env.SEPAY_ALLOWED_IPS || '',

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  LOG_FORMAT: process.env.LOG_FORMAT || 'json',

  // Cron Jobs
  CRON_ENABLED: process.env.CRON_ENABLED === 'true',
  CRON_TIMEZONE: process.env.CRON_TIMEZONE || 'Asia/Ho_Chi_Minh',

  // Fraud Detection
  FRAUD_ALERT_THRESHOLD: parseInt(process.env.FRAUD_ALERT_THRESHOLD || '5000000', 10),
  MAX_TRANSACTION_AMOUNT: parseInt(process.env.MAX_TRANSACTION_AMOUNT || '100000000', 10),
  DAILY_WITHDRAWAL_LIMIT: parseInt(process.env.DAILY_WITHDRAWAL_LIMIT || '50000000', 10),

  // Helpers
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
} as const;

// Validate required environment variables in production
export function validateEnv(): void {
  const required: (keyof typeof env)[] = ['DATABASE_URL', 'JWT_SECRET'];

  if (env.isProduction) {
    required.push('SEPAY_WEBHOOK_SECRET');
  }

  const missing = required.filter((key) => !env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if (env.isProduction && env.JWT_SECRET === 'development-secret-change-in-production') {
    throw new Error('JWT_SECRET must be changed in production');
  }
}
