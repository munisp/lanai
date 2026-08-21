import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    jwtVerify: vi.fn(),
    createRemoteJWKSet: vi.fn(() => ({ kind: "jwks" })),
    createClient: vi.fn(),
    permifyNewClient: vi.fn(),
  },
}));

const tigerClient = {
  destroy: vi.fn(),
  createAccounts: vi.fn(),
  lookupAccounts: vi.fn(),
  createTransfers: vi.fn(),
  lookupTransfers: vi.fn(),
};

const permifyGrpcClient = {
  permission: { check: vi.fn() },
  data: { write: vi.fn() },
  schema: { write: vi.fn() },
};

vi.mock("./env", () => ({
  ENV: {
    keycloakIssuerUrl: "https://auth.example.test/realms/lanai",
    keycloakInternalIssuerUrl: "http://keycloak:8080/realms/lanai",
    keycloakClientId: "lanai-portal",
    keycloakAdminClientId: "admin-client",
    keycloakAdminClientSecret: "admin-secret",
    keycloakRealm: "lanai",
    tigerBeetleAddress: "tigerbeetle:3000",
    tigerBeetleClusterId: "0",
    tigerBeetleLedger: 1,
    tigerBeetleTransferCode: 1,
    permifyGrpcAddress: "permify:3478",
    permifyInsecure: false,
    permifyTimeoutMs: 2500,
    permifyTenantId: "lanai-test",
    permifySchemaVersion: "schema-initial",
  },
}));

vi.mock("jose", () => ({
  createRemoteJWKSet: mocks.createRemoteJWKSet,
  jwtVerify: mocks.jwtVerify,
}));

vi.mock("tigerbeetle-node", () => ({
  AccountFlags: { none: 0 },
  CreateAccountStatus: { exists: 1 },
  CreateTransferStatus: { exists: 1 },
  TransferFlags: { pending: 2, post_pending_transfer: 4, void_pending_transfer: 8 },
  amount_max: 999999999n,
  createClient: mocks.createClient,
}));

vi.mock("@permify/permify-node", () => ({
  grpc: {
    newClient: mocks.permifyNewClient,
    base: { CheckResult: { CHECK_RESULT_ALLOWED: 1 } },
  },
}));

import {
  InfrastructureError,
  Keycloak,
  Permify,
  TigerBeetle,
  setPermifySchemaVersion,
  shutdownInfrastructure,
} from "./infrastructure";

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.createClient.mockReturnValue(tigerClient);
  mocks.permifyNewClient.mockReturnValue(permifyGrpcClient);
  await shutdownInfrastructure();
  setPermifySchemaVersion("schema-initial");
});

describe("Keycloak adapter", () => {
  it("verifies issuer/audience-constrained JWT payloads and normalizes roles/groups", async () => {
    mocks.jwtVerify.mockResolvedValue({
      payload: {
        sub: "kc-1",
        email: "ADVISOR@EXAMPLE.TEST",
        email_verified: true,
        name: "Advisor One",
        preferred_username: "advisor.one",
        roles: ["/advisor", "advisor", 9],
        realm_access: { roles: ["admin", "/advisor"] },
        groups: ["/advisors", 3],
      },
    });

    await expect(Keycloak.verifyToken("signed-token")).resolves.toMatchObject({
      subject: "kc-1",
      email: "advisor@example.test",
      roles: ["advisor", "admin"],
      groups: ["/advisors"],
    });
    expect(mocks.jwtVerify).toHaveBeenCalledWith(
      "signed-token",
      expect.anything(),
      expect.objectContaining({
        issuer: "https://auth.example.test/realms/lanai",
        audience: "lanai-portal",
        algorithms: ["RS256", "PS256", "ES256"],
      }),
    );
  });

  it("fails closed when a token omits a verified email or when JWT validation fails", async () => {
    mocks.jwtVerify.mockResolvedValueOnce({
      payload: { sub: "kc-1", email: "advisor@example.test", email_verified: false },
    });
    await expect(Keycloak.verifyToken("unverified")).rejects.toMatchObject({
      integration: "Keycloak",
      message: expect.stringContaining("verified email"),
    });

    mocks.jwtVerify.mockRejectedValueOnce(new Error("signature invalid"));
    await expect(Keycloak.verifyToken("invalid")).rejects.toMatchObject({
      integration: "Keycloak",
      message: expect.stringContaining("token verification failed"),
    });
  });
});

describe("TigerBeetle adapter", () => {
  it("creates one deterministic pending transfer and validates an idempotent retry payload", async () => {
    tigerClient.createTransfers.mockResolvedValueOnce([]).mockResolvedValueOnce([{ status: 1 }]);
    const first = await TigerBeetle.createPendingTransfer(50n, 11n, 12n, "pending:booking:7");
    tigerClient.lookupTransfers.mockResolvedValueOnce([
      {
        debit_account_id: 11n,
        credit_account_id: 12n,
        amount: 50n,
        ledger: 1,
        code: 1,
        flags: 2,
      },
    ]);
    const retry = await TigerBeetle.createPendingTransfer(50n, 11n, 12n, "pending:booking:7");

    expect(first.created).toBe(true);
    expect(retry).toEqual({ created: false, transferId: first.transferId });
    expect(tigerClient.createTransfers).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: first.transferId, flags: 2, pending_id: 0n, amount: 50n }),
    ]);
  });

  it("rejects a same-key transfer retry when TigerBeetle payload data differs", async () => {
    tigerClient.createTransfers.mockResolvedValue([{ status: 1 }]);
    tigerClient.lookupTransfers.mockResolvedValue([
      { debit_account_id: 11n, credit_account_id: 99n, amount: 50n, ledger: 1, code: 1, flags: 2 },
    ]);

    await expect(TigerBeetle.createPendingTransfer(50n, 11n, 12n, "pending:booking:7")).rejects.toMatchObject({
      integration: "TigerBeetle",
      message: expect.stringContaining("does not match its idempotency payload"),
    });
  });

  it("rejects invalid transfer amounts and same-account transfers before native calls", async () => {
    await expect(TigerBeetle.createTransfer(0n, 11n, 12n, "x")).rejects.toBeInstanceOf(InfrastructureError);
    await expect(TigerBeetle.createTransfer(10n, 11n, 11n, "x")).rejects.toBeInstanceOf(InfrastructureError);
    expect(tigerClient.createTransfers).not.toHaveBeenCalled();
  });
});

describe("Permify adapter", () => {
  it("parses entities, uses tenant/schema/depth metadata, and maps allowed responses", async () => {
    permifyGrpcClient.permission.check.mockResolvedValue({ can: 1 });
    await expect(Permify.check("user:42", "manage", "member_record:7")).resolves.toBe(true);
    expect(mocks.permifyNewClient).toHaveBeenCalledWith({
      endpoint: "permify:3478",
      insecure: false,
      timeout: 2500,
    });
    expect(permifyGrpcClient.permission.check).toHaveBeenCalledWith({
      tenantId: "lanai-test",
      metadata: { snapToken: "", schemaVersion: "schema-initial", depth: 32 },
      entity: { type: "member_record", id: "7" },
      permission: "manage",
      subject: { type: "user", id: "42" },
    });
  });

  it("fails closed on unavailable authorization service and rejects malformed entity references", async () => {
    permifyGrpcClient.permission.check.mockRejectedValueOnce(new Error("UNAVAILABLE"));
    await expect(Permify.check("user:42", "manage", "member_record:7")).rejects.toMatchObject({
      integration: "Permify",
      message: expect.stringContaining("denying request"),
    });
    await expect(Permify.check("invalid", "manage", "member_record:7")).rejects.toMatchObject({
      integration: "Permify",
      message: expect.stringContaining("invalid entity reference"),
    });
  });

  it("updates schema version only after a successful schema write and writes relationship tuples", async () => {
    permifyGrpcClient.schema.write.mockResolvedValue({ schemaVersion: "schema-2" });
    await expect(Permify.writeSchema("entity platform {} ")).resolves.toEqual({ schemaVersion: "schema-2" });
    permifyGrpcClient.data.write.mockResolvedValue(undefined);
    await Permify.writeTuple("user:42", "admin", "platform:lanai");
    expect(permifyGrpcClient.data.write).toHaveBeenCalledWith({
      tenantId: "lanai-test",
      metadata: { schemaVersion: "schema-2" },
      tuples: [
        {
          entity: { type: "platform", id: "lanai" },
          relation: "admin",
          subject: { type: "user", id: "42" },
        },
      ],
    });
  });
});
