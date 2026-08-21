import { describe, expect, it, vi } from "vitest";
import type { Member, User } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";
import { installLegacySmokeHarness } from "./test/legacySmokeHarness";

// Retain the real PostgreSQL and Permify adapters. Only outbound delivery and
// workflow clients are isolated because their own integration suites exercise
// those adapters independently.
vi.mock("./_core/infrastructure", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./_core/infrastructure")>();
  return {
    ...actual,
    Dapr: {
      invokeService: vi.fn().mockResolvedValue({ success: true }),
      publishEvent: vi.fn().mockResolvedValue(true),
      invokeMethod: vi.fn().mockResolvedValue({ status: "ok" }),
    },
    Fluvio: {
      produce: vi.fn().mockResolvedValue(true),
      consume: vi.fn().mockResolvedValue([]),
    },
    Lakehouse: {
      insertRecord: vi.fn().mockResolvedValue(true),
      writeEvent: vi.fn().mockResolvedValue(true),
      query: vi.fn().mockResolvedValue([]),
    },
    Temporal: {
      startWorkflow: vi.fn().mockResolvedValue({
        workflowId: "wf-travel-coverage",
        runId: "run-travel-coverage",
      }),
      signalWorkflow: vi.fn().mockResolvedValue(true),
      queryWorkflow: vi.fn().mockResolvedValue({ status: "running" }),
    },
  };
});

installLegacySmokeHarness();

function makeAdvisorContext(): TrpcContext {
  const user: User = {
    id: 1,
    openId: "adv-1",
    email: "advisor@lanai.test",
    name: "Test Advisor",
    loginMethod: "keycloak",
    role: "advisor",
    avatarUrl: null,
    phone: null,
    bio: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    member: undefined,
    req: { protocol: "https", headers: {} } as never,
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as never,
  };
}

function makeMemberContext(): TrpcContext {
  const member: Member = {
    id: 10,
    email: "member@lanai.test",
    name: "Test Member",
    pinHash: "$2b$12$test-only-hash",
    tier: "platinum",
    crmPersonId: "crm-member-10",
    onboardingComplete: true,
    active: true,
    invitedByUserId: 1,
    assignedAdvisorId: 1,
    stripeCustomerId: "cus_test",
    stripeSubscriptionId: "sub_test",
    phone: null,
    nationality: null,
    passportNumber: null,
    passportExpiry: null,
    dateOfBirth: null,
    dietaryRequirements: null,
    accessibilityNeeds: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user: undefined,
    member,
    req: { protocol: "https", headers: {} } as never,
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as never,
  };
}

describe("travel router coverage", () => {
  it("persists a member request, exposes it to the owner, and assigns its advisor workflow", async () => {
    const member = appRouter.createCaller(makeMemberContext());
    const created = await member.travelRequests.create({
      destination: "Kyoto",
      dates: "2027-10-01 to 2027-10-08",
      pax: 2,
      budget: "18000.00",
      notes: "Private culture and wellness itinerary",
    });
    expect(created.id).toBeGreaterThan(0);

    const owned = await member.travelRequests.myRequests();
    expect(owned).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: created.id, destination: "Kyoto", status: "new" }),
      ]),
    );

    const advisor = appRouter.createCaller(makeAdvisorContext());
    await expect(
      advisor.travelRequests.updateStatus({
        id: created.id,
        status: "in_progress",
        assignedToUserId: 1,
      }),
    ).resolves.toEqual({ success: true });
    await expect(advisor.travelRequests.list()).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.id, assignedToUserId: 1 })]),
    );
  });

  it("creates, edits, prices, and exposes a member-safe proposal presentation", async () => {
    const advisor = appRouter.createCaller(makeAdvisorContext());
    await expect(
      advisor.proposals.create({
        travelRequestId: 1,
        memberId: 999,
        title: "Mismatched request",
      }),
    ).rejects.toThrow("Travel request and member do not match");

    const created = await advisor.proposals.create({
      travelRequestId: 1,
      memberId: 10,
      title: "Kyoto private ryokan escape",
      description: "A reviewable luxury itinerary",
      heroImageUrl: "https://cdn.lanai.test/kyoto.jpg",
      mapEmbedUrl: "https://maps.lanai.test/kyoto",
      clientMessage: "Please review the recommended option.",
      itinerary: [
        { day: 1, title: "Arrival", location: "Kyoto", activities: ["Private transfer"] },
      ],
      pricingTiers: [
        { name: "Recommended", totalPrice: "15000.00", currency: "GBP", recommended: true },
      ],
      totalPrice: "15000.00",
      currency: "gbp",
    });
    await expect(
      advisor.proposals.updatePresentation({
        id: created.id,
        clientMessage: "Updated after supplier confirmation.",
        totalPrice: "16000.00",
      }),
    ).resolves.toEqual({ id: created.id });

    const detail = await advisor.proposals.detail({ id: created.id });
    expect(detail).toEqual(
      expect.objectContaining({
        proposal: expect.objectContaining({ id: created.id, totalPrice: "16000.00", currency: "GBP" }),
        items: [],
        commercial: { totalPrice: "16000.00", totalCommission: 0, averageMarginPercent: 0 },
      }),
    );
    await expect(
      appRouter.createCaller(makeMemberContext()).proposals.myProposalDetail({ id: created.id }),
    ).resolves.toEqual(expect.objectContaining({ proposal: expect.objectContaining({ id: created.id }), items: [] }));
  });

  it("sends an advisor proposal and records the member decision only when Permify authorizes it", async () => {
    const advisor = appRouter.createCaller(makeAdvisorContext());
    await expect(advisor.proposals.send({ id: 2 })).resolves.toEqual({ success: true });
    await expect(advisor.proposals.listByRequest({ travelRequestId: 2 })).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 2, status: "sent" })]),
    );

    const member = appRouter.createCaller(makeMemberContext());
    await expect(member.proposals.respond({ id: 2, decision: "rejected" })).resolves.toEqual({ success: true });
    await expect(member.proposals.myProposals()).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 2, status: "rejected" })]),
    );
    await expect(member.proposals.respond({ id: 999_999, decision: "approved" })).rejects.toThrow(
      "Not authorized to respond to this proposal",
    );
  });

  it("creates a commission-backed booking, automates stage tasks, and records status and commission transitions", async () => {
    const advisor = appRouter.createCaller(makeAdvisorContext());
    await expect(
      advisor.bookings.create({ proposalId: 2, memberId: 10 }),
    ).rejects.toThrow("An approved proposal for this member is required");

    const booking = await advisor.bookings.create({
      proposalId: 1,
      memberId: 10,
      supplierId: 1,
      referenceNumber: "KYOTO-COVERAGE-1",
      commissionExpected: "1250.00",
      currency: "gbp",
    });
    expect(booking).toEqual(
      expect.objectContaining({ id: expect.any(Number), ledgerTransferId: "wf-travel-coverage" }),
    );
    expect(booking.taskAutomation.createdTaskIds).toEqual(expect.any(Array));

    const confirmed = await advisor.bookings.updateStatus({ id: booking.id, status: "confirmed" });
    expect(confirmed.id).toBe(booking.id);
    expect(confirmed.taskAutomation.createdTaskIds).toEqual(expect.any(Array));
    await expect(advisor.bookings.markCommissionReceived({ id: booking.id })).resolves.toEqual({ success: true });
    await expect(advisor.bookings.list()).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: booking.id, status: "confirmed", commissionReceived: true })]),
    );
    await expect(appRouter.createCaller(makeMemberContext()).bookings.myBookings()).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: booking.id })]),
    );
  });

  it("normalizes supplier data and grants member visibility only to uploaded visible documents", async () => {
    const advisor = appRouter.createCaller(makeAdvisorContext());
    const supplier = await advisor.suppliers.create({
      name: "Kyoto Ryokan Group",
      category: "Hotel",
      contactEmail: "Reservations@Kyoto.Test",
      rating: 5,
    });
    await expect(
      advisor.suppliers.update({ id: supplier.id, contactEmail: "Concierge@Kyoto.Test", rating: 4 }),
    ).resolves.toEqual({ success: true });
    await expect(advisor.suppliers.list()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: supplier.id, contactEmail: "concierge@kyoto.test", rating: 4 }),
      ]),
    );

    const visible = await advisor.documents.upload({
      memberId: 10,
      travelRequestId: 1,
      title: "Kyoto confirmed itinerary",
      fileUrl: "https://storage.lanai.test/kyoto-itinerary.pdf",
      documentType: "itinerary",
      isVisibleToMember: true,
    });
    const internal = await advisor.documents.upload({
      memberId: 10,
      title: "Internal supplier note",
      fileUrl: "https://storage.lanai.test/internal-note.pdf",
      documentType: "internal",
      isVisibleToMember: false,
    });
    await expect(advisor.documents.listByMember({ memberId: 10 })).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: visible.id }), expect.objectContaining({ id: internal.id })]),
    );
    await expect(appRouter.createCaller(makeMemberContext()).documents.myDocuments()).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: visible.id })]),
    );
  });
});
