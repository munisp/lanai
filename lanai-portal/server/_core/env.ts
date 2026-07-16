/**
 * Environment configuration with strict validation.
 * In production, all required variables must be set or the server will refuse to start.
 */

function requireEnv(key: string, fallback?: string): string {
  const val = process.env[key] ?? fallback;
  if (!val && process.env.NODE_ENV === "production") {
    throw new Error(
      `[env] Missing required environment variable: ${key}\n` +
      `Please set ${key} in your .env file or deployment environment.`
    );
  }
  return val ?? "";
}

function requireEnvInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (isNaN(n)) {
    throw new Error(`[env] Environment variable ${key} must be an integer, got: ${raw}`);
  }
  return n;
}

export const ENV = {
  // ── Core ──────────────────────────────────────────────────────────────────
  appId:          process.env.VITE_APP_ID ?? "",
  cookieSecret:   requireEnv("JWT_SECRET", "dev-secret-change-in-production"),
  databaseUrl:    requireEnv("DATABASE_URL", ""),
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId:    process.env.OWNER_OPEN_ID ?? "",
  isProduction:   process.env.NODE_ENV === "production",
  port:           requireEnvInt("PORT", 3001),

  // ── AI / LLM ──────────────────────────────────────────────────────────────
  forgeApiUrl:    process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey:    process.env.BUILT_IN_FORGE_API_KEY ?? "",

  // ── Email (Resend) ────────────────────────────────────────────────────────
  resendApiKey:   process.env.RESEND_API_KEY ?? "",
  fromEmail:      process.env.FROM_EMAIL ?? "Lanai Lifestyle <onboarding@resend.dev>",

  // ── Payments (Stripe) ─────────────────────────────────────────────────────
  stripeSecretKey:      process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret:  process.env.STRIPE_WEBHOOK_SECRET ?? "",

  // ── CRM (Twenty) ──────────────────────────────────────────────────────────
  twentyCrmUrl:        process.env.TWENTY_CRM_URL ?? "",
  twentyCrmApiToken:   process.env.TWENTY_CRM_API_TOKEN ?? "",

  // ── Chatwoot ──────────────────────────────────────────────────────────────
  chatwootUrl:          process.env.CHATWOOT_URL ?? "",
  chatwootToken:        process.env.CHATWOOT_TOKEN ?? process.env.CHATWOOT_ACCESS_TOKEN ?? "",
  chatwootAccountId:    requireEnvInt("CHATWOOT_ACCOUNT_ID", 1),
  chatwootSiteScriptId: process.env.CHATWOOT_SITE_SCRIPT_ID ?? "",

  // ── Redis (session store / cache) ─────────────────────────────────────────
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",

  // ── Rate limiting ─────────────────────────────────────────────────────────
  rateLimitWindowMs:  requireEnvInt("RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000),
  rateLimitMax:       requireEnvInt("RATE_LIMIT_MAX", 300),
  authRateLimitMax:   requireEnvInt("AUTH_RATE_LIMIT_MAX", 20),

  // ── CORS ──────────────────────────────────────────────────────────────────
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "").split(",").filter(Boolean),
};

// Validate critical vars in production at startup
if (ENV.isProduction) {
  const critical = ["JWT_SECRET", "DATABASE_URL"];
  const missing = critical.filter(k => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`[env] Critical environment variables missing: ${missing.join(", ")}`);
  }
  if (ENV.cookieSecret === "dev-secret-change-in-production") {
    throw new Error("[env] JWT_SECRET must be changed from the default in production!");
  }
}
