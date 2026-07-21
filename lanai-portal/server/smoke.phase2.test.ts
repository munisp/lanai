/**
 * Lanai Lifestyle — Phase 2 Smoke Tests
 *
 * Covers all features from human tester feedback:
 *   1.  Extended Member Profiles (frequent flyer, loyalty, security, revenue)
 *   2.  Family Members
 *   3.  Supplier Services & Pricing Inquiries
 *   4.  Invoicing — Client Invoices (non-hotel services)
 *   5.  Invoicing — Commission Invoices (month-end supplier reconciliation)
 *   6.  Celebrations & Special Dates
 *   7.  NPS & Post-Trip Feedback
 *   8.  Communication Timeline (unified hub)
 *   9.  Task Templates (concierge-specific)
 *  10.  Trip Timeline
 *  11.  VIP Amenities & Welcome Gifts
 *  12.  Revenue Analytics Dashboard
 *  13.  AI Concierge Assistant
 *  14.  Phase 2 End-to-End Lifecycle
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import type { Request, Response } from "express";
import { appRouter } from "./routers";
import { installLegacySmokeHarness } from "./test/legacySmokeHarness";

// ─── Mock infrastructure ──────────────────────────────────────────────────────

vi.mock("./_core/infrastructure", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./_core/infrastructure")>();
  return {
    ...actual,
    // Authorization is validated against the real local Permify service.
    Permify: actual.Permify,
    Keycloak: {
      verifyToken: vi.fn().mockResolvedValue({ valid: true }),
      authenticate: vi
        .fn()
        .mockResolvedValue({ userId: "kc-123", roles: ["advisor"] }),
      introspect: vi.fn().mockResolvedValue({ active: true }),
      createUser: vi.fn().mockResolvedValue({ id: "kc-new-user" }),
    },
    TigerBeetle: {
      createAccount: vi.fn().mockResolvedValue(true),
      createTransfer: vi
        .fn()
        .mockResolvedValue({ created: true, transferId: BigInt(9_001) }),
      getBalance: vi
        .fn()
        .mockResolvedValue({ credits: BigInt(50_000), debits: BigInt(10_000) }),
    },
    Dapr: {
      invokeService: vi.fn().mockResolvedValue({ success: true }),
      publishEvent: vi.fn().mockResolvedValue(true),
      invokeMethod: vi.fn().mockResolvedValue({ status: "ok" }),
    },
    Temporal: {
      startWorkflow: vi
        .fn()
        .mockResolvedValue({ runId: "wf-1", workflowId: "wf-123" }),
      signalWorkflow: vi.fn().mockResolvedValue(true),
      queryWorkflow: vi.fn().mockResolvedValue({ status: "running" }),
    },
    Redis: {
      set: vi.fn().mockResolvedValue(true),
      get: vi.fn().mockResolvedValue(null),
      del: vi.fn().mockResolvedValue(1),
      incr: vi.fn().mockResolvedValue(1),
    },
    Lakehouse: {
      insertRecord: vi.fn().mockResolvedValue(true),
      writeEvent: vi.fn().mockResolvedValue(true),
      query: vi.fn().mockResolvedValue([]),
    },
    OpenAppSec: {
      inspectRequest: vi.fn().mockResolvedValue({ safe: true }),
      inspect: vi.fn().mockResolvedValue({ allowed: true, risk: "low" }),
    },
    Fluvio: {
      produce: vi.fn().mockResolvedValue(true),
      consume: vi.fn().mockResolvedValue([]),
    },
    Apisix: {
      registerRoute: vi.fn().mockResolvedValue(true),
      createRoute: vi.fn().mockResolvedValue({ id: "route-123" }),
    },
  };
});

// PostgreSQL is provided by installLegacySmokeHarness; no in-memory database fallback is used.

vi.mock("./email", () => ({
  sendInvitationEmail: vi.fn().mockResolvedValue({ id: "email-test-1" }),
}));

installLegacySmokeHarness();

// ─── Context factories ────────────────────────────────────────────────────────

const mockReq = {
  headers: { cookie: "" },
  get: vi.fn().mockReturnValue(""),
  protocol: "https",
  hostname: "localhost",
} as unknown as Request;

const mockRes = {
  cookie: vi.fn(),
  clearCookie: vi.fn(),
  setHeader: vi.fn(),
} as unknown as Response;

const makeAdvisorCtx = (
  role: "advisor" | "senior_advisor" | "admin" = "advisor",
) => ({
  user: {
    id: 1,
    email: "advisor@lanai.com",
    name: "Test Advisor",
    role,
    openId: "oid-1",
  },
  member: null,
  req: mockReq,
  res: mockRes,
});

const makeAdminCtx = () => makeAdvisorCtx("admin");
const makeSeniorCtx = () => makeAdvisorCtx("senior_advisor");

const makeMemberCtx = (tier: "platinum" | "gold" | "silver" = "platinum") => ({
  user: null,
  member: {
    id: 10,
    email: "member@test.com",
    name: "Test Member",
    tier,
    pinHash: null,
    crmPersonId: "crm-001",
    onboardingComplete: true,
    active: true,
    invitedByUserId: 1,
    assignedAdvisorId: 1,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    phone: "+44 7700 900000",
    nationality: "British",
    passportNumber: "GB123456",
    passportExpiry: new Date("2030-01-01"),
    dateOfBirth: new Date("1980-05-15"),
    dietaryRequirements: null,
    accessibilityNeeds: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    notes: null,
    lastSignedIn: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  req: mockReq,
  res: mockRes,
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Extended Member Profiles
// ─────────────────────────────────────────────────────────────────────────────

describe("1. Extended Member Profiles", () => {
  it("advisor: can upsert a member's extended profile with frequent flyer numbers", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.memberProfile.upsert({
      memberId: 10,
      frequentFlyerNumbers: [
        { airline: "British Airways", number: "BA123456789" },
        { airline: "Emirates", number: "EK987654321" },
      ],
      hotelLoyaltyNumbers: [
        {
          chain: "Marriott Bonvoy",
          number: "M123456789",
          tier: "Titanium Elite",
        },
        { chain: "Hilton Honors", number: "H987654321", tier: "Diamond" },
      ],
      preferredHotelBrands: ["Four Seasons", "Aman", "Rosewood"],
      seatPreference: "window",
      cabinClass: "first",
      dietaryRequirements: ["halal", "no-nuts"],
      travelStyle: ["luxury", "wellness", "cultural"],
      amenityPreferences: [
        "champagne on arrival",
        "fruit basket",
        "pillow menu",
      ],
      securityLevel: "enhanced",
      nda: true,
      conciergeNotes:
        "Prefers to be contacted via WhatsApp. Always books suites.",
    });
    expect(result).toHaveProperty("success", true);
    expect(result.memberId).toBe(10);
  });

  it("advisor: can set passport and visa expiry details", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.memberProfile.upsert({
      memberId: 10,
      visaExpiry: [
        { country: "USA", expiry: "2027-06-01" },
        { country: "UAE", expiry: "2028-01-15" },
      ],
      globalEntryNumber: "GE123456",
      knownTravellerNumber: "KTN789012",
    });
    expect(result.success).toBe(true);
  });

  it("advisor: can set personal assistant and family office contacts", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.memberProfile.upsert({
      memberId: 10,
      personalAssistantName: "Sarah Johnson",
      personalAssistantEmail: "sarah@familyoffice.com",
      personalAssistantPhone: "+44 7700 900001",
      familyOfficeContactName: "James Smith",
      familyOfficeContactEmail: "james@familyoffice.com",
      familyOfficeContactPhone: "+44 7700 900002",
      preferredPaymentMethod: "Amex Centurion",
      preferredCurrency: "GBP",
    });
    expect(result.success).toBe(true);
  });

  it("advisor: can update revenue metrics for a member", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.memberProfile.updateRevenue({
      memberId: 10,
      lifetimeRevenue: "125000.00",
      annualRevenue: "45000.00",
      membershipFeesPaid: "5000.00",
      satisfactionScore: "4.8",
      lastNpsScore: 9,
    });
    expect(result.success).toBe(true);
  });

  it("advisor: can get a member's extended profile", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.memberProfile.get({ memberId: 10 });
    // Returns null when db is mocked (no db), but the call should succeed
    expect(result == null || typeof result === "object").toBe(true);
  });

  it("platinum member: can view their own extended profile", async () => {
    const caller = appRouter.createCaller(makeMemberCtx("platinum"));
    const result = await caller.memberProfile.myProfile();
    expect(result == null || typeof result === "object").toBe(true);
  });

  it("gold member: can view their own extended profile", async () => {
    const caller = appRouter.createCaller(makeMemberCtx("gold"));
    const result = await caller.memberProfile.myProfile();
    expect(result == null || typeof result === "object").toBe(true);
  });

  it("silver member: can view their own extended profile", async () => {
    const caller = appRouter.createCaller(makeMemberCtx("silver"));
    const result = await caller.memberProfile.myProfile();
    expect(result == null || typeof result === "object").toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Family Members
// ─────────────────────────────────────────────────────────────────────────────

describe("2. Family Members", () => {
  it("advisor: can add a spouse to a member's family", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.familyMembers.add({
      memberId: 10,
      name: "Emma Thompson",
      relationship: "spouse",
      dateOfBirth: "1982-08-20",
      passportNumber: "GB654321",
      passportExpiry: "2030-08-20",
      nationality: "British",
      dietaryRequirements: "vegetarian",
    });
    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("name", "Emma Thompson");
  });

  it("advisor: can add children to a member's family", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const child1 = await caller.familyMembers.add({
      memberId: 10,
      name: "Oliver Thompson",
      relationship: "child",
      dateOfBirth: "2010-03-15",
      nationality: "British",
    });
    expect(child1).toHaveProperty("name", "Oliver Thompson");

    const child2 = await caller.familyMembers.add({
      memberId: 10,
      name: "Sophie Thompson",
      relationship: "child",
      dateOfBirth: "2013-11-22",
      nationality: "British",
    });
    expect(child2).toHaveProperty("name", "Sophie Thompson");
  });

  it("advisor: can list all family members for a member", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.familyMembers.list({ memberId: 10 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("advisor: can update a family member's details", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.familyMembers.update({
      id: 1,
      notes: "Allergic to shellfish",
    });
    expect(result.success).toBe(true);
  });

  it("advisor: can remove a family member", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.familyMembers.remove({ id: 99 });
    expect(result.success).toBe(true);
  });

  it("member: can view their own family members", async () => {
    const caller = appRouter.createCaller(makeMemberCtx("platinum"));
    const result = await caller.familyMembers.myFamily();
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Supplier Services & Pricing Inquiries
// ─────────────────────────────────────────────────────────────────────────────

describe("3. Supplier Services & Pricing Inquiries", () => {
  it("advisor: can add a service to a supplier (hotel rooms)", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.supplierServices.addService({
      supplierId: 1,
      serviceType: "hotel_rooms",
      description: "Luxury suites and rooms at Four Seasons London",
      basePrice: "450.00",
      currency: "GBP",
      commissionRate: "10.00",
      availability: "Year-round",
    });
    expect(result).toHaveProperty("id");
  });

  it("advisor: can add a private dining service to a supplier", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.supplierServices.addService({
      supplierId: 1,
      serviceType: "private_dining",
      description: "Exclusive private dining room for up to 12 guests",
      basePrice: "2500.00",
      currency: "GBP",
      commissionRate: "15.00",
    });
    expect(result).toHaveProperty("id");
  });

  it("advisor: can add a spa service to a supplier", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.supplierServices.addService({
      supplierId: 1,
      serviceType: "spa",
      description: "Full-day spa access with treatments",
      basePrice: "350.00",
      currency: "GBP",
    });
    expect(result).toHaveProperty("id");
  });

  it("advisor: can list all services for a supplier", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.supplierServices.listForSupplier({
      supplierId: 1,
    });
    expect(Array.isArray(result)).toBe(true);
  });

  it("advisor: can submit a pricing inquiry to a supplier for a specific client", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.supplierServices.submitPricingInquiry({
      supplierId: 1,
      travelRequestId: 1,
      memberId: 10,
      serviceType: "villa",
      requestDetails:
        "Client requires a 5-bedroom villa in Tuscany for 10 nights in August for a family of 6.",
      checkInDate: "2025-08-01",
      checkOutDate: "2025-08-11",
      guestCount: 6,
      budget: "25000.00",
      currency: "GBP",
    });
    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("status", "pending");
  });

  it("advisor: can list all pending pricing inquiries", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.supplierServices.listInquiries({
      status: "pending",
    });
    expect(Array.isArray(result)).toBe(true);
  });

  it("advisor: can respond to a pricing inquiry with a quote", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.supplierServices.respondToInquiry({
      inquiryId: 1,
      responseDetails:
        "We can offer Villa Toscana at £2,200/night. Includes private pool, chef, and concierge.",
      quotedPrice: "22000.00",
      status: "responded",
    });
    expect(result.success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Invoicing — Client Invoices
// ─────────────────────────────────────────────────────────────────────────────

describe("4. Invoicing — Client Invoices", () => {
  it("advisor: can create a client invoice for a villa booking", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.invoicing.createClientInvoice({
      memberId: 10,
      bookingId: 1,
      lineItems: [
        {
          itemType: "villa",
          description: "Villa Toscana — 10 nights (1–11 Aug 2025)",
          quantity: "10",
          unitPrice: "2200.00",
        },
        {
          itemType: "transfer",
          description: "Private airport transfer — Florence to Villa",
          quantity: "2",
          unitPrice: "350.00",
        },
        {
          itemType: "experience",
          description: "Private wine tasting tour — Chianti region",
          quantity: "1",
          unitPrice: "800.00",
        },
      ],
      currency: "GBP",
      taxAmount: "0",
      discountAmount: "500.00",
      notes: "10% loyalty discount applied",
      dueDate: "2025-07-01",
    });
    expect(result).toHaveProperty("invoiceNumber");
    expect(result).toHaveProperty("invoiceType", "client_service");
    expect(result).toHaveProperty("status", "draft");
    expect(result.memberId).toBe(10);
  });

  it("advisor: can create a client invoice for a yacht charter", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.invoicing.createClientInvoice({
      memberId: 10,
      lineItems: [
        {
          itemType: "yacht",
          description: "Sunseeker 75 Yacht Charter — 7 days, Côte d'Azur",
          quantity: "7",
          unitPrice: "4500.00",
        },
        {
          itemType: "ancillary",
          description: "Provisioning package (food & beverages)",
          quantity: "1",
          unitPrice: "2000.00",
        },
      ],
      currency: "EUR",
    });
    expect(result).toHaveProperty("invoiceNumber");
    expect(result.invoiceType).toBe("client_service");
  });

  it("advisor: can create a membership fee invoice", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.invoicing.createClientInvoice({
      memberId: 10,
      lineItems: [
        {
          itemType: "membership_fee",
          description: "Lanai Lifestyle Platinum Membership — Annual Fee 2025",
          quantity: "1",
          unitPrice: "5000.00",
        },
      ],
      currency: "GBP",
      dueDate: "2025-01-31",
    });
    expect(result.invoiceType).toBe("client_service");
  });

  it("advisor: can list all client invoices", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.invoicing.list({
      invoiceType: "client_service",
    });
    expect(Array.isArray(result)).toBe(true);
  });

  it("advisor: can mark a client invoice as sent", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.invoicing.updateStatus({
      invoiceId: 1,
      status: "sent",
      issuedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it("advisor: can mark a client invoice as paid", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.invoicing.updateStatus({
      invoiceId: 1,
      status: "paid",
      paidAt: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it("member: can view their own invoices", async () => {
    const caller = appRouter.createCaller(makeMemberCtx("platinum"));
    const result = await caller.invoicing.myInvoices();
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Invoicing — Commission Invoices (Month-End Reconciliation)
// ─────────────────────────────────────────────────────────────────────────────

describe("5. Invoicing — Commission Invoices", () => {
  it("advisor: can create a month-end commission invoice for a hotel supplier", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.invoicing.createCommissionInvoice({
      supplierId: 1,
      lineItems: [
        {
          description:
            "Commission: J. Thompson — Four Seasons London (3 nights, £1,800)",
          quantity: "1",
          unitPrice: "1800.00",
          commissionRate: "10.00",
          bookingId: 1,
        },
        {
          description:
            "Commission: A. Chen — Four Seasons London (5 nights, £3,000)",
          quantity: "1",
          unitPrice: "3000.00",
          commissionRate: "10.00",
          bookingId: 2,
        },
      ],
      currency: "GBP",
      notes: "June 2025 commission reconciliation",
      dueDate: "2025-07-15",
    });
    expect(result).toHaveProperty("invoiceNumber");
    expect(result).toHaveProperty("invoiceType", "commission");
    expect(result.supplierId).toBe(1);
  });

  it("advisor: can list all commission invoices", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.invoicing.list({ invoiceType: "commission" });
    expect(Array.isArray(result)).toBe(true);
  });

  it("advisor: can list overdue commission invoices", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.invoicing.list({
      invoiceType: "commission",
      status: "overdue",
    });
    expect(Array.isArray(result)).toBe(true);
  });

  it("advisor: can get a commission invoice with all line items", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.invoicing.getWithLineItems({ invoiceId: 1 });
    // Returns null when db is mocked, but the call should succeed
    expect(result == null || typeof result === "object").toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Celebrations & Special Dates
// ─────────────────────────────────────────────────────────────────────────────

describe("6. Celebrations & Special Dates", () => {
  it("advisor: can add a member's birthday", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.celebrations.add({
      memberId: 10,
      celebrationType: "birthday",
      title: "James Thompson's Birthday",
      celebrationDate: "1980-05-15",
      isRecurring: true,
      reminderDaysBefore: 30,
      notes:
        "Prefers Krug Champagne. Has previously enjoyed surprise experiences.",
      giftSuggestions: [
        "Krug Champagne",
        "Spa day",
        "Private dining experience",
      ],
    });
    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("celebrationType", "birthday");
  });

  it("advisor: can add a wedding anniversary", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.celebrations.add({
      memberId: 10,
      celebrationType: "anniversary",
      title: "James & Emma's Wedding Anniversary",
      celebrationDate: "2008-06-14",
      isRecurring: true,
      reminderDaysBefore: 45,
      notes:
        "10th anniversary in 2018 was celebrated in Maldives. 20th in 2028 — start planning.",
    });
    expect(result).toHaveProperty("celebrationType", "anniversary");
  });

  it("advisor: can add a child's birthday", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.celebrations.add({
      memberId: 10,
      celebrationType: "birthday",
      title: "Oliver's Birthday",
      celebrationDate: "2010-03-15",
      isRecurring: true,
      reminderDaysBefore: 14,
    });
    expect(result).toHaveProperty("id");
  });

  it("advisor: can list all celebrations for a member", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.celebrations.list({ memberId: 10 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("advisor: can list upcoming celebrations across all members (next 30 days)", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.celebrations.upcoming({ daysAhead: 30 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("member: can view their own celebrations", async () => {
    const caller = appRouter.createCaller(makeMemberCtx("platinum"));
    const result = await caller.celebrations.myCelebrations();
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. NPS & Post-Trip Feedback
// ─────────────────────────────────────────────────────────────────────────────

describe("7. NPS & Post-Trip Feedback", () => {
  it("platinum member: can submit an NPS score of 10 (promoter)", async () => {
    const caller = appRouter.createCaller(makeMemberCtx("platinum"));
    const result = await caller.nps.submit({
      score: 10,
      bookingId: 1,
      feedback:
        "Absolutely exceptional service. The team anticipated every need.",
    });
    expect(result).toHaveProperty("category", "promoter");
    expect(result.score).toBe(10);
  });

  it("gold member: can submit an NPS score of 7 (passive)", async () => {
    const caller = appRouter.createCaller(makeMemberCtx("gold"));
    const result = await caller.nps.submit({
      score: 7,
      feedback: "Good service overall, but communication could be faster.",
    });
    expect(result).toHaveProperty("category", "passive");
  });

  it("silver member: can submit an NPS score of 4 (detractor)", async () => {
    const caller = appRouter.createCaller(makeMemberCtx("silver"));
    const result = await caller.nps.submit({
      score: 4,
      feedback: "The hotel room was not as described. Disappointed.",
    });
    expect(result).toHaveProperty("category", "detractor");
    expect(result.followUpRequired).toBe(true);
  });

  it("advisor: can list all NPS responses", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.nps.list({});
    expect(Array.isArray(result)).toBe(true);
  });

  it("advisor: can filter NPS responses by detractors requiring follow-up", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.nps.list({
      category: "detractor",
      followUpRequired: true,
    });
    expect(Array.isArray(result)).toBe(true);
  });

  it("advisor: can mark a detractor follow-up as completed", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.nps.markFollowedUp({ npsId: 1 });
    expect(result.success).toBe(true);
  });

  it("admin: can get NPS summary statistics", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.nps.summary();
    expect(result).toHaveProperty("npsScore");
    expect(result).toHaveProperty("promoters");
    expect(result).toHaveProperty("detractors");
    expect(result).toHaveProperty("total");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Communication Timeline (Unified Hub)
// ─────────────────────────────────────────────────────────────────────────────

describe("8. Communication Timeline", () => {
  it("advisor: can log an outbound WhatsApp message to a member", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.communicationHub.log({
      memberId: 10,
      communicationType: "whatsapp",
      channel: "whatsapp",
      direction: "outbound",
      body: "Good morning James! Your Maldives itinerary is ready for review. Shall I send it over?",
      sentiment: "positive",
    });
    expect(result).toHaveProperty("id");
    expect(result.direction).toBe("outbound");
  });

  it("advisor: can log an inbound WhatsApp message from a member", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.communicationHub.log({
      memberId: 10,
      communicationType: "whatsapp",
      channel: "whatsapp",
      direction: "inbound",
      body: "Yes please! Also, can we add a private dolphin cruise?",
      sentiment: "positive",
      responseTimeMinutes: 3,
    });
    expect(result.direction).toBe("inbound");
  });

  it("advisor: can log a phone call with AI transcription and sentiment", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.communicationHub.log({
      memberId: 10,
      communicationType: "phone_call",
      direction: "inbound",
      subject: "Maldives trip review call",
      summary:
        "Member called to discuss the Maldives itinerary. Very happy with the proposal.",
      transcription:
        "Advisor: Good morning James. Member: Hi, I've reviewed the itinerary and it looks wonderful...",
      sentiment: "positive",
      sentimentScore: "0.92",
      durationSeconds: 840,
      travelRequestId: 1,
    });
    expect(result).toHaveProperty("id");
    expect(result.durationSeconds).toBe(840);
  });

  it("advisor: can log an internal note about a member", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.communicationHub.log({
      memberId: 10,
      communicationType: "internal_note",
      direction: "outbound",
      subject: "Member preference update",
      body: "James mentioned he prefers Aman properties over Four Seasons going forward. Update profile.",
    });
    expect(result).toHaveProperty("id");
    expect(result.communicationType).toBe("internal_note");
  });

  it("advisor: can log an email with a follow-up reminder", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.communicationHub.log({
      memberId: 10,
      communicationType: "email",
      channel: "email",
      direction: "outbound",
      subject: "Your Maldives Itinerary — Lanai Lifestyle",
      body: "Dear James, Please find attached your personalised Maldives itinerary...",
      followUpRequired: true,
      followUpDueAt: new Date(
        Date.now() + 3 * 24 * 60 * 60 * 1000,
      ).toISOString(),
    });
    expect(result.followUpRequired).toBe(true);
  });

  it("advisor: can get the full communication timeline for a member", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.communicationHub.getForMember({ memberId: 10 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("advisor: can filter communication timeline by WhatsApp only", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.communicationHub.getForMember({
      memberId: 10,
      communicationType: "whatsapp",
    });
    expect(Array.isArray(result)).toBe(true);
  });

  it("advisor: can list all pending follow-ups due in the next 7 days", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.communicationHub.pendingFollowUps({
      daysAhead: 7,
    });
    expect(Array.isArray(result)).toBe(true);
  });

  it("advisor: can mark a follow-up as completed", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.communicationHub.completeFollowUp({
      entryId: 1,
    });
    expect(result.success).toBe(true);
  });

  it("admin: can get response time analytics", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.communicationHub.responseTimeStats();
    expect(result).toHaveProperty("avgResponseMinutes");
    expect(result).toHaveProperty("slaBreaches");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Task Templates (Concierge-Specific)
// ─────────────────────────────────────────────────────────────────────────────

describe("9. Task Templates", () => {
  it("admin: can create an airport fast-track task template", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.taskTemplates.create({
      templateType: "airport_fast_track",
      name: "Airport Fast-Track Arrangement",
      description:
        "Arrange meet-and-greet and fast-track security for member at departure airport.",
      defaultPriority: "high",
      defaultDueDaysFromTrigger: 3,
      checklistItems: [
        { item: "Confirm flight details", required: true },
        { item: "Contact airport concierge service", required: true },
        { item: "Book fast-track security", required: true },
        { item: "Arrange buggy/wheelchair if needed", required: false },
        { item: "Send confirmation to member", required: true },
      ],
      triggerOnBookingStatus: "confirmed",
    });
    expect(result).toHaveProperty("id");
    expect(result.templateType).toBe("airport_fast_track");
  });

  it("admin: can create a villa provisioning task template", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.taskTemplates.create({
      templateType: "villa_provisioning",
      name: "Villa Provisioning Checklist",
      description:
        "Ensure villa is stocked and prepared according to member preferences.",
      defaultPriority: "medium",
      defaultDueDaysFromTrigger: 7,
      checklistItems: [
        {
          item: "Confirm dietary requirements with villa manager",
          required: true,
        },
        { item: "Order preferred wines and champagne", required: true },
        { item: "Arrange welcome flowers", required: false },
        { item: "Set up children's activities if applicable", required: false },
        { item: "Confirm pool heating and temperature", required: false },
      ],
    });
    expect(result.templateType).toBe("villa_provisioning");
  });

  it("admin: can create a celebration planning task template", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.taskTemplates.create({
      templateType: "celebration_planning",
      name: "Anniversary Celebration Planning",
      description: "Plan and coordinate a memorable anniversary celebration.",
      defaultPriority: "high",
      defaultDueDaysFromTrigger: 30,
      checklistItems: [
        { item: "Confirm celebration date and destination", required: true },
        { item: "Book private dining or special experience", required: true },
        { item: "Arrange flowers and champagne", required: true },
        { item: "Coordinate with hotel concierge", required: true },
        { item: "Prepare personalised card from Lanai team", required: false },
      ],
    });
    expect(result.templateType).toBe("celebration_planning");
  });

  it("admin: can create a visa check task template", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.taskTemplates.create({
      templateType: "visa_check",
      name: "Visa Requirements Check",
      description:
        "Verify visa requirements for all travellers before booking is confirmed.",
      defaultPriority: "urgent",
      defaultDueDaysFromTrigger: 1,
      checklistItems: [
        {
          item: "Check visa requirements for all destinations",
          required: true,
        },
        { item: "Verify passport expiry (min 6 months)", required: true },
        { item: "Check transit visa requirements", required: true },
        {
          item: "Advise member of any visa applications needed",
          required: true,
        },
      ],
    });
    expect(result.templateType).toBe("visa_check");
  });

  it("advisor: can list all active task templates", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.taskTemplates.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it("advisor: can instantiate a task from a template for a booking", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.taskTemplates.instantiateFromTemplate({
      templateId: 1,
      assignedToUserId: 1,
      memberId: 10,
      bookingId: 1,
      travelRequestId: 1,
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      additionalNotes: "Member is travelling with 2 children. Buggy required.",
    });
    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("status", "open");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Trip Timeline
// ─────────────────────────────────────────────────────────────────────────────

describe("10. Trip Timeline", () => {
  it("advisor: can add a completed trip to the member's timeline", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.tripTimeline.add({
      memberId: 10,
      travelRequestId: 1,
      bookingId: 1,
      title: "Maldives — One&Only Reethi Rah",
      destination: "Maldives",
      departureDate: "2024-11-01",
      returnDate: "2024-11-10",
      totalSpend: "28500.00",
      currency: "GBP",
      satisfactionScore: 5,
      highlights: [
        "Private snorkelling",
        "Sunset dolphin cruise",
        "Underwater dining",
      ],
      memberFeedback: "Absolutely perfect. Best holiday we've ever had.",
    });
    expect(result).toHaveProperty("id");
    expect(result.destination).toBe("Maldives");
  });

  it("advisor: can add a previous trip to build the member's history", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.tripTimeline.add({
      memberId: 10,
      title: "Amalfi Coast — Villa San Michele",
      destination: "Amalfi Coast, Italy",
      departureDate: "2024-06-15",
      returnDate: "2024-06-25",
      totalSpend: "18000.00",
      currency: "GBP",
      satisfactionScore: 4,
      highlights: ["Private boat charter", "Michelin-star dining"],
    });
    expect(result).toHaveProperty("id");
  });

  it("advisor: can get the full trip timeline for a member", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.tripTimeline.getForMember({ memberId: 10 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("member: can view their own trip history", async () => {
    const caller = appRouter.createCaller(makeMemberCtx("platinum"));
    const result = await caller.tripTimeline.myTrips();
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. VIP Amenities & Welcome Gifts
// ─────────────────────────────────────────────────────────────────────────────

describe("11. VIP Amenities & Welcome Gifts", () => {
  it("advisor: can request a welcome gift for a member's arrival", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.vipAmenities.request({
      memberId: 10,
      bookingId: 1,
      amenityType: "welcome_gift",
      description:
        "Krug Champagne, seasonal fruit basket, and personalised welcome card",
      cost: "250.00",
      currency: "GBP",
      notes: "To be placed in room before 3pm on arrival day",
    });
    expect(result).toHaveProperty("id");
    expect(result.amenityType).toBe("welcome_gift");
  });

  it("advisor: can request a room upgrade for a member", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.vipAmenities.request({
      memberId: 10,
      bookingId: 1,
      amenityType: "room_upgrade",
      description: "Upgrade from Ocean Villa to Overwater Grand Suite",
      supplierId: 1,
    });
    expect(result).toHaveProperty("id");
  });

  it("advisor: can request champagne and flowers for an anniversary", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.vipAmenities.request({
      memberId: 10,
      bookingId: 1,
      amenityType: "anniversary_setup",
      description:
        "Rose petals on bed, Moët & Chandon, red roses, and anniversary card",
      cost: "180.00",
      currency: "GBP",
    });
    expect(result).toHaveProperty("id");
  });

  it("advisor: can confirm a VIP amenity has been arranged", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.vipAmenities.confirm({ amenityId: 1 });
    expect(result.success).toBe(true);
  });

  it("advisor: can mark a VIP amenity as delivered", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.vipAmenities.markDelivered({ amenityId: 1 });
    expect(result.success).toBe(true);
  });

  it("advisor: can list all VIP amenities for a member", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.vipAmenities.list({ memberId: 10 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("advisor: can list all VIP amenities for a specific booking", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.vipAmenities.list({ bookingId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. Revenue Analytics Dashboard
// ─────────────────────────────────────────────────────────────────────────────

describe("12. Revenue Analytics Dashboard", () => {
  it("admin: can get today's revenue snapshot", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.revenueAnalytics.todaySnapshot();
    expect(result).toHaveProperty("snapshotDate");
    expect(result).toHaveProperty("totalDailyRevenue");
    expect(result).toHaveProperty("averageBookingValue");
    expect(result).toHaveProperty("membershipFeesCollected");
    expect(result).toHaveProperty("revenueByCategory");
    expect(result).toHaveProperty("bookingsCount");
  });

  it("admin: can get revenue breakdown by category for the last 30 days", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.revenueAnalytics.revenueByCategory({
      days: 30,
    });
    expect(result).toHaveProperty("hotels");
    expect(result).toHaveProperty("ancillary");
    expect(result).toHaveProperty("transport");
    expect(result).toHaveProperty("villas");
    expect(result).toHaveProperty("apartments");
    expect(result).toHaveProperty("total");
  });

  it("admin: can upsert a daily revenue snapshot", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.revenueAnalytics.upsertSnapshot({
      snapshotDate: new Date().toISOString().split("T")[0],
      totalDailyRevenue: "15750.00",
      averageBookingValue: "3150.00",
      membershipFeesCollected: "5000.00",
      revenueByCategory: {
        hotels: 8500,
        ancillary: 2250,
        transport: 1500,
        villas: 3500,
        apartments: 0,
      },
      bookingsCount: 5,
      newMembersCount: 2,
      activeRequestsCount: 12,
    });
    expect(result.success).toBe(true);
  });

  it("admin: can get membership fees collected to date", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.revenueAnalytics.membershipFeesSummary();
    expect(result).toHaveProperty("total");
    expect(result).toHaveProperty("platinum");
    expect(result).toHaveProperty("gold");
    expect(result).toHaveProperty("silver");
  });

  it("non-admin advisor: cannot access revenue analytics (UNAUTHORIZED)", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx("advisor"));
    await expect(caller.revenueAnalytics.todaySnapshot()).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. AI Concierge Assistant
// ─────────────────────────────────────────────────────────────────────────────

describe("13. AI Concierge Assistant", () => {
  it("platinum member: can get personalised destination recommendations", async () => {
    const caller = appRouter.createCaller(makeMemberCtx("platinum"));
    const result = await caller.aiConcierge.recommendDestinations({
      travelStyle: ["luxury", "wellness"],
      budget: "20000",
      travelMonth: "November",
      partySize: 2,
    });
    expect(result).toHaveProperty("recommendations");
    expect(Array.isArray(result.recommendations)).toBe(true);
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.recommendations[0]).toHaveProperty("destination");
    expect(result.recommendations[0]).toHaveProperty("reason");
    expect(result.recommendations[0]).toHaveProperty("suggestedSuppliers");
  });

  it("gold member: can get destination recommendations", async () => {
    const caller = appRouter.createCaller(makeMemberCtx("gold"));
    const result = await caller.aiConcierge.recommendDestinations({
      partySize: 4,
    });
    expect(result.tier).toBe("gold");
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it("silver member: can get destination recommendations", async () => {
    const caller = appRouter.createCaller(makeMemberCtx("silver"));
    const result = await caller.aiConcierge.recommendDestinations({
      partySize: 2,
    });
    expect(result.tier).toBe("silver");
  });

  it("advisor: can get AI upgrade suggestions for a proposal", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.aiConcierge.suggestUpgrades({
      proposalId: 1,
      memberId: 10,
    });
    expect(result).toHaveProperty("upgrades");
    expect(Array.isArray(result.upgrades)).toBe(true);
    expect(result.upgrades.length).toBeGreaterThan(0);
    expect(result.upgrades[0]).toHaveProperty("category");
    expect(result.upgrades[0]).toHaveProperty("suggested");
    expect(result.upgrades[0]).toHaveProperty("additionalCost");
  });

  it("advisor: can generate a post-trip follow-up message", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.aiConcierge.generateFollowUpMessage({
      memberId: 10,
      context: "post_trip",
      tripId: 1,
    });
    expect(result).toHaveProperty("suggestedMessage");
    expect(result).toHaveProperty("channels");
    expect(result.context).toBe("post_trip");
  });

  it("advisor: can generate a birthday follow-up message", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.aiConcierge.generateFollowUpMessage({
      memberId: 10,
      context: "birthday",
    });
    expect(result.context).toBe("birthday");
    expect(typeof result.suggestedMessage).toBe("string");
  });

  it("advisor: can generate an anniversary follow-up message", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.aiConcierge.generateFollowUpMessage({
      memberId: 10,
      context: "anniversary",
    });
    expect(result.context).toBe("anniversary");
  });

  it("advisor: can generate a re-engagement campaign message", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.aiConcierge.generateFollowUpMessage({
      memberId: 10,
      context: "re_engagement",
    });
    expect(result.context).toBe("re_engagement");
  });

  it("advisor: can generate an upsell message", async () => {
    const caller = appRouter.createCaller(makeAdvisorCtx());
    const result = await caller.aiConcierge.generateFollowUpMessage({
      memberId: 10,
      context: "upsell",
    });
    expect(result.context).toBe("upsell");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 14. Phase 2 End-to-End Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

describe("14. Phase 2 End-to-End Lifecycle", () => {
  it("complete Phase 2 lifecycle: profile → family → supplier → inquiry → invoice → celebration → NPS → comms → amenity → AI", async () => {
    const advisor = appRouter.createCaller(makeAdvisorCtx());
    const admin = appRouter.createCaller(makeAdminCtx());
    const platinumMember = appRouter.createCaller(makeMemberCtx("platinum"));

    // Step 1: Advisor builds out the member's extended profile
    const profileResult = await advisor.memberProfile.upsert({
      memberId: 10,
      frequentFlyerNumbers: [
        { airline: "British Airways", number: "BA123456" },
      ],
      hotelLoyaltyNumbers: [
        { chain: "Marriott Bonvoy", number: "M123456", tier: "Titanium" },
      ],
      preferredHotelBrands: ["Aman", "Four Seasons"],
      cabinClass: "first",
      securityLevel: "enhanced",
      nda: true,
      conciergeNotes:
        "High-value client. Always book suites. Prefers WhatsApp.",
    });
    expect(profileResult.success).toBe(true);

    // Step 2: Advisor adds family members
    const spouse = await advisor.familyMembers.add({
      memberId: 10,
      name: "Emma Thompson",
      relationship: "spouse",
      dateOfBirth: "1982-08-20",
      nationality: "British",
    });
    expect(spouse).toHaveProperty("id");

    // Step 3: Advisor adds a supplier service
    const service = await advisor.supplierServices.addService({
      supplierId: 1,
      serviceType: "villa",
      description: "Luxury villa with private pool",
      basePrice: "3000.00",
      commissionRate: "12.00",
    });
    expect(service).toHaveProperty("id");

    // Step 4: Advisor submits a pricing inquiry to the supplier
    const inquiry = await advisor.supplierServices.submitPricingInquiry({
      supplierId: 1,
      memberId: 10,
      serviceType: "villa",
      requestDetails: "5-bedroom villa for 10 nights in August for family of 4",
      guestCount: 4,
      budget: "30000.00",
    });
    expect(inquiry).toHaveProperty("status", "pending");

    // Step 5: Advisor responds to the inquiry
    const inquiryResponse = await advisor.supplierServices.respondToInquiry({
      inquiryId: 1,
      responseDetails: "Villa Toscana available at £2,800/night",
      quotedPrice: "28000.00",
      status: "responded",
    });
    expect(inquiryResponse.success).toBe(true);

    // Step 6: Advisor creates a client invoice
    const invoice = await advisor.invoicing.createClientInvoice({
      memberId: 10,
      lineItems: [
        {
          itemType: "villa",
          description: "Villa Toscana — 10 nights",
          quantity: "10",
          unitPrice: "2800.00",
        },
        {
          itemType: "transfer",
          description: "Airport transfers",
          quantity: "2",
          unitPrice: "400.00",
        },
      ],
      currency: "GBP",
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(invoice).toHaveProperty("invoiceNumber");

    // Step 7: Advisor adds a celebration
    const celebration = await advisor.celebrations.add({
      memberId: 10,
      celebrationType: "anniversary",
      title: "James & Emma's Anniversary",
      celebrationDate: "2025-06-14",
      isRecurring: true,
      reminderDaysBefore: 30,
    });
    expect(celebration).toHaveProperty("id");

    // Step 8: Advisor requests VIP amenities for the trip
    const amenity = await advisor.vipAmenities.request({
      memberId: 10,
      bookingId: 1,
      amenityType: "anniversary_setup",
      description: "Rose petals, champagne, and anniversary card",
      cost: "200.00",
    });
    expect(amenity).toHaveProperty("id");

    // Step 9: Advisor logs communication with the member
    const commEntry = await advisor.communicationHub.log({
      memberId: 10,
      communicationType: "whatsapp",
      channel: "whatsapp",
      direction: "outbound",
      body: "James, your Tuscany villa is confirmed! Invoice attached.",
      sentiment: "positive",
    });
    expect(commEntry).toHaveProperty("id");

    // Step 10: Member views their profile, family, and trip history
    const myProfile = await platinumMember.memberProfile.myProfile();
    expect(myProfile == null || typeof myProfile === "object").toBe(true);

    const myFamily = await platinumMember.familyMembers.myFamily();
    expect(Array.isArray(myFamily)).toBe(true);

    const myTrips = await platinumMember.tripTimeline.myTrips();
    expect(Array.isArray(myTrips)).toBe(true);

    const myInvoices = await platinumMember.invoicing.myInvoices();
    expect(Array.isArray(myInvoices)).toBe(true);

    // Step 11: Member submits NPS after the trip
    const nps = await platinumMember.nps.submit({
      score: 10,
      bookingId: 1,
      feedback: "Absolutely perfect. The anniversary setup was magical.",
    });
    expect(nps.category).toBe("promoter");

    // Step 12: Member gets AI destination recommendations for next trip
    const aiRecs = await platinumMember.aiConcierge.recommendDestinations({
      travelStyle: ["luxury", "romantic"],
      partySize: 2,
    });
    expect(aiRecs.recommendations.length).toBeGreaterThan(0);

    // Step 13: Admin reviews revenue analytics
    const snapshot = await admin.revenueAnalytics.todaySnapshot();
    expect(snapshot).toHaveProperty("snapshotDate");

    const npsStats = await admin.nps.summary();
    expect(npsStats).toHaveProperty("npsScore");

    // Step 14: Advisor creates a commission invoice for the supplier
    const commInvoice = await advisor.invoicing.createCommissionInvoice({
      supplierId: 1,
      lineItems: [
        {
          description:
            "Commission: Thompson — Villa Toscana (10 nights, £28,000)",
          quantity: "1",
          unitPrice: "28000.00",
          commissionRate: "12.00",
          bookingId: 1,
        },
      ],
      currency: "GBP",
      notes: "July 2025 commission reconciliation",
    });
    expect(commInvoice.invoiceType).toBe("commission");

    console.log("✅ Phase 2 End-to-End lifecycle completed successfully");
  });
});
