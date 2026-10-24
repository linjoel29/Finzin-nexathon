// env.js - loads backend/.env and VALIDATES it once at startup.
// If something important is missing or unsafe, the server refuses to start
// (better than running half-configured with weak secrets).
require('dotenv').config();
const { z } = require('zod');

// Empty strings in .env (e.g. "GMAIL_USER=") count as "not set"
const emptyToUndefined = (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  // Postgres connection string (Supabase Session pooler)
  DATABASE_URL: z.string().min(10, 'DATABASE_URL is missing'),
  // Signing key for JWTs: long and random, or tokens can be forged
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  // The only website allowed to call this API from a browser (can be single origin or comma-separated list)
  CLIENT_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  // Email provider configuration (Brevo HTTPS for cloud / SMTP for local)
  EMAIL_PROVIDER: z.preprocess(emptyToUndefined, z.enum(['brevo', 'smtp']).default('smtp')),
  BREVO_API_KEY: optionalString,
  MAIL_FROM_EMAIL: optionalString,
  MAIL_FROM_NAME: z.preprocess(emptyToUndefined, z.string().default('Finzin Banking')),
  // Legacy / Local Gmail SMTP
  GMAIL_USER: optionalString,
  GMAIL_APP_PASSWORD: optionalString,
  // Demo-only fixed OTP: exactly 6 digits when set
  DEMO_OTP: z.preprocess(emptyToUndefined, z.string().regex(/^\d{6}$/, 'DEMO_OTP must be 6 digits').optional()),
  // Welcome credit in paise (integer, 0 to Rs 1,00,000)
  WELCOME_CREDIT_PAISE: z.coerce.number().int().min(0).max(10_000_000).default(500000),
  // AI coach (Groq API)
  GROQ_API_KEY: optionalString,
  GROQ_MODEL: z.string().default('llama-3.3-70b-versatile'),
  // Fallbacks / legacy compatibility
  XAI_API_KEY: optionalString,
  XAI_MODEL: optionalString,
  GEMINI_API_KEY: optionalString,
  GEMINI_MODEL: optionalString,
});

function loadEnv(source = process.env) {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    // Print which variables are wrong (names only, never their values)
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  const env = parsed.data;
  // Safety rule: a fixed OTP in production would let anyone log in as anyone
  if (env.NODE_ENV === 'production' && env.DEMO_OTP) {
    throw new Error('DEMO_OTP must not be set when NODE_ENV=production');
  }
  if (env.DEMO_OTP && env.NODE_ENV !== 'test') {
    console.warn('⚠️  [WARNING] DEMO_OTP is active! Anyone can log in with OTP code:', env.DEMO_OTP);
  }
  return env;
}

module.exports = { loadEnv };
