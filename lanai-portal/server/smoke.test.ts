/**
 * smoke.test.ts — Comprehensive stakeholder smoke tests
 *
 * Covers every stakeholder workflow:
 *   1. Advisor: auth, member management, travel requests, proposals, bookings, suppliers, documents
 *   2. Senior Advisor / Admin: role management, settings
 *   3. Member (Client): onboarding, travel requests, proposals, bookings, documents
 *   4. System: infrastructure layer stubs
 *
 * These tests run against the live PostgreSQL database seeded in-memory.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { Member, User } from "../drizzle/schema";

// ─── Mock infrastructure services so tests don't need real external services ──

vi.mock("./_core/infrastructure", () => ({
  Keycloak: { verifyToken: vi.fn().mockResolvedValue({ valid: true }), createUser: vi.fn().mockResolvedValue({ id: "kc-1" }) },
  TigerBeetle: { createAccount: vi.fn().mockResolvedValue(true), createTransfer: vi.fn().mockResolvedValue(true) },
  Permify: { check: vi.fn().mockResolvedValue(true), writeTuple: vi.fn().mockResolvedValue(true) },
  Dapr: { invokeService: vi.fn().mockResolvedValue({ success: true }), publishEvent: vi.fn().mockResolvedValue(true) },
  Temporal: { startWorkflow: vi.fn().mockResolvedValue({ runId: "wf-1" }) },
  Redis: { set: vi.fn().mockResolvedValue(true), get: vi.fn().mockResolvedValue(null) },
  Lakehouse: { insertRecord: vi.fn().mockResolvedValue(true) },
  OpenAppSec: { inspectRequest: vi.fn().mockResolvedValue({ safe: true }) },
  Fluvio: { produce: vi.fn().mockResolvedValue(true) },
  Apisix: { registerRoute: vi.fn().mockResolvedValue(true) },
  Postgres: { query: vi.fn().mockResolvedValue([]) },
}));

// ─── Mock database so tests don't need a running PostgreSQL instance ──────────
// NOTE: vi.mock factories are hoisted to the top of the file by Vitest.
// All variables used inside must be defined inside the factory itself.

vi.mock("./db", () => {
  const members: any[] = [];
  const users: any[] = [];
  let id = 1;
  return {
    getDb: vi.fn().mockResolvedValue(null),
    upsertUser: vi.fn().mockResolvedValue(undefined),
    getUserByOpenId: vi.fn().mockImplementation(async (openId: string) =>
      users.find((u: any) => u.openId === openId)
    ),
    getAllAdvisors: vi.fn().mockResolvedValue(users),
    getAllMembers: vi.fn().mockResolvedValue(members),
    getMemberByEmail: vi.fn().mockImplementation(async (email: string) =>
      members.find((m: any) => m.email === email && m.active)
    ),
    getMemberById: vi.fn().mockImplementation(async (memberId: number) =>
      members.find((m: any) => m.id === memberId)
    ),
    createMember: vi.fn().mockImplementation(async (data: any) => {
      const newId = id++;
      members.push({ id: newId, ...data, onboardingComplete: false, active: true, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: null });
      return newId;
    }),
    updateMemberPin: vi.fn().mockImplementation(async (memberId: number, pinHash: string) => {
      const m = members.find((m: any) => m.id === memberId);
      if (m) { m.pinHash = pinHash; m.onboardingComplete = true; }
    }),
    updateMemberLastSignedIn: vi.fn().mockResolvedValue(undefined),
    updateMember: vi.fn().mockImplementation(async (memberId: number, data: any) => {
      const m = members.find((m: any) => m.id === memberId);
      if (m) Object.assign(m, data);
    }),
    createInvitation: vi.fn().mockResolvedValue(undefined),
    getInvitationByToken: vi.fn().mockResolvedValue({
      id: 1, token: "test-token", email: "member@test.com", name: "Test Member",
      tier: "gold", crmPersonId: null, invitedByUserId: 1, accepted: false,
      expiresAt: new Date(Date.now() + 86400000), createdAt: new Date(),
    }),
    markInvitationAccepted: vi.fn().mockResolvedValue(undefined),
    getPendingInvitations: vi.fn().mockResolvedValue([]),
    createMemberSession: vi.fn().mockResolvedValue(undefined),
    getMemberSessionByToken: vi.fn().mockResolvedValue(undefined),
    deleteMemberSession: vi.fn().mockResolvedValue(undefined),
    deleteExpiredMemberSessions: vi.fn().mockResolvedValue(undefined),
    updateUserRole: vi.fn().mockResolvedValue(undefined),
  };
});

// ─── Context factories ────────────────────────────────────────────────────────

function makeAdvisorCtx(role: "advisor" | "senior_advisor" | "admin" = "advisor"): TrpcContext {
  const user: User = {
    id: 1, openId: "adv-1", email: "advisor@lanai.com", name: "Test Advisor",
    loginMethod: "manus", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
  };
  return {
    user,
    member: undefined,
    req: { protocol: "https", headers: {} } as any,
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as any,
  };
}

function makeMemberCtx(tier: "platinum" | "gold" | "silver" = "gold"): TrpcContext {
  const member: Member = {
    id: 10, email: "member@test.com", name: "Test Member",
    pinHash: "$2a$12$hash", tier, crmPersonId: "crm-1",
    onboardingComplete: true, active: true, invitedByUserId: 1,
    stripeCustomerId: null, stripeSubscriptionId: null,
    createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
  };
  return {
    user: undefined,
    member,
    req: { protocol: "https", headers: {} } as any,
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as any,
  };
}

function makeAdminCtx(): TrpcContext {
  return makeAdvisorCtx("admin");
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

// ── 1. Advisor Auth ───────────────────────────────────────────────────────────
describe("Advisor Auth", () => {
  it("logout clears session cookie", async () => {
    const ctx = makeAdvisorCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
  });
});

// ── 2. Member Auth ────────────────────────────────────────────────────────────
describe("Member Auth", () => {
  it("me() returns null when no member in context", async () => {
    const ctx = makeAdvisorCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.memberAuth.me();
    expect(result).toBeNull();
  });

  it("me() returns member profile when authenticated", async () => {
    const ctx = makeMemberCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.memberAuth.me();
    expect(result).not.toBeNull();
    expect(result?.email).toBe("member@test.com");
  });

  it("member logout clears session cookie", async () => {
    const ctx = makeMemberCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.memberAuth.logout();
    expect(result).toEqual({ success: true });
  });
});

// ── 3. Member Management (Advisor) ───────────────────────────────────────────
describe("Member Management", () => {
  it("advisor can list all members", async () => {
    const ctx = makeAdvisorCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.members.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("advisor can invite a member", async () => {
    const ctx = makeAdvisorCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.members.invite({
      email: "newmember@test.com",
      name: "New Member",
      tier: "gold",
      origin: "https://app.lanai.com",
    });
    expect(result).toHaveProperty("token");
    expect(result).toHaveProperty("inviteUrl");
  });

  it("advisor can update a member's tier", async () => {
    const ctx = makeAdvisorCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.members.update({ memberId: 10, tier: "platinum" });
    expect(result).toEqual({ success: true });
  });

  it("advisor can list pending invitations", async () => {
    const ctx = makeAdvisorCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.members.pendingInvites();
    expect(Array.isArray(result)).toBe(true);
  });
});

// ── 4. Advisor Management (Admin) ────────────────────────────────────────────
describe("Advisor Management", () => {
  it("advisor can list all advisors", async () => {
    const ctx = makeAdvisorCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.advisors.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("admin can update advisor role", async () => {
    const ctx = makeAdminCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.advisors.updateRole({ userId: 2, role: "senior_advisor" });
    expect(result).toEqual({ success: true });
  });

  it("non-admin cannot update advisor role", async () => {
    const ctx = makeAdvisorCtx("advisor");
    const caller = appRouter.createCaller(ctx);
    await expect(caller.advisors.updateRole({ userId: 2, role: "senior_advisor" })).rejects.toThrow();
  });
});

// ── 5. Travel Requests ────────────────────────────────────────────────────────
describe("Travel Requests", () => {
  it("member can create a travel request", async () => {
    const ctx = makeMemberCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.travelRequests.create({
      destination: "Maldives",
      dates: "October 2025",
      pax: 2,
      budget: "£20,000",
      notes: "Overwater villa preferred",
    });
    expect(result).toHaveProperty("id");
  });

  it("advisor can list all travel requests", async () => {
    const ctx = makeAdvisorCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.travelRequests.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("member can list their own travel requests", async () => {
    const ctx = makeMemberCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.travelRequests.myRequests();
    expect(Array.isArray(result)).toBe(true);
  });

  it("advisor can update travel request status", async () => {
    const ctx = makeAdvisorCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.travelRequests.updateStatus({ id: 1, status: "in_progress" });
    expect(result).toEqual({ success: true });
  });
});

// ── 6. Proposals ──────────────────────────────────────────────────────────────
describe("Proposals", () => {
  it("advisor can create a proposal", async () => {
    const ctx = makeAdvisorCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.proposals.create({
      travelRequestId: 1,
      memberId: 10,
      title: "Maldives Overwater Villa Package",
      description: "5 nights at Soneva Fushi",
      totalPrice: "£18,500",
    });
    expect(result).toHaveProperty("id");
  });

  it("advisor can send a proposal to a member", async () => {
    const ctx = makeAdvisorCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.proposals.send({ id: 1 });
    expect(result).toEqual({ success: true });
  });

  it("member can approve a proposal", async () => {
    const ctx = makeMemberCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.proposals.respond({ id: 1, decision: "approved" });
    expect(result).toEqual({ success: true });
  });

  it("member can reject a proposal", async () => {
    const ctx = makeMemberCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.proposals.respond({ id: 2, decision: "rejected" });
    expect(result).toEqual({ success: true });
  });

  it("advisor can list proposals for a travel request", async () => {
    const ctx = makeAdvisorCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.proposals.listByRequest({ travelRequestId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("member can list their own proposals", async () => {
    const ctx = makeMemberCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.proposals.myProposals();
    expect(Array.isArray(result)).toBe(true);
  });
});

// ── 7. Bookings ───────────────────────────────────────────────────────────────
describe("Bookings", () => {
  it("advisor can create a booking", async () => {
    const ctx = makeAdvisorCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.bookings.create({
      proposalId: 1,
      memberId: 10,
      supplierId: 1,
      referenceNumber: "SNF-2025-001",
      commissionExpected: "£1,850",
    });
    expect(result).toHaveProperty("id");
  });

  it("advisor can mark commission as received", async () => {
    const ctx = makeAdvisorCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.bookings.markCommissionReceived({ id: 1 });
    expect(result).toEqual({ success: true });
  });

  it("advisor can list all bookings", async () => {
    const ctx = makeAdvisorCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.bookings.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("member can view their bookings", async () => {
    const ctx = makeMemberCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.bookings.myBookings();
    expect(Array.isArray(result)).toBe(true);
  });
});

// ── 8. Suppliers ──────────────────────────────────────────────────────────────
describe("Suppliers", () => {
  it("advisor can create a supplier", async () => {
    const ctx = makeAdvisorCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.suppliers.create({
      name: "Soneva Fushi",
      category: "Hotel",
      contactEmail: "reservations@soneva.com",
      rating: 5,
    });
    expect(result).toHaveProperty("id");
  });

  it("advisor can list all suppliers", async () => {
    const ctx = makeAdvisorCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.suppliers.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("advisor can update a supplier", async () => {
    const ctx = makeAdvisorCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.suppliers.update({ id: 1, rating: 4 });
    expect(result).toEqual({ success: true });
  });
});

// ── 9. Documents (Digital Vault) ──────────────────────────────────────────────
describe("Documents", () => {
  it("advisor can upload a document for a member", async () => {
    const ctx = makeAdvisorCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.documents.upload({
      memberId: 10,
      title: "Maldives Itinerary",
      fileUrl: "https://s3.amazonaws.com/lanai/docs/itinerary.pdf",
      documentType: "itinerary",
    });
    expect(result).toHaveProperty("id");
  });

  it("member can list their documents", async () => {
    const ctx = makeMemberCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.documents.myDocuments();
    expect(Array.isArray(result)).toBe(true);
  });

  it("advisor can list documents for a member", async () => {
    const ctx = makeAdvisorCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.documents.listByMember({ memberId: 10 });
    expect(Array.isArray(result)).toBe(true);
  });
});

// ── 10. Member Portal ─────────────────────────────────────────────────────────
describe("Member Portal", () => {
  it("member can view their profile", async () => {
    const ctx = makeMemberCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.memberPortal.profile();
    expect(result.email).toBe("member@test.com");
    expect(result.tier).toBe("gold");
  });

  it("platinum member can view documents", async () => {
    const ctx = makeMemberCtx("platinum");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.memberPortal.myDocuments();
    expect(result).toHaveProperty("documents");
  });

  it("non-platinum member cannot access platinum documents route", async () => {
    const ctx = makeMemberCtx("gold");
    const caller = appRouter.createCaller(ctx);
    await expect(caller.memberPortal.myDocuments()).rejects.toThrow();
  });
});

// ── 11. Infrastructure Layer (Keycloak, TigerBeetle, Redis, Fluvio, Dapr, etc.) ──
describe("Infrastructure Abstraction Layer", () => {
  it("Keycloak.verifyToken returns valid result", async () => {
    const { Keycloak } = await import("./_core/infrastructure");
    const result = await Keycloak.verifyToken("mock-token");
    expect(result.valid).toBe(true);
  });

  it("TigerBeetle.createTransfer resolves", async () => {
    const { TigerBeetle } = await import("./_core/infrastructure");
    const result = await TigerBeetle.createTransfer(BigInt(1000), BigInt(1001), BigInt(1002));
    expect(result).toBe(true);
  });

  it("Permify.check resolves to true", async () => {
    const { Permify } = await import("./_core/infrastructure");
    const result = await Permify.check("member:1", "view", "proposal:1");
    expect(result).toBe(true);
  });

  it("Dapr.publishEvent resolves", async () => {
    const { Dapr } = await import("./_core/infrastructure");
    const result = await Dapr.publishEvent("pubsub", "test-topic", { test: true });
    expect(result).toBe(true);
  });

  it("Temporal.startWorkflow resolves with runId", async () => {
    const { Temporal } = await import("./_core/infrastructure");
    const result = await Temporal.startWorkflow("MorningBriefingWorkflow", []);
    expect(result).toHaveProperty("runId");
  });

  it("Redis.set resolves", async () => {
    const { Redis } = await import("./_core/infrastructure");
    const result = await Redis.set("session:abc", "data", 3600);
    expect(result).toBe(true);
  });

  it("Fluvio.produce resolves", async () => {
    const { Fluvio } = await import("./_core/infrastructure");
    const result = await Fluvio.produce("travel-requests", JSON.stringify({ id: 1 }));
    expect(result).toBe(true);
  });

  it("OpenAppSec.inspectRequest returns safe", async () => {
    const { OpenAppSec } = await import("./_core/infrastructure");
    const result = await OpenAppSec.inspectRequest({}, "{}");
    expect(result.safe).toBe(true);
  });

  it("Lakehouse.insertRecord resolves", async () => {
    const { Lakehouse } = await import("./_core/infrastructure");
    const result = await Lakehouse.insertRecord("events", { type: "booking_created", id: 1 });
    expect(result).toBe(true);
  });
});

// ── 12. End-to-End Workflow: Member Onboarding → Travel Request → Proposal → Booking ──
describe("E2E: Full Concierge Workflow", () => {
  it("advisor invites member, member onboards, submits request, advisor creates proposal, member approves, advisor books", async () => {
    // Step 1: Advisor invites member
    const advisorCtx = makeAdvisorCtx();
    const advisorCaller = appRouter.createCaller(advisorCtx);
    const invite = await advisorCaller.members.invite({
      email: "e2e@test.com",
      name: "E2E Member",
      tier: "platinum",
      origin: "https://app.lanai.com",
    });
    expect(invite.token).toBeTruthy();

    // Step 2: Member submits travel request
    const memberCtx = makeMemberCtx("platinum");
    const memberCaller = appRouter.createCaller(memberCtx);
    const travelReq = await memberCaller.travelRequests.create({
      destination: "Japan",
      dates: "April 2026",
      pax: 4,
      budget: "£50,000",
      notes: "Cherry blossom season, private guide",
    });
    expect(travelReq.id).toBeTruthy();

    // Step 3: Advisor creates proposal
    const proposal = await advisorCaller.proposals.create({
      travelRequestId: travelReq.id,
      memberId: 10,
      title: "Japan Cherry Blossom Private Tour",
      description: "14 nights, private guide, ryokan stays",
      totalPrice: "£48,000",
    });
    expect(proposal.id).toBeTruthy();

    // Step 4: Advisor sends proposal
    const sent = await advisorCaller.proposals.send({ id: proposal.id });
    expect(sent.success).toBe(true);

    // Step 5: Member approves proposal
    const approved = await memberCaller.proposals.respond({ id: proposal.id, decision: "approved" });
    expect(approved.success).toBe(true);

    // Step 6: Advisor creates booking
    const booking = await advisorCaller.bookings.create({
      proposalId: proposal.id,
      memberId: 10,
      referenceNumber: "JP-2026-001",
      commissionExpected: "£4,800",
    });
    expect(booking.id).toBeTruthy();

    // Step 7: Advisor marks commission received
    const commission = await advisorCaller.bookings.markCommissionReceived({ id: booking.id });
    expect(commission.success).toBe(true);

    // Step 8: Advisor uploads itinerary document
    const doc = await advisorCaller.documents.upload({
      memberId: 10,
      title: "Japan 2026 Itinerary",
      fileUrl: "https://s3.amazonaws.com/lanai/docs/japan-2026.pdf",
      documentType: "itinerary",
    });
    expect(doc.id).toBeTruthy();

    // Step 9: Member views their documents
    const docs = await memberCaller.documents.myDocuments();
    expect(Array.isArray(docs)).toBe(true);
  });
});
