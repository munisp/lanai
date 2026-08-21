/**
 * Identity-layer unit tests covering:
 *   - server/_core/context.ts  (tRPC context creation)
 *   - server/_core/oauth.ts    (OAuth login/callback routes)
 *   - server/_core/authMiddleware.ts (Express route guards)
 *
 * These modules sit at the trust boundary and must be tested with controlled
 * seams for the Keycloak SDK, Redis, and database layer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express, { type Express, type Request, type Response } from "express";
import http from "node:http";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockAuthenticateRequest = vi.fn();
const mockCreateAuthorizationRequest = vi.fn();
const mockExchangeCodeForToken = vi.fn();
const mockGetUserInfo = vi.fn();
const mockCreateAdvisorSession = vi.fn();

vi.mock("./sdk", () => ({
  sdk: {
    authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
    createAuthorizationRequest: (...args: unknown[]) => mockCreateAuthorizationRequest(...args),
    exchangeCodeForToken: (...args: unknown[]) => mockExchangeCodeForToken(...args),
    getUserInfo: (...args: unknown[]) => mockGetUserInfo(...args),
    createAdvisorSession: (...args: unknown[]) => mockCreateAdvisorSession(...args),
  },
}));

const redisStore = new Map<string, string>();
vi.mock("./infrastructure", () => ({
  Redis: {
    set: vi.fn(async (key: string, value: string, _ttl?: number) => {
      redisStore.set(key, value);
    }),
    get: vi.fn(async (key: string) => redisStore.get(key) ?? null),
    del: vi.fn(async (key: string) => { redisStore.delete(key); }),
  },
  Keycloak: {},
  Permify: {},
}));

const mockGetMemberSessionByToken = vi.fn();
const mockGetMemberById = vi.fn();
const mockUpdateMemberLastSignedIn = vi.fn();
const mockUpsertUser = vi.fn();

vi.mock("../db", () => ({
  getMemberSessionByToken: (...args: unknown[]) => mockGetMemberSessionByToken(...args),
  getMemberById: (...args: unknown[]) => mockGetMemberById(...args),
  updateMemberLastSignedIn: (...args: unknown[]) => mockUpdateMemberLastSignedIn(...args),
  upsertUser: (...args: unknown[]) => mockUpsertUser(...args),
}));

vi.mock("@shared/const", () => ({
  COOKIE_NAME: "app_session_id",
}));

vi.mock("./cookies", () => ({
  getSessionCookieOptions: () => ({
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: false,
  }),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    query: {},
    get: (name: string) => (overrides.headers as Record<string, string>)?.[name.toLowerCase()],
    ...overrides,
  } as unknown as Request;
}

function makeRes(): Response & { _status: number; _json: unknown; _redirectUrl: string; _cookies: Record<string, unknown>; _clearedCookies: string[] } {
  const res: any = {
    _status: 200,
    _json: null,
    _redirectUrl: "",
    _cookies: {},
    _clearedCookies: [],
    status(code: number) { res._status = code; return res; },
    json(body: unknown) { res._json = body; return res; },
    redirect(_code: number, url: string) { res._redirectUrl = url; },
    cookie(name: string, value: string, opts: unknown) { res._cookies[name] = { value, opts }; },
    clearCookie(name: string) { res._clearedCookies.push(name); },
  };
  return res;
}

// ─── context.ts ─────────────────────────────────────────────────────────────

describe("server/_core/context.ts — createContext", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns authenticated advisor when SDK succeeds", async () => {
    const fakeUser = { id: 1, email: "advisor@lanai.io", role: "admin" };
    mockAuthenticateRequest.mockResolvedValue(fakeUser);

    const { createContext } = await import("./context");
    const ctx = await createContext({ req: makeReq(), res: makeRes() } as any);

    expect(ctx.user).toEqual(fakeUser);
    expect(ctx.member).toBeNull();
  });

  it("returns authenticated member when advisor auth fails and valid session cookie exists", async () => {
    mockAuthenticateRequest.mockRejectedValue(new Error("no session"));
    const fakeMember = { id: 42, active: true, firstName: "Alice" };
    mockGetMemberSessionByToken.mockResolvedValue({ memberId: 42 });
    mockGetMemberById.mockResolvedValue(fakeMember);
    mockUpdateMemberLastSignedIn.mockResolvedValue(undefined);

    const { createContext } = await import("./context");
    const req = makeReq({ headers: { cookie: "lanai_member_session=tok123" } });
    const ctx = await createContext({ req, res: makeRes() } as any);

    expect(ctx.user).toBeNull();
    expect(ctx.member).toEqual(fakeMember);
    expect(mockGetMemberSessionByToken).toHaveBeenCalledWith("tok123");
    expect(mockUpdateMemberLastSignedIn).toHaveBeenCalledWith(42);
  });

  it("returns null member when session token has no matching record", async () => {
    mockAuthenticateRequest.mockRejectedValue(new Error("no session"));
    mockGetMemberSessionByToken.mockResolvedValue(null);

    const { createContext } = await import("./context");
    const req = makeReq({ headers: { cookie: "lanai_member_session=expired" } });
    const ctx = await createContext({ req, res: makeRes() } as any);

    expect(ctx.user).toBeNull();
    expect(ctx.member).toBeNull();
  });

  it("returns null member when member is inactive", async () => {
    mockAuthenticateRequest.mockRejectedValue(new Error("no session"));
    mockGetMemberSessionByToken.mockResolvedValue({ memberId: 99 });
    mockGetMemberById.mockResolvedValue({ id: 99, active: false });

    const { createContext } = await import("./context");
    const req = makeReq({ headers: { cookie: "lanai_member_session=tok_inactive" } });
    const ctx = await createContext({ req, res: makeRes() } as any);

    expect(ctx.member).toBeNull();
  });

  it("returns anonymous context when no cookies are present", async () => {
    mockAuthenticateRequest.mockRejectedValue(new Error("no session"));

    const { createContext } = await import("./context");
    const ctx = await createContext({ req: makeReq(), res: makeRes() } as any);

    expect(ctx.user).toBeNull();
    expect(ctx.member).toBeNull();
  });

  it("does not attempt member lookup when advisor auth succeeds", async () => {
    const fakeUser = { id: 1, email: "advisor@lanai.io", role: "advisor" };
    mockAuthenticateRequest.mockResolvedValue(fakeUser);

    const { createContext } = await import("./context");
    const req = makeReq({ headers: { cookie: "lanai_member_session=should_not_check" } });
    const ctx = await createContext({ req, res: makeRes() } as any);

    expect(ctx.user).toEqual(fakeUser);
    expect(mockGetMemberSessionByToken).not.toHaveBeenCalled();
  });
});

// ─── authMiddleware.ts ──────────────────────────────────────────────────────

describe("server/_core/authMiddleware.ts — requireAdvisorAuth and requireAnyAuth", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("requireAdvisorAuth calls next() for authenticated advisor", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: 1 });
    const { requireAdvisorAuth } = await import("./authMiddleware");
    const next = vi.fn();
    const res = makeRes();
    await requireAdvisorAuth(makeReq(), res as any, next);
    expect(next).toHaveBeenCalled();
    expect(res._status).toBe(200);
  });

  it("requireAdvisorAuth returns 401 for unauthenticated request", async () => {
    mockAuthenticateRequest.mockRejectedValue(new Error("no session"));
    const { requireAdvisorAuth } = await import("./authMiddleware");
    const next = vi.fn();
    const res = makeRes();
    await requireAdvisorAuth(makeReq(), res as any, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
    expect(res._json).toEqual({ error: "Unauthorized: advisor session required" });
  });

  it("requireAnyAuth calls next() for authenticated advisor", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: 1 });
    const { requireAnyAuth } = await import("./authMiddleware");
    const next = vi.fn();
    const res = makeRes();
    await requireAnyAuth(makeReq(), res as any, next);
    expect(next).toHaveBeenCalled();
  });

  it("requireAnyAuth calls next() for authenticated member", async () => {
    mockAuthenticateRequest.mockRejectedValue(new Error("no session"));
    mockGetMemberSessionByToken.mockResolvedValue({ memberId: 5 });
    mockGetMemberById.mockResolvedValue({ id: 5, active: true });
    const { requireAnyAuth } = await import("./authMiddleware");
    const next = vi.fn();
    const req = makeReq({ headers: { cookie: "lanai_member_session=valid_tok" } });
    const res = makeRes();
    await requireAnyAuth(req, res as any, next);
    expect(next).toHaveBeenCalled();
  });

  it("requireAnyAuth returns 401 when neither advisor nor member is authenticated", async () => {
    mockAuthenticateRequest.mockRejectedValue(new Error("no session"));
    const { requireAnyAuth } = await import("./authMiddleware");
    const next = vi.fn();
    const res = makeRes();
    await requireAnyAuth(makeReq(), res as any, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
  });

  it("requireAnyAuth returns 401 when member session exists but member is inactive", async () => {
    mockAuthenticateRequest.mockRejectedValue(new Error("no session"));
    mockGetMemberSessionByToken.mockResolvedValue({ memberId: 7 });
    mockGetMemberById.mockResolvedValue({ id: 7, active: false });
    const { requireAnyAuth } = await import("./authMiddleware");
    const next = vi.fn();
    const req = makeReq({ headers: { cookie: "lanai_member_session=inactive_tok" } });
    const res = makeRes();
    await requireAnyAuth(req, res as any, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
  });
});

// ─── oauth.ts ───────────────────────────────────────────────────────────────

describe("server/_core/oauth.ts — registerOAuthRoutes", () => {
  let app: Express;
  let server: http.Server;
  let baseUrl: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    redisStore.clear();
    app = express();
    const { registerOAuthRoutes } = await import("./oauth");
    registerOAuthRoutes(app);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("GET /api/oauth/login redirects to Keycloak with state cookie", async () => {
    mockCreateAuthorizationRequest.mockReturnValue({
      state: "state123",
      codeVerifier: "verifier456",
      url: "https://auth.lanai.io/realms/lanai/protocol/openid-connect/auth?state=state123",
    });

    const res = await fetch(`${baseUrl}/api/oauth/login?returnTo=/dashboard`, {
      redirect: "manual",
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("auth.lanai.io");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("lanai_oidc_state=state123");
    // Verify Redis transaction was stored
    const stored = redisStore.get("lanai:oidc-transaction:state123");
    expect(stored).toBeDefined();
    const parsed = JSON.parse(stored!);
    expect(parsed.returnTo).toBe("/dashboard");
    expect(parsed.codeVerifier).toBe("verifier456");
  });

  it("GET /api/oauth/login returns 503 when SDK throws", async () => {
    mockCreateAuthorizationRequest.mockImplementation(() => {
      throw new Error("Keycloak unavailable");
    });

    const res = await fetch(`${baseUrl}/api/oauth/login`, { redirect: "manual" });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toContain("unavailable");
  });

  it("GET /api/oauth/login sanitizes open-redirect returnTo", async () => {
    mockCreateAuthorizationRequest.mockReturnValue({
      state: "s1",
      codeVerifier: "v1",
      url: "https://auth.lanai.io/auth?state=s1",
    });

    await fetch(`${baseUrl}/api/oauth/login?returnTo=//evil.com`, {
      redirect: "manual",
    });

    const stored = redisStore.get("lanai:oidc-transaction:s1");
    const parsed = JSON.parse(stored!);
    expect(parsed.returnTo).toBe("/");
  });

  it("GET /api/oauth/callback returns 400 when state cookie is missing", async () => {
    const res = await fetch(`${baseUrl}/api/oauth/callback?code=abc&state=xyz`, {
      redirect: "manual",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid OIDC callback state");
  });

  it("GET /api/oauth/callback returns 400 when code is missing", async () => {
    const res = await fetch(`${baseUrl}/api/oauth/callback?state=xyz`, {
      redirect: "manual",
      headers: { cookie: "lanai_oidc_state=xyz" },
    });
    expect(res.status).toBe(400);
  });

  it("GET /api/oauth/callback returns 400 when state does not match cookie", async () => {
    const res = await fetch(`${baseUrl}/api/oauth/callback?code=abc&state=mismatch`, {
      redirect: "manual",
      headers: { cookie: "lanai_oidc_state=different" },
    });
    expect(res.status).toBe(400);
  });

  it("GET /api/oauth/callback returns 400 when Redis transaction expired", async () => {
    // State matches cookie but Redis has no record
    const res = await fetch(`${baseUrl}/api/oauth/callback?code=abc&state=expired_state`, {
      redirect: "manual",
      headers: { cookie: "lanai_oidc_state=expired_state" },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("expired");
  });

  it("GET /api/oauth/callback completes login and sets session cookie on success", async () => {
    const state = "valid_state";
    redisStore.set(
      `lanai:oidc-transaction:${state}`,
      JSON.stringify({ returnTo: "/members", codeVerifier: "cv1", redirectUri: "http://127.0.0.1/api/oauth/callback" }),
    );
    mockExchangeCodeForToken.mockResolvedValue({ access_token: "at1", refresh_token: "rt1" });
    mockGetUserInfo.mockResolvedValue({
      subject: "kc-sub-1",
      email: "advisor@lanai.io",
      name: "Test Advisor",
      roles: ["admin"],
    });
    mockCreateAdvisorSession.mockResolvedValue("session_token_abc");
    mockUpsertUser.mockResolvedValue(undefined);

    const res = await fetch(`${baseUrl}/api/oauth/callback?code=auth_code&state=${state}`, {
      redirect: "manual",
      headers: { cookie: `lanai_oidc_state=${state}` },
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/members");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("app_session_id=session_token_abc");
    // Redis transaction should be consumed
    expect(redisStore.has(`lanai:oidc-transaction:${state}`)).toBe(false);
    expect(mockUpsertUser).toHaveBeenCalledWith(
      expect.objectContaining({ openId: "kc-sub-1", role: "admin" }),
    );
  });

  it("GET /api/oauth/callback returns 401 when token exchange fails", async () => {
    const state = "fail_state";
    redisStore.set(
      `lanai:oidc-transaction:${state}`,
      JSON.stringify({ returnTo: "/", codeVerifier: "cv2", redirectUri: "http://127.0.0.1/api/oauth/callback" }),
    );
    mockExchangeCodeForToken.mockRejectedValue(new Error("invalid_grant"));

    const res = await fetch(`${baseUrl}/api/oauth/callback?code=bad_code&state=${state}`, {
      redirect: "manual",
      headers: { cookie: `lanai_oidc_state=${state}` },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("authentication failed");
  });

  it("GET /api/oauth/callback assigns senior_advisor role correctly", async () => {
    const state = "senior_state";
    redisStore.set(
      `lanai:oidc-transaction:${state}`,
      JSON.stringify({ returnTo: "/", codeVerifier: "cv3", redirectUri: "http://127.0.0.1/api/oauth/callback" }),
    );
    mockExchangeCodeForToken.mockResolvedValue({ access_token: "at2" });
    mockGetUserInfo.mockResolvedValue({
      subject: "kc-sub-2",
      email: "senior@lanai.io",
      name: "Senior Advisor",
      roles: ["senior-advisor"],
    });
    mockCreateAdvisorSession.mockResolvedValue("sess_senior");
    mockUpsertUser.mockResolvedValue(undefined);

    await fetch(`${baseUrl}/api/oauth/callback?code=code2&state=${state}`, {
      redirect: "manual",
      headers: { cookie: `lanai_oidc_state=${state}` },
    });

    expect(mockUpsertUser).toHaveBeenCalledWith(
      expect.objectContaining({ role: "senior_advisor" }),
    );
  });

  it("GET /api/oauth/callback assigns advisor role when no elevated roles present", async () => {
    const state = "advisor_state";
    redisStore.set(
      `lanai:oidc-transaction:${state}`,
      JSON.stringify({ returnTo: "/", codeVerifier: "cv4", redirectUri: "http://127.0.0.1/api/oauth/callback" }),
    );
    mockExchangeCodeForToken.mockResolvedValue({ access_token: "at3" });
    mockGetUserInfo.mockResolvedValue({
      subject: "kc-sub-3",
      email: "basic@lanai.io",
      name: "Basic Advisor",
      roles: [],
    });
    mockCreateAdvisorSession.mockResolvedValue("sess_basic");
    mockUpsertUser.mockResolvedValue(undefined);

    await fetch(`${baseUrl}/api/oauth/callback?code=code3&state=${state}`, {
      redirect: "manual",
      headers: { cookie: `lanai_oidc_state=${state}` },
    });

    expect(mockUpsertUser).toHaveBeenCalledWith(
      expect.objectContaining({ role: "advisor" }),
    );
  });
});
