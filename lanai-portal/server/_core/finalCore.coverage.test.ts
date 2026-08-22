import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import http from "node:http";

const redisSet = vi.fn();
const redisGet = vi.fn();
const redisDel = vi.fn();
const keycloakVerify = vi.fn();
const permifyCheck = vi.fn();
const permifyWrite = vi.fn();
const getDb = vi.fn();
const upsertUser = vi.fn();
const getUserByOpenId = vi.fn();
const getChatwootConfig = vi.fn();
const createChatwootConfig = vi.fn();
const assertDatabaseReady = vi.fn();
const closeDatabase = vi.fn();
const dispatchOutboxBatch = vi.fn();
const fakeListen = vi.fn((_port: number, callback?: () => void) => { callback?.(); });

vi.mock("./env", () => ({
  ENV: {
    forgeApiUrl: "https://forge.test",
    forgeApiKey: "forge-key",
    aiGatewayUrl: "https://ai.test",
    aiGatewayToken: "ai-token",
    aiModel: "test-model",
    cookieSecret: "unit-test-session-secret",
    keycloakIssuerUrl: "https://keycloak.test/realms/lanai",
    keycloakInternalIssuerUrl: "https://keycloak.test/realms/lanai",
    keycloakClientId: "lanai-portal",
    keycloakClientSecret: "secret",
    chatwootUrl: "https://chatwoot.test",
    chatwootToken: "chatwoot-token",
    chatwootAccountId: 1,
    isProduction: true,
    allowedOrigins: ["https://portal.test"],
    rateLimitWindowMs: 60_000,
    rateLimitMax: 100,
    authRateLimitMax: 5,
    port: 3001,
  },
}));

vi.mock("./infrastructure", () => ({
  Redis: {
    set: (...args: unknown[]) => redisSet(...args),
    get: (...args: unknown[]) => redisGet(...args),
    del: (...args: unknown[]) => redisDel(...args),
  },
  Keycloak: { verifyToken: (...args: unknown[]) => keycloakVerify(...args) },
  Permify: {
    check: (...args: unknown[]) => permifyCheck(...args),
    writeTuple: (...args: unknown[]) => permifyWrite(...args),
  },
  shutdownInfrastructure: vi.fn(),
}));

const inferenceDb = {
  insert: () => ({ values: () => ({ returning: async () => [{ id: 11, requestId: "run-11" }] }) }),
  update: () => ({ set: () => ({ where: async () => undefined }) }),
};

vi.mock("../db", () => ({
  getDb: (...args: unknown[]) => getDb(...args),
  upsertUser: (...args: unknown[]) => upsertUser(...args),
  getUserByOpenId: (...args: unknown[]) => getUserByOpenId(...args),
  getChatwootConfig: (...args: unknown[]) => getChatwootConfig(...args),
  createChatwootConfig: (...args: unknown[]) => createChatwootConfig(...args),
  updateChatwootConfig: vi.fn(),
  createChatwootConversation: vi.fn(),
  getChatwootConversationByChatwootId: vi.fn(),
  updateChatwootConversation: vi.fn(),
  listChatwootConversations: vi.fn(),
  createChatwootMessage: vi.fn(),
  listChatwootMessages: vi.fn(),
  getChatwootMessageByChatwootId: vi.fn(),
  getMemberById: vi.fn(),
  assertDatabaseReady: (...args: unknown[]) => assertDatabaseReady(...args),
  closeDatabase: (...args: unknown[]) => closeDatabase(...args),
}));

vi.mock("http", () => ({
  createServer: () => ({ listen: fakeListen, close: vi.fn() }),
}));
vi.mock("@trpc/server/adapters/express", () => ({ createExpressMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock("../routers", () => ({ appRouter: {} }));
vi.mock("./context", () => ({ createContext: vi.fn() }));
vi.mock("./oauth", () => ({ registerOAuthRoutes: vi.fn() }));
vi.mock("./storageProxy", () => ({ registerStorageProxy: vi.fn() }));
vi.mock("./crmProxy", () => ({ registerCrmProxy: vi.fn() }));
vi.mock("./chatwootProxy", () => ({ registerChatwootProxy: vi.fn() }));
vi.mock("./aiRoutes", () => ({ registerAiRoutes: vi.fn() }));
vi.mock("../stripeRouter", () => ({ registerStripeWebhook: vi.fn() }));
vi.mock("../twentyWebhook", () => ({ registerTwentyWebhook: vi.fn() }));
vi.mock("../chatwootWebhook", () => ({ registerChatwootWebhook: vi.fn() }));
vi.mock("./outbox", () => ({ dispatchOutboxBatch: (...args: unknown[]) => dispatchOutboxBatch(...args) }));

beforeEach(() => {
  vi.clearAllMocks();
  redisSet.mockResolvedValue(undefined);
  redisGet.mockResolvedValue(null);
  redisDel.mockResolvedValue(undefined);
  permifyCheck.mockResolvedValue(true);
  permifyWrite.mockResolvedValue(undefined);
  getDb.mockResolvedValue(inferenceDb);
  upsertUser.mockResolvedValue(undefined);
  getUserByOpenId.mockResolvedValue({ id: 7, isActive: true, email: "advisor@lanai.test", name: "Advisor", role: "advisor" });
  getChatwootConfig.mockResolvedValue(null);
  createChatwootConfig.mockResolvedValue(3);
  assertDatabaseReady.mockResolvedValue(undefined);
  closeDatabase.mockResolvedValue(undefined);
  dispatchOutboxBatch.mockResolvedValue({ failed: 0 });
});

afterEach(() => vi.restoreAllMocks());

describe("LLM and Keycloak adapters", () => {
  it("normalizes LLM messages and lists models with the configured bearer credential", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "completion-1", choices: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ object: "list", data: [{ id: "model-a", object: "model", created: 1, owned_by: "lanai" }] }), { status: 200 }));
    const { invokeLLM, listLLMModels } = await import("./llm");
    await expect(invokeLLM({ messages: [{ role: "user", content: "hello" }], maxTokens: 32 })).resolves.toMatchObject({ id: "completion-1" });
    await expect(listLLMModels()).resolves.toMatchObject({ data: [{ id: "model-a" }] });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/v1/chat/completions"), expect.objectContaining({ method: "POST" }));
  });

  it("builds a PKCE authorization request and synchronizes bearer-token advisors", async () => {
    keycloakVerify.mockResolvedValue({ subject: "kc-user", email: "advisor@lanai.test", name: "Advisor", roles: ["advisor"] });
    const { sdk } = await import("./sdk");
    const request = sdk.createAuthorizationRequest("/dashboard", "https://portal.test/api/oauth/callback");
    expect(request.url).toContain("code_challenge_method=S256");
    await expect(sdk.authenticateRequest({ headers: { authorization: "Bearer access-token" } } as any)).resolves.toMatchObject({ id: 7, keycloakSubject: "kc-user" });
    expect(permifyWrite).toHaveBeenCalledWith("user:7", "advisor", "platform:lanai");
  });
});

describe("Chatwoot service and AI route registration", () => {
  it("initializes Chatwoot configuration once from explicit environment bootstrap values", async () => {
    const { initializeChatwootConfig, testChatwootConnection } = await import("../chatwootService");
    await initializeChatwootConfig();
    expect(createChatwootConfig).toHaveBeenCalledWith(expect.objectContaining({ instanceUrl: "https://chatwoot.test", enabled: true }));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ payload: [] }), { status: 200 }));
    await expect(testChatwootConnection()).resolves.toMatchObject({ success: true, inboxCount: 0 });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/inboxes"), expect.objectContaining({ headers: expect.objectContaining({ api_access_token: "chatwoot-token" }) }));
  });

  it("registers all advisor-protected AI proxy route families on an Express application", async () => {
    const { registerAiRoutes } = await vi.importActual<typeof import("./aiRoutes")>("./aiRoutes");
    const app = express();
    registerAiRoutes(app);
    const routes = (app as any).router.stack
      .filter((layer: any) => layer.route)
      .map((layer: any) => layer.route.path);
    expect(routes).toEqual(expect.arrayContaining([
      "/api/proposals/generate-proposal",
      "/api/intelligence/client-profile",
      "/api/briefing/morning-briefing",
      "/api/whatsapp/api/draft-reply",
    ]));
  });
});

describe("portal bootstrap", () => {
  it("constructs the production app, registers protected routes, and starts isolated listeners", async () => {
    const { startServer } = await import("./index");
    await expect(startServer()).resolves.toBeUndefined();
    expect(assertDatabaseReady).toHaveBeenCalled();
    expect(fakeListen).toHaveBeenCalledTimes(2);
    expect(dispatchOutboxBatch).toHaveBeenCalled();
  });
});
