/**
 * Runtime configuration. Values required to make a network call are validated by
 * their adapter; production startup validates the platform's mandatory surface.
 */
function requireEnv(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`[env] Missing required environment variable: ${key}`);
  }
  return value ?? "";
}

function requireEnvInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value))
    throw new Error(`[env] ${key} must be an integer`);
  return value;
}

function requireEnvBoolean(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(`[env] ${key} must be true or false`);
}

const keycloakRealm = process.env.KEYCLOAK_REALM ?? "lanai";
const keycloakIssuerUrl =
  process.env.KEYCLOAK_ISSUER_URL ??
  (process.env.OAUTH_SERVER_URL
    ? `${process.env.OAUTH_SERVER_URL.replace(/\/$/, "")}/realms/${keycloakRealm}`
    : "");

export const ENV = {
  // Core
  appId: process.env.VITE_APP_ID ?? process.env.KEYCLOAK_CLIENT_ID ?? "",
  cookieSecret: requireEnv("JWT_SECRET", "dev-secret-change-in-production"),
  databaseUrl: requireEnv("DATABASE_URL", ""),
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  port: requireEnvInt("PORT", 3001),

  // Keycloak / OpenID Connect
  keycloakRealm,
  keycloakIssuerUrl,
  keycloakInternalIssuerUrl:
    process.env.KEYCLOAK_INTERNAL_ISSUER_URL ?? keycloakIssuerUrl,
  // Transitional alias consumed only until the legacy SDK is replaced by the
  // Keycloak-authoritative implementation in this change set.
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  keycloakClientId: process.env.KEYCLOAK_CLIENT_ID ?? "",
  keycloakClientSecret: process.env.KEYCLOAK_CLIENT_SECRET ?? "",
  keycloakAdminClientId: process.env.KEYCLOAK_ADMIN_CLIENT_ID ?? "",
  keycloakAdminClientSecret: process.env.KEYCLOAK_ADMIN_CLIENT_SECRET ?? "",
  keycloakRedirectUri: process.env.KEYCLOAK_REDIRECT_URI ?? "",

  // AI / application services
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  aiGatewayUrl: process.env.AI_GATEWAY_URL ?? "",
  aiGatewayToken: process.env.AI_GATEWAY_TOKEN ?? "",
  aiModel: process.env.OLLAMA_MODEL ?? "qwen2.5:3b",

  // Email / payments / CRM / Chatwoot
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  fromEmail: process.env.FROM_EMAIL ?? "",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  twentyCrmUrl: process.env.TWENTY_CRM_URL ?? "",
  twentyCrmApiToken: process.env.TWENTY_CRM_API_TOKEN ?? "",
  twentyCrmSyncEnabled: requireEnvBoolean("TWENTY_CRM_SYNC_ENABLED", false),
  twentyCrmWebhookSecret: process.env.TWENTY_CRM_WEBHOOK_SECRET ?? "",
  twentyCrmMetadataBasePath:
    process.env.TWENTY_CRM_METADATA_BASE_PATH ?? "/rest/metadata",
  twentyCrmCoreApiBasePath:
    process.env.TWENTY_CRM_CORE_API_BASE_PATH ?? "/rest",
  twentyCrmMetadataBootstrapEnabled: requireEnvBoolean(
    "TWENTY_CRM_METADATA_BOOTSTRAP_ENABLED",
    false,
  ),
  chatwootUrl: process.env.CHATWOOT_URL ?? "",
  chatwootToken:
    process.env.CHATWOOT_TOKEN ?? process.env.CHATWOOT_ACCESS_TOKEN ?? "",
  chatwootAccountId: requireEnvInt("CHATWOOT_ACCOUNT_ID", 1),
  chatwootSiteScriptId: process.env.CHATWOOT_SITE_SCRIPT_ID ?? "",

  // Cache and distributed service mesh
  redisUrl: process.env.REDIS_URL ?? "",
  redisConnectTimeoutMs: requireEnvInt("REDIS_CONNECT_TIMEOUT_MS", 5_000),
  daprHost: process.env.DAPR_HOST ?? "127.0.0.1",
  daprHttpPort: process.env.DAPR_HTTP_PORT ?? "3500",
  daprApiToken: process.env.DAPR_API_TOKEN ?? "",
  daprStateStore: process.env.DAPR_STATE_STORE ?? "statestore",

  // Authorization
  permifyGrpcAddress: process.env.PERMIFY_GRPC_ADDRESS ?? "",
  permifyTenantId: process.env.PERMIFY_TENANT_ID ?? "lanai",
  permifySchemaVersion: process.env.PERMIFY_SCHEMA_VERSION ?? "",
  permifyInsecure: requireEnvBoolean("PERMIFY_INSECURE", true),
  permifyTimeoutMs: requireEnvInt("PERMIFY_TIMEOUT_MS", 5_000),

  // Ledger
  tigerBeetleAddress: process.env.TIGERBEETLE_ADDRESS ?? "",
  tigerBeetleClusterId: requireEnvInt("TIGERBEETLE_CLUSTER_ID", 0),
  tigerBeetleLedger: requireEnvInt("TIGERBEETLE_LEDGER", 1),
  tigerBeetleTransferCode: requireEnvInt("TIGERBEETLE_TRANSFER_CODE", 1),

  // Durable workflow and streaming
  temporalAddress: process.env.TEMPORAL_ADDRESS ?? "",
  temporalNamespace: process.env.TEMPORAL_NAMESPACE ?? "default",
  temporalTaskQueue: process.env.TEMPORAL_TASK_QUEUE ?? "lanai-workflows",
  fluvioEndpoint: process.env.FLUVIO_ENDPOINT ?? "",

  // Gateway / security and lakehouse
  apisixAdminUrl: process.env.APISIX_ADMIN_URL ?? "",
  apisixAdminKey: process.env.APISIX_ADMIN_KEY ?? "",
  openAppSecHealthUrl: process.env.OPENAPPSEC_HEALTH_URL ?? "",
  lakehouseIngestUrl: process.env.LAKEHOUSE_INGEST_URL ?? "",
  lakehouseIngestToken: process.env.LAKEHOUSE_INGEST_TOKEN ?? "",

  // HTTP policy
  rateLimitWindowMs: requireEnvInt("RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000),
  rateLimitMax: requireEnvInt("RATE_LIMIT_MAX", 300),
  authRateLimitMax: requireEnvInt("AUTH_RATE_LIMIT_MAX", 20),
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
};

if (ENV.isProduction) {
  const required = [
    "DATABASE_URL",
    "JWT_SECRET",
    "KEYCLOAK_ISSUER_URL",
    "KEYCLOAK_CLIENT_ID",
    "REDIS_URL",
    "PERMIFY_GRPC_ADDRESS",
    "TIGERBEETLE_ADDRESS",
    "TEMPORAL_ADDRESS",
    "FLUVIO_ENDPOINT",
    "DAPR_API_TOKEN",
    "APISIX_ADMIN_URL",
    "APISIX_ADMIN_KEY",
    "LAKEHOUSE_INGEST_URL",
    "LAKEHOUSE_INGEST_TOKEN",
  ];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0)
    throw new Error(
      `[env] Production configuration missing: ${missing.join(", ")}`,
    );
  if (ENV.cookieSecret === "dev-secret-change-in-production")
    throw new Error("[env] JWT_SECRET must not use the development default");
  if (ENV.twentyCrmSyncEnabled) {
    const crmRequired = [
      "TWENTY_CRM_URL",
      "TWENTY_CRM_API_TOKEN",
      "TWENTY_CRM_WEBHOOK_SECRET",
    ];
    const crmMissing = crmRequired.filter((key) => !process.env[key]);
    if (crmMissing.length > 0)
      throw new Error(
        `[env] CRM synchronization enabled but missing: ${crmMissing.join(", ")}`,
      );
  }
}
