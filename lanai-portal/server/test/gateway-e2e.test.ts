import { expect, test, describe, beforeAll } from "vitest";
import { appRouter } from "../routers";
import { getDb } from "../db";
import { users, members, memberSessions, platformEvents } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import * as trpc from "@trpc/server";
import { Permify } from "../_core/infrastructure";

// We simulate the APISIX -> Lanai Portal flow by injecting verified JWT claims
// into the tRPC context exactly as the Express middleware would.
const createMockContext = async (role: string, email: string, sub: string) => {
  const db = await getDb();
  
  // First ensure the user exists
  const existingUser = await db.select().from(users).where(eq(users.email, email)).limit(1);
  let userId = existingUser[0]?.id;
  
  if (!userId) {
    const res = await db.insert(users).values({
      email,
      name: `Test ${role}`,
      role: role.includes("member") ? "advisor" : role as any, // Only advisor/senior_advisor/admin are valid roles in users table
      openId: sub,
    }).returning({ id: users.id });
    userId = res[0].id;
  }

  // If member role, ensure member record exists
  let memberId = null;
  if (role.includes("member")) {
    const existingMember = await db.select().from(members).where(eq(members.email, email)).limit(1);
    memberId = existingMember[0]?.id;
    
    if (!memberId) {
      const res = await db.insert(members).values({
        userId,
        email,
        name: `Test ${role}`,
        tier: role.split("-")[0] as any,
      }).returning({ id: members.id });
      memberId = res[0].id;
    }
  }

  // Simulate the Express request object with the verified JWT payload attached
  const req = {
    headers: {
      authorization: "Bearer mock-jwt-token"
    },
    user: {
      sub,
      email,
      name: `Test ${role}`,
      roles: [role]
    }
  };

  // Seed Permify tuples for the test user
  if (role === "admin") {
    await Permify.writeTuple(`user:${userId}`, "admin", "platform:lanai");
  } else if (role === "advisor") {
    await Permify.writeTuple(`user:${userId}`, "advisor", "platform:lanai");
  }

  return {
    req: req as any,
    res: {} as any,
    user: { ...req.user, id: userId, role: role.includes("member") ? "advisor" : role },
    member: memberId ? { id: memberId, email, name: `Test ${role}`, tier: role.split("-")[0] } : null
  };
};

describe("API Gateway E2E - Keycloak JWT + Permify Authz", () => {
  beforeAll(async () => {
    // We need to bootstrap the Permify schema to get a schema version
    const fs = require("fs");
    const path = require("path");
    const { Permify } = await import("../_core/infrastructure");
    const schema = fs.readFileSync(path.join(__dirname, "../../../config/permify/schema.perm"), "utf8");
    await Permify.writeSchema(schema);
  });
  test("Admin can access system health", async () => {
    const ctx = await createMockContext("admin", "admin@lanai.com", "sub-admin");
    const caller = appRouter.createCaller(ctx as any);
    
    const res = await caller.system.health({ timestamp: Date.now() });
    expect(res).toBeDefined();
  });

  test("Platinum member can access their own profile", async () => {
    const ctx = await createMockContext("platinum-member", "plat@lanai.com", "sub-plat");
    const caller = appRouter.createCaller(ctx as any);
    
    const res = await caller.memberProfile.myProfile();
    expect(res).toBeDefined();
  });

  test("Advisor can access member profiles", async () => {
    const ctx = await createMockContext("advisor", "advisor@lanai.com", "sub-advisor");
    const caller = appRouter.createCaller(ctx as any);
    
    // Advisor listing members requires Permify 'view' on member_record
    const res = await caller.members.list();
    expect(Array.isArray(res)).toBe(true);
  });

  test("Unauthenticated request is rejected by gateway simulation", async () => {
    // In reality APISIX blocks this, but our trpc context builder also rejects
    const ctx = { req: { headers: {} }, res: {} };
    const caller = appRouter.createCaller(ctx as any);
    
    await expect(caller.memberProfile.myProfile()).rejects.toThrow("Please login (10001)");
  });
});
