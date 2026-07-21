import crypto from "node:crypto";
import { createRequire } from "node:module";
import { DaprClient, HttpMethod } from "@dapr/dapr";

const require = createRequire(import.meta.url);

type FluvioClient = {
  topicProducer(topic: string): Promise<{
    send?: (key: string, value: string) => Promise<unknown>;
    sendRecord?: (value: string, partition: number) => Promise<unknown>;
  }>;
};
import * as permify from "@permify/permify-node";
import { Connection, Client as TemporalClient } from "@temporalio/client";
import {
  AccountFlags,
  CreateAccountStatus,
  CreateTransferStatus,
  createClient as createTigerBeetleClient,
  type Client as TigerBeetleClient,
} from "tigerbeetle-node";
import RedisClient from "ioredis";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { ENV } from "./env";

/** A non-retryable configuration or integration failure. */
export class InfrastructureError extends Error {
  constructor(
    public readonly integration: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(`[${integration}] ${message}`);
    this.name = "InfrastructureError";
  }
}

function requireConfigured(
  value: string,
  integration: string,
  key: string,
): string {
  if (!value)
    throw new InfrastructureError(integration, `${key} is not configured`);
  return value;
}

function parseEntity(
  reference: string,
  integration: string,
): { type: string; id: string } {
  const index = reference.indexOf(":");
  if (index <= 0 || index === reference.length - 1) {
    throw new InfrastructureError(
      integration,
      `invalid entity reference: ${reference}`,
    );
  }
  return { type: reference.slice(0, index), id: reference.slice(index + 1) };
}

function stableUint128(value: string): bigint {
  const digest = crypto
    .createHash("sha256")
    .update(value)
    .digest("hex")
    .slice(0, 32);
  const id = BigInt(`0x${digest}`);
  return id === 0n ? 1n : id;
}

// ─── Keycloak ─────────────────────────────────────────────────────────────────

export type KeycloakPrincipal = {
  subject: string;
  email: string;
  name: string;
  preferredUsername: string | null;
  roles: string[];
  groups: string[];
  raw: Record<string, unknown>;
};

let keycloakJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getKeycloakJwks() {
  if (!keycloakJwks) {
    const issuer = requireConfigured(
      ENV.keycloakInternalIssuerUrl,
      "Keycloak",
      "KEYCLOAK_INTERNAL_ISSUER_URL",
    );
    keycloakJwks = createRemoteJWKSet(
      new URL(`${issuer.replace(/\/$/, "")}/protocol/openid-connect/certs`),
    );
  }
  return keycloakJwks;
}

function normalizeKeycloakRoles(payload: Record<string, unknown>): string[] {
  const explicit = Array.isArray(payload.roles) ? payload.roles : [];
  const realmAccess = payload.realm_access as { roles?: unknown } | undefined;
  const realmRoles = Array.isArray(realmAccess?.roles) ? realmAccess.roles : [];
  return [...explicit, ...realmRoles]
    .filter((role): role is string => typeof role === "string")
    .map((role) => role.replace(/^\//, ""))
    .filter((role, index, all) => all.indexOf(role) === index);
}

export const Keycloak = {
  async verifyToken(token: string): Promise<KeycloakPrincipal> {
    const issuer = requireConfigured(
      ENV.keycloakIssuerUrl,
      "Keycloak",
      "KEYCLOAK_ISSUER_URL",
    );
    const audience = requireConfigured(
      ENV.keycloakClientId,
      "Keycloak",
      "KEYCLOAK_CLIENT_ID",
    );
    try {
      const { payload } = await jwtVerify(token, getKeycloakJwks(), {
        issuer,
        audience,
        algorithms: ["RS256", "PS256", "ES256"],
      });
      const subject = typeof payload.sub === "string" ? payload.sub : "";
      const email =
        typeof payload.email === "string" ? payload.email.toLowerCase() : "";
      if (!subject || !email || payload.email_verified !== true) {
        throw new InfrastructureError(
          "Keycloak",
          "token must contain a verified email and subject",
        );
      }
      const name = typeof payload.name === "string" ? payload.name : email;
      const groups = Array.isArray(payload.groups)
        ? payload.groups.filter(
            (group): group is string => typeof group === "string",
          )
        : [];
      return {
        subject,
        email,
        name,
        preferredUsername:
          typeof payload.preferred_username === "string"
            ? payload.preferred_username
            : null,
        roles: normalizeKeycloakRoles(payload as Record<string, unknown>),
        groups,
        raw: payload as Record<string, unknown>,
      };
    } catch (error) {
      if (error instanceof InfrastructureError) throw error;
      throw new InfrastructureError(
        "Keycloak",
        "token verification failed",
        error,
      );
    }
  },

  async createUser(email: string, role: string): Promise<{ id: string }> {
    const issuer = requireConfigured(
      ENV.keycloakInternalIssuerUrl,
      "Keycloak",
      "KEYCLOAK_INTERNAL_ISSUER_URL",
    );
    const clientId = requireConfigured(
      ENV.keycloakAdminClientId,
      "Keycloak",
      "KEYCLOAK_ADMIN_CLIENT_ID",
    );
    const clientSecret = requireConfigured(
      ENV.keycloakAdminClientSecret,
      "Keycloak",
      "KEYCLOAK_ADMIN_CLIENT_SECRET",
    );
    const tokenResponse = await fetch(
      `${issuer}/protocol/openid-connect/token`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
        }),
      },
    );
    if (!tokenResponse.ok)
      throw new InfrastructureError(
        "Keycloak",
        `admin token request failed (${tokenResponse.status})`,
      );
    const token = ((await tokenResponse.json()) as { access_token?: string })
      .access_token;
    if (!token)
      throw new InfrastructureError(
        "Keycloak",
        "admin token response did not include access_token",
      );
    const realm = requireConfigured(
      ENV.keycloakRealm,
      "Keycloak",
      "KEYCLOAK_REALM",
    );
    const createResponse = await fetch(
      `${issuer.replace(`/realms/${realm}`, "")}/admin/realms/${realm}/users`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email,
          username: email,
          enabled: true,
          emailVerified: false,
          realmRoles: [role],
        }),
      },
    );
    if (!createResponse.ok && createResponse.status !== 409) {
      throw new InfrastructureError(
        "Keycloak",
        `user creation failed (${createResponse.status})`,
      );
    }
    const location = createResponse.headers.get("location");
    const id = location?.split("/").at(-1);
    if (!id)
      throw new InfrastructureError(
        "Keycloak",
        "user creation did not return an identifier",
      );
    return { id };
  },
};

// ─── TigerBeetle ──────────────────────────────────────────────────────────────

let tigerBeetleClient: TigerBeetleClient | null = null;

function getTigerBeetleClient(): TigerBeetleClient {
  if (!tigerBeetleClient) {
    const addresses = requireConfigured(
      ENV.tigerBeetleAddress,
      "TigerBeetle",
      "TIGERBEETLE_ADDRESS",
    )
      .split(",")
      .map((address) => address.trim())
      .filter(Boolean);
    tigerBeetleClient = createTigerBeetleClient({
      cluster_id: BigInt(ENV.tigerBeetleClusterId),
      replica_addresses: addresses,
    });
  }
  return tigerBeetleClient;
}

export const TigerBeetle = {
  async createAccount(
    accountId: bigint,
    ledger: number,
    code: number,
  ): Promise<{ created: boolean }> {
    const results = await getTigerBeetleClient().createAccounts([
      {
        id: accountId,
        debits_pending: 0n,
        debits_posted: 0n,
        credits_pending: 0n,
        credits_posted: 0n,
        user_data_128: 0n,
        user_data_64: 0n,
        user_data_32: 0,
        reserved: 0,
        ledger,
        code,
        flags: AccountFlags.none,
        timestamp: 0n,
      },
    ]);
    if (results.length === 0) return { created: true };
    const status = results[0]?.status;
    if (status === CreateAccountStatus.exists) return { created: false };
    throw new InfrastructureError(
      "TigerBeetle",
      `account create failed with status ${String(status)}`,
    );
  },

  async createTransfer(
    amount: bigint,
    debitAccountId: bigint,
    creditAccountId: bigint,
    idempotencyKey?: string,
    ledger = ENV.tigerBeetleLedger,
    code = ENV.tigerBeetleTransferCode,
  ): Promise<{ created: boolean; transferId: bigint }> {
    if (amount <= 0n)
      throw new InfrastructureError(
        "TigerBeetle",
        "transfer amount must be positive",
      );
    if (debitAccountId === creditAccountId)
      throw new InfrastructureError(
        "TigerBeetle",
        "debit and credit accounts must differ",
      );
    const transferId = stableUint128(
      requireConfigured(idempotencyKey ?? "", "TigerBeetle", "idempotency key"),
    );
    const results = await getTigerBeetleClient().createTransfers([
      {
        id: transferId,
        debit_account_id: debitAccountId,
        credit_account_id: creditAccountId,
        amount,
        pending_id: 0n,
        user_data_128: 0n,
        user_data_64: 0n,
        user_data_32: 0,
        timeout: 0,
        ledger,
        code,
        flags: 0,
        timestamp: 0n,
      },
    ]);
    if (results.length === 0) return { created: true, transferId };
    const status = results[0]?.status;
    if (status === CreateTransferStatus.exists)
      return { created: false, transferId };
    throw new InfrastructureError(
      "TigerBeetle",
      `transfer create failed with status ${String(status)}`,
    );
  },

  async getBalance(accountId: bigint) {
    const accounts = await getTigerBeetleClient().lookupAccounts([accountId]);
    const account = accounts[0];
    if (!account)
      throw new InfrastructureError(
        "TigerBeetle",
        `ledger account ${accountId} was not found`,
      );
    return {
      debitsPosted: account.debits_posted,
      creditsPosted: account.credits_posted,
      debitsPending: account.debits_pending,
      creditsPending: account.credits_pending,
    };
  },
};

// ─── APISIX ───────────────────────────────────────────────────────────────────

export const Apisix = {
  async registerRoute(path: string, upstreamUrl: string): Promise<void> {
    const adminUrl = requireConfigured(
      ENV.apisixAdminUrl,
      "APISIX",
      "APISIX_ADMIN_URL",
    );
    const adminKey = requireConfigured(
      ENV.apisixAdminKey,
      "APISIX",
      "APISIX_ADMIN_KEY",
    );
    const routeId = crypto
      .createHash("sha256")
      .update(path)
      .digest("hex")
      .slice(0, 24);
    const response = await fetch(
      `${adminUrl.replace(/\/$/, "")}/apisix/admin/routes/${routeId}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json", "x-api-key": adminKey },
        body: JSON.stringify({
          uri: path,
          upstream: {
            type: "roundrobin",
            nodes: { [new URL(upstreamUrl).host]: 1 },
          },
        }),
      },
    );
    if (!response.ok)
      throw new InfrastructureError(
        "APISIX",
        `route registration failed (${response.status})`,
      );
  },
};

// ─── Permify ──────────────────────────────────────────────────────────────────

let permifyClient: any | null = null;

function getPermifyClient(): any {
  if (!permifyClient) {
    permifyClient = (permify as any).grpc.newClient({
      endpoint: requireConfigured(
        ENV.permifyGrpcAddress,
        "Permify",
        "PERMIFY_GRPC_ADDRESS",
      ),
      insecure: ENV.permifyInsecure,
      timeout: ENV.permifyTimeoutMs,
    });
  }
  return permifyClient;
}

export const Permify = {
  async check(
    subject: string,
    action: string,
    resource: string,
  ): Promise<boolean> {
    const subjectEntity = parseEntity(subject, "Permify");
    const resourceEntity = parseEntity(resource, "Permify");
    try {
      const response = await getPermifyClient().permission.check({
        tenantId: ENV.permifyTenantId,
        metadata: {
          snapToken: "",
          schemaVersion: ENV.permifySchemaVersion,
          depth: 32,
        },
        entity: resourceEntity,
        permission: action,
        subject: subjectEntity,
      });
      return (
        response.can ===
        (permify as any).grpc.base.CheckResult.CHECK_RESULT_ALLOWED
      );
    } catch (error) {
      throw new InfrastructureError(
        "Permify",
        "permission check failed (denying request)",
        error,
      );
    }
  },

  async writeTuple(
    subject: string,
    relation: string,
    resource: string,
  ): Promise<void> {
    const subjectEntity = parseEntity(subject, "Permify");
    const resourceEntity = parseEntity(resource, "Permify");
    try {
      await getPermifyClient().relationship.write({
        tenantId: ENV.permifyTenantId,
        metadata: { schemaVersion: ENV.permifySchemaVersion },
        tuples: [{ entity: resourceEntity, relation, subject: subjectEntity }],
      });
    } catch (error) {
      throw new InfrastructureError(
        "Permify",
        "relationship write failed",
        error,
      );
    }
  },

  async writeSchema(schema: string): Promise<{ schemaVersion: string }> {
    try {
      const response = await getPermifyClient().schema.write({
        tenantId: ENV.permifyTenantId,
        schema,
      });
      const schemaVersion = response.schemaVersion ?? "";
      if (!schemaVersion)
        throw new InfrastructureError(
          "Permify",
          "schema write returned no schema version",
        );
      return { schemaVersion };
    } catch (error) {
      if (error instanceof InfrastructureError) throw error;
      throw new InfrastructureError("Permify", "schema write failed", error);
    }
  },
};

// ─── Dapr ─────────────────────────────────────────────────────────────────────

let daprClient: DaprClient | null = null;

export function getDaprClient(): DaprClient {
  if (!daprClient) {
    daprClient = new DaprClient({
      daprHost: ENV.daprHost,
      daprPort: ENV.daprHttpPort,
      daprApiToken: ENV.daprApiToken || undefined,
    });
  }
  return daprClient;
}

export const Dapr = {
  async invokeService(
    appId: string,
    method: string,
    data: unknown,
  ): Promise<unknown> {
    try {
      return await getDaprClient().invoker.invoke(
        appId,
        method,
        HttpMethod.POST,
        (data ?? {}) as object,
      );
    } catch (error) {
      throw new InfrastructureError(
        "Dapr",
        `service invocation failed for ${appId}/${method}`,
        error,
      );
    }
  },

  async publishEvent(
    pubsubName: string,
    topic: string,
    data: unknown,
  ): Promise<void> {
    try {
      await getDaprClient().pubsub.publish(
        pubsubName,
        topic,
        (data ?? {}) as object,
      );
    } catch (error) {
      throw new InfrastructureError(
        "Dapr",
        `publish failed for ${pubsubName}/${topic}`,
        error,
      );
    }
  },

  async saveState(key: string, value: unknown): Promise<void> {
    try {
      await getDaprClient().state.save(ENV.daprStateStore, [{ key, value }]);
    } catch (error) {
      throw new InfrastructureError(
        "Dapr",
        `state write failed for ${key}`,
        error,
      );
    }
  },
};

// ─── Temporal ─────────────────────────────────────────────────────────────────

let temporalClientPromise: Promise<TemporalClient> | null = null;

function getTemporalClient(): Promise<TemporalClient> {
  if (!temporalClientPromise) {
    temporalClientPromise = Connection.connect({
      address: requireConfigured(
        ENV.temporalAddress,
        "Temporal",
        "TEMPORAL_ADDRESS",
      ),
    }).then(
      (connection) =>
        new TemporalClient({ connection, namespace: ENV.temporalNamespace }),
    );
  }
  return temporalClientPromise;
}

export const Temporal = {
  async startWorkflow(
    workflowType: string,
    args: unknown[],
    options: { workflowId?: string; taskQueue?: string } = {},
  ) {
    try {
      const client = await getTemporalClient();
      const workflowId =
        options.workflowId ?? `lanai-${workflowType}-${crypto.randomUUID()}`;
      const handle = await client.workflow.start(workflowType, {
        workflowId,
        taskQueue: options.taskQueue ?? ENV.temporalTaskQueue,
        args,
      });
      return {
        workflowId: handle.workflowId,
        runId: handle.firstExecutionRunId,
      };
    } catch (error) {
      throw new InfrastructureError(
        "Temporal",
        `failed to start ${workflowType}`,
        error,
      );
    }
  },
};

// ─── Redis ────────────────────────────────────────────────────────────────────

let redisClient: RedisClient | null = null;

function getRedisClient(): RedisClient {
  if (!redisClient) {
    const url = requireConfigured(ENV.redisUrl, "Redis", "REDIS_URL");
    redisClient = new RedisClient(url, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
      connectTimeout: ENV.redisConnectTimeoutMs,
    });
    redisClient.on("error", (error) =>
      console.error("[Redis] client error", error),
    );
  }
  return redisClient;
}

async function ensureRedisConnected(): Promise<RedisClient> {
  const client = getRedisClient();
  if (client.status === "wait") await client.connect();
  return client;
}

export const Redis = {
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const client = await ensureRedisConnected();
    if (ttlSeconds && ttlSeconds > 0)
      await client.set(key, value, "EX", ttlSeconds);
    else await client.set(key, value);
  },

  async get(key: string): Promise<string | null> {
    return (await ensureRedisConnected()).get(key);
  },

  async del(key: string): Promise<void> {
    await (await ensureRedisConnected()).del(key);
  },
};

// ─── Fluvio ───────────────────────────────────────────────────────────────────

let fluvioClientPromise: Promise<FluvioClient> | null = null;

type FluvioNativeModule = {
  connect(endpoint?: string): Promise<FluvioClient>;
};

let fluvioNativeModule: FluvioNativeModule | null = null;

function getFluvioNativeModule(): FluvioNativeModule {
  if (fluvioNativeModule) return fluvioNativeModule;
  const platformDirectory =
    process.platform === "darwin"
      ? "darwin"
      : process.platform === "linux"
        ? "linux"
        : null;
  if (!platformDirectory) {
    throw new InfrastructureError(
      "Fluvio",
      `unsupported runtime platform: ${process.platform}`,
    );
  }
  try {
    // @fluvio/client v0.14 ships its supported native bindings but publishes an
    // invalid JavaScript main entrypoint. Load the documented platform binding
    // lazily so unrelated requests do not fail before event streaming is used.
    fluvioNativeModule = require(
      `@fluvio/client/dist/${platformDirectory}/index.node`,
    ) as FluvioNativeModule;
    if (typeof fluvioNativeModule.connect !== "function") {
      throw new Error("native binding does not expose connect()");
    }
    return fluvioNativeModule;
  } catch (error) {
    throw new InfrastructureError(
      "Fluvio",
      "native client binding could not be loaded",
      error,
    );
  }
}

function getFluvioClient(): Promise<FluvioClient> {
  if (!fluvioClientPromise) {
    const [host, rawPort] = requireConfigured(
      ENV.fluvioEndpoint,
      "Fluvio",
      "FLUVIO_ENDPOINT",
    )
      .replace(/^https?:\/\//, "")
      .split(":");
    const port = Number(rawPort || "9003");
    fluvioClientPromise = getFluvioNativeModule().connect(`${host}:${port}`);
  }
  return fluvioClientPromise;
}

export const Fluvio = {
  async produce(topic: string, message: string, key = "lanai"): Promise<void> {
    try {
      const producer: any = await (
        await getFluvioClient()
      ).topicProducer(topic);
      if (typeof producer.send === "function")
        await producer.send(key, message);
      else await producer.sendRecord(message, 0);
    } catch (error) {
      throw new InfrastructureError(
        "Fluvio",
        `produce failed for topic ${topic}`,
        error,
      );
    }
  },
};

// ─── Lakehouse / OpenAppSec ───────────────────────────────────────────────────

export const Lakehouse = {
  async insertRecord(table: string, record: unknown): Promise<void> {
    const baseUrl = requireConfigured(
      ENV.lakehouseIngestUrl,
      "Lakehouse",
      "LAKEHOUSE_INGEST_URL",
    );
    const response = await fetch(
      `${baseUrl.replace(/\/$/, "")}/v1/ingest/${encodeURIComponent(table)}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-lanai-ingest-token": requireConfigured(
            ENV.lakehouseIngestToken,
            "Lakehouse",
            "LAKEHOUSE_INGEST_TOKEN",
          ),
        },
        body: JSON.stringify({ record }),
      },
    );
    if (!response.ok)
      throw new InfrastructureError(
        "Lakehouse",
        `ingest request failed (${response.status})`,
      );
  },
};

export const OpenAppSec = {
  async assertHealthy(): Promise<void> {
    const url = requireConfigured(
      ENV.openAppSecHealthUrl,
      "OpenAppSec",
      "OPENAPPSEC_HEALTH_URL",
    );
    const response = await fetch(url);
    if (!response.ok)
      throw new InfrastructureError(
        "OpenAppSec",
        `WAF health check failed (${response.status})`,
      );
  },
};

export function shutdownInfrastructure(): void {
  tigerBeetleClient?.destroy();
  tigerBeetleClient = null;
  void redisClient?.quit();
  redisClient = null;
  void daprClient?.stop();
  daprClient = null;
  fluvioClientPromise = null;
  temporalClientPromise = null;
}
