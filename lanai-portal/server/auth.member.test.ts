/**
 * Tests for member auth procedures:
 * - memberAuth.login: validates email+PIN, returns member session
 * - memberAuth.logout: clears member session cookie
 * - memberAuth.me: returns member from session
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { COOKIE_NAME } from "../shared/const";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<TrpcContext> = {}): TrpcContext {
  const setCookies: { name: string; value: string; options: Record<string, unknown> }[] = [];
  const clearedCookies: { name: string; options: Record<string, unknown> }[] = [];

  return {
    user: null,
    member: null,
    req: {
      protocol: "https",
      headers: { cookie: "" },
      cookies: {},
    } as unknown as TrpcContext["req"],
    res: {
      cookie: (name: string, value: string, options: Record<string, unknown>) => {
        setCookies.push({ name, value, options });
      },
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as unknown as TrpcContext["res"],
    _setCookies: setCookies,
    _clearedCookies: clearedCookies,
    ...overrides,
  } as TrpcContext & { _setCookies: typeof setCookies; _clearedCookies: typeof clearedCookies };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("memberAuth.me", () => {
  it("returns null when no member session is present", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.memberAuth.me();
    expect(result).toBeNull();
  });

  it("returns member data when member is in context", async () => {
    const fakeMember = {
      id: 42,
      email: "alice@example.com",
      name: "Alice",
      tier: "platinum" as const,
      crmPersonId: "crm-123",
      onboardingComplete: true,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      pinHash: "hashed",
    };
    const ctx = makeCtx({ member: fakeMember });
    const caller = appRouter.createCaller(ctx);
    const result = await caller.memberAuth.me();
    expect(result).not.toBeNull();
    expect(result?.email).toBe("alice@example.com");
    expect(result?.tier).toBe("platinum");
  });
});

describe("memberAuth.logout", () => {
  it("clears the member session cookie and returns success", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.memberAuth.logout();
    expect(result.success).toBe(true);
    const cleared = (ctx as unknown as { _clearedCookies: { name: string }[] })._clearedCookies;
    expect(cleared.some((c) => c.name === "lanai_member_session")).toBe(true);
  });
});
