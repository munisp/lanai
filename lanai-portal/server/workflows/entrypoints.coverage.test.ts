import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import http from "node:http";

const enqueueDomainEvent = vi.fn();
const dispatchOutboxBatch = vi.fn();
const workerRun = vi.fn();
const workerCreate = vi.fn();
const nativeConnect = vi.fn();
const persistActivity = vi.fn();
const briefingActivity = vi.fn();
const readFile = vi.fn();
const tenancyCreate = vi.fn();
const schemaWrite = vi.fn();
const migrate = vi.fn();
const getDb = vi.fn();
const closeDatabase = vi.fn();
const ensureLanaiMetadata = vi.fn();

vi.mock("../_core/outbox", () => ({
  enqueueDomainEvent: (...args: unknown[]) => enqueueDomainEvent(...args),
  dispatchOutboxBatch: (...args: unknown[]) => dispatchOutboxBatch(...args),
}));

vi.mock("@temporalio/workflow", () => ({
  proxyActivities: () => ({
    persistAndDispatchDomainEvent: (...args: unknown[]) => persistActivity(...args),
    generateMorningBriefing: (...args: unknown[]) => briefingActivity(...args),
  }),
}));

vi.mock("@temporalio/worker", () => ({
  NativeConnection: { connect: (...args: unknown[]) => nativeConnect(...args) },
  Worker: { create: (...args: unknown[]) => workerCreate(...args) },
}));

vi.mock("../_core/env", () => ({
  ENV: {
    temporalAddress: "temporal.test:7233",
    temporalNamespace: "lanai-test",
    temporalTaskQueue: "lanai-test-queue",
    twentyCrmSyncEnabled: true,
    twentyCrmMetadataBootstrapEnabled: true,
  },
}));

vi.mock("node:fs/promises", () => ({
  readFile: (...args: unknown[]) => readFile(...args),
}));

vi.mock("@permify/permify-node", () => ({
  grpc: { newClient: () => ({ tenancy: { create: (...args: unknown[]) => tenancyCreate(...args) }, schema: { write: (...args: unknown[]) => schemaWrite(...args) } }) },
}));

vi.mock("drizzle-orm/postgres-js/migrator", () => ({
  migrate: (...args: unknown[]) => migrate(...args),
}));

vi.mock("../db", () => ({
  getDb: (...args: unknown[]) => getDb(...args),
  closeDatabase: (...args: unknown[]) => closeDatabase(...args),
}));

vi.mock("../_core/twentyClient", () => ({
  TwentyCrmClient: class { ensureLanaiMetadata = ensureLanaiMetadata; },
}));

describe("workflow activities and durable entrypoints", () => {
  const originalGateway = process.env.AI_GATEWAY_URL;
  const originalToken = process.env.AI_GATEWAY_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    enqueueDomainEvent.mockResolvedValue(undefined);
    dispatchOutboxBatch.mockResolvedValue({ failed: 0 });
    persistActivity.mockResolvedValue(undefined);
    briefingActivity.mockResolvedValue(undefined);
    nativeConnect.mockResolvedValue({ id: "connection" });
    workerCreate.mockResolvedValue({ run: workerRun });
    workerRun.mockResolvedValue(undefined);
    readFile.mockResolvedValue("entity user {}");
    tenancyCreate.mockResolvedValue(undefined);
    schemaWrite.mockResolvedValue({ schemaVersion: "schema-v1" });
    getDb.mockResolvedValue({});
    migrate.mockResolvedValue(undefined);
    closeDatabase.mockResolvedValue(undefined);
    ensureLanaiMetadata.mockResolvedValue(undefined);
    process.env.AI_GATEWAY_URL = "https://ai.test";
    process.env.AI_GATEWAY_TOKEN = "gateway-token";
  });

  afterEach(() => {
    if (originalGateway === undefined) delete process.env.AI_GATEWAY_URL;
    else process.env.AI_GATEWAY_URL = originalGateway;
    if (originalToken === undefined) delete process.env.AI_GATEWAY_TOKEN;
    else process.env.AI_GATEWAY_TOKEN = originalToken;
  });

  it("persists and dispatches a domain event, failing closed on retained deliveries", async () => {
    const { persistAndDispatchDomainEvent } = await import("./activities");
    const input = { aggregateType: "booking", aggregateId: "b1", eventType: "created", payload: {}, idempotencyKey: "event-1" };
    await expect(persistAndDispatchDomainEvent(input)).resolves.toBeUndefined();
    expect(enqueueDomainEvent).toHaveBeenCalledWith(input);
    dispatchOutboxBatch.mockResolvedValueOnce({ failed: 1 });
    await expect(persistAndDispatchDomainEvent(input)).rejects.toThrow("retained 1 failed");
  });

  it("delegates morning briefings to the configured gateway and rejects missing configuration", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const { generateMorningBriefing } = await import("./activities");
    await generateMorningBriefing({ requestedByUserId: 8 });
    expect(fetchMock).toHaveBeenCalledWith("https://ai.test/briefing/morning-briefing", expect.objectContaining({ method: "POST" }));
    delete process.env.AI_GATEWAY_TOKEN;
    await expect(generateMorningBriefing({})).rejects.toThrow("AI gateway configuration");
    fetchMock.mockRestore();
  });

  it("schedules workflow activities through the durable proxy", async () => {
    const { domainEventWorkflow, morningBriefingWorkflow } = await import("./workflows");
    const input = { aggregateType: "invoice", aggregateId: 4, eventType: "issued", payload: {}, idempotencyKey: "invoice-4" };
    await domainEventWorkflow(input);
    await morningBriefingWorkflow({ requestedByUserId: 3 });
    expect(persistActivity).toHaveBeenCalledWith(input);
    expect(briefingActivity).toHaveBeenCalledWith({ requestedByUserId: 3 });
  });

  it("executes the Permify bootstrap idempotently", async () => {
    const previous = { endpoint: process.env.PERMIFY_GRPC_ADDRESS, schema: process.env.PERMIFY_SCHEMA_FILE };
    process.env.PERMIFY_GRPC_ADDRESS = "127.0.0.1:3478";
    process.env.PERMIFY_SCHEMA_FILE = "/tmp/schema.perm";
    tenancyCreate.mockRejectedValueOnce(new Error("already exists"));
    const { bootstrapPermify } = await import("../scripts/bootstrapPermify");
    await expect(bootstrapPermify()).resolves.toBeUndefined();
    expect(schemaWrite).toHaveBeenCalledWith({ tenantId: process.env.PERMIFY_TENANT_ID ?? "lanai", schema: "entity user {}" });
    if (previous.endpoint === undefined) delete process.env.PERMIFY_GRPC_ADDRESS; else process.env.PERMIFY_GRPC_ADDRESS = previous.endpoint;
    if (previous.schema === undefined) delete process.env.PERMIFY_SCHEMA_FILE; else process.env.PERMIFY_SCHEMA_FILE = previous.schema;
  });

  it("runs migrations through the resolved database connection", async () => {
    const { runMigrations } = await import("../scripts/migrate");
    await expect(runMigrations()).resolves.toBeUndefined();
    expect(migrate).toHaveBeenCalledWith({}, expect.objectContaining({ migrationsFolder: expect.any(String) }));
    expect(closeDatabase).toHaveBeenCalled();
  });

  it("requires explicit Twenty metadata bootstrap flags and runs with both enabled", async () => {
    const { bootstrapTwentyMetadata } = await import("../scripts/bootstrapTwentyMetadata");
    await expect(bootstrapTwentyMetadata()).resolves.toBeUndefined();
    expect(ensureLanaiMetadata).toHaveBeenCalled();
  });

  it("builds and runs a configured Temporal worker", async () => {
    const { runWorker } = await import("./worker");
    await expect(runWorker()).resolves.toBeUndefined();
    expect(nativeConnect).toHaveBeenCalledWith({ address: "temporal.test:7233" });
    expect(workerCreate).toHaveBeenCalledWith(expect.objectContaining({ namespace: "lanai-test", taskQueue: "lanai-test-queue" }));
    expect(workerRun).toHaveBeenCalled();
  });
});

describe("Vite static fallback", () => {
  it("registers a static directory and SPA fallback handler", async () => {
    const app = express();
    const { serveStatic } = await import("../_core/vite");
    serveStatic(app);
    const server = await new Promise<http.Server>((resolve) => {
      const next = app.listen(0, () => resolve(next));
    });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
