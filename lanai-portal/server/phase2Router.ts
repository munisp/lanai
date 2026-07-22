/**
 * Lanai Lifestyle — Phase 2 Router
 *
 * Implements all features from human tester feedback:
 *   1. Extended Member Profiles (frequent flyer, family, security, revenue)
 *   2. Supplier Services & Pricing Inquiries
 *   3. Invoicing (client invoices + commission invoices)
 *   4. Celebrations & Special Dates
 *   5. NPS & Post-Trip Feedback
 *   6. Communication Timeline (unified inbox with AI sentiment)
 *   7. Task Templates (concierge-specific)
 *   8. Trip Timeline
 *   9. VIP Amenities & Welcome Gifts
 *  10. Revenue Analytics Dashboard
 *  11. AI Concierge Assistant (recommendations + itinerary suggestions)
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  eq,
  and,
  desc,
  asc,
  gte,
  lte,
  sql,
  isNull,
  isNotNull,
} from "drizzle-orm";
import {
  router,
  publicProcedure,
  protectedProcedure,
  adminProcedure,
  memberProcedure,
  platinumMemberProcedure,
} from "./_core/trpc";
import { getDb } from "./db";
import {
  memberProfiles,
  memberFamilyMembers,
  supplierServices,
  pricingInquiries,
  invoices,
  invoiceLineItems,
  celebrations,
  npsResponses,
  communicationTimeline,
  taskTemplates,
  tripTimeline,
  vipAmenities,
  revenueSnapshots,
  members,
  bookings,
  suppliers,
  travelRequests,
  advisorTasks,
  memberPreferences,
  proposals,
} from "../drizzle/schema";
import { invokeLocalAi } from "./_core/localAi";
import { emitCrmDomainEvent } from "./_core/crmEvent";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateInvoiceNumber(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `LAN-${year}${month}-${rand}`;
}

async function buildConciergeMemberFacts(
  memberId: number,
): Promise<Record<string, unknown>> {
  const db = await getDb();
  const [
    member,
    profile,
    preferences,
    recentRequests,
    recentBookings,
    recentTrips,
    recentCommunications,
  ] = await Promise.all([
    db.select().from(members).where(eq(members.id, memberId)).limit(1),
    db
      .select()
      .from(memberProfiles)
      .where(eq(memberProfiles.memberId, memberId))
      .limit(1),
    db
      .select()
      .from(memberPreferences)
      .where(eq(memberPreferences.memberId, memberId))
      .limit(1),
    db
      .select()
      .from(travelRequests)
      .where(eq(travelRequests.memberId, memberId))
      .orderBy(desc(travelRequests.createdAt))
      .limit(20),
    db
      .select()
      .from(bookings)
      .where(eq(bookings.memberId, memberId))
      .orderBy(desc(bookings.createdAt))
      .limit(20),
    db
      .select()
      .from(tripTimeline)
      .where(eq(tripTimeline.memberId, memberId))
      .orderBy(desc(tripTimeline.departureDate))
      .limit(20),
    db
      .select()
      .from(communicationTimeline)
      .where(eq(communicationTimeline.memberId, memberId))
      .orderBy(desc(communicationTimeline.createdAt))
      .limit(30),
  ]);
  if (!member[0])
    throw new TRPCError({ code: "NOT_FOUND", message: "Member was not found" });
  return {
    member: { id: member[0].id, name: member[0].name, tier: member[0].tier },
    profile: profile[0] ?? null,
    preferences: preferences[0] ?? null,
    travel_requests: recentRequests.map((item) => ({
      destination: item.destination,
      dates: item.dates,
      pax: item.pax,
      budget: item.budget,
      status: item.status,
      notes: item.notes,
    })),
    bookings: recentBookings.map((item) => ({
      status: item.status,
      currency: item.currency,
      total_amount: item.totalAmount,
      commission_expected: item.commissionExpected,
      check_in: item.checkIn,
      check_out: item.checkOut,
    })),
    trips: recentTrips.map((item) => ({
      destination: item.destination,
      total_spend: item.totalSpend,
      satisfaction_score: item.satisfactionScore,
      highlights: item.highlights,
      feedback: item.memberFeedback,
    })),
    communications: recentCommunications.map((item) => ({
      type: item.communicationType,
      direction: item.direction,
      summary: item.summary,
      sentiment: item.sentiment,
      body: item.body,
      created_at: item.createdAt,
    })),
  };
}

// ─── 1. Extended Member Profiles ─────────────────────────────────────────────

export const memberProfileRouter = router({
  /** Advisor: get full extended profile for a member */
  get: protectedProcedure
    .input(z.object({ memberId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();

      const [profile] = await db
        .select()
        .from(memberProfiles)
        .where(eq(memberProfiles.memberId, input.memberId));
      return profile ?? null;
    }),

  /** Advisor: calculate transaction-derived member value for concierge prioritisation */
  revenueSummary: protectedProcedure
    .input(z.object({ memberId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const yearStart = new Date(new Date().getFullYear(), 0, 1);
      const [invoiceTotals] = await db
        .select({
          clientInvoicedRevenue: sql<string>`coalesce(sum(case when ${invoices.invoiceType} = 'client_service' and ${invoices.status} in ('issued', 'paid') then ${invoices.totalAmount} else 0 end), 0)`,
          clientPaidRevenue: sql<string>`coalesce(sum(case when ${invoices.invoiceType} = 'client_service' and ${invoices.status} = 'paid' then ${invoices.totalAmount} else 0 end), 0)`,
          annualClientRevenue: sql<string>`coalesce(sum(case when ${invoices.invoiceType} = 'client_service' and ${invoices.status} in ('issued', 'paid') and ${invoices.createdAt} >= ${yearStart} then ${invoices.totalAmount} else 0 end), 0)`,
        })
        .from(invoices)
        .where(eq(invoices.memberId, input.memberId));
      const [bookingTotals] = await db
        .select({
          bookingValue: sql<string>`coalesce(sum(${bookings.totalAmount}), 0)`,
          expectedCommission: sql<string>`coalesce(sum(${bookings.commissionExpected}), 0)`,
        })
        .from(bookings)
        .where(eq(bookings.memberId, input.memberId));
      const [profile] = await db
        .select({
          membershipFeesPaid: memberProfiles.membershipFeesPaid,
          satisfactionScore: memberProfiles.satisfactionScore,
          lastNpsScore: memberProfiles.lastNpsScore,
        })
        .from(memberProfiles)
        .where(eq(memberProfiles.memberId, input.memberId));

      return {
        clientInvoicedRevenue: invoiceTotals?.clientInvoicedRevenue ?? "0",
        clientPaidRevenue: invoiceTotals?.clientPaidRevenue ?? "0",
        annualClientRevenue: invoiceTotals?.annualClientRevenue ?? "0",
        bookingValue: bookingTotals?.bookingValue ?? "0",
        expectedCommission: bookingTotals?.expectedCommission ?? "0",
        membershipFeesPaid: profile?.membershipFeesPaid ?? "0",
        satisfactionScore: profile?.satisfactionScore ?? null,
        lastNpsScore: profile?.lastNpsScore ?? null,
      };
    }),

  /** Advisor: upsert extended profile */
  upsert: protectedProcedure
    .input(
      z.object({
        memberId: z.number().int().positive(),
        frequentFlyerNumbers: z
          .array(z.object({ airline: z.string(), number: z.string() }))
          .optional(),
        hotelLoyaltyNumbers: z
          .array(
            z.object({
              chain: z.string(),
              number: z.string(),
              tier: z.string().optional(),
            }),
          )
          .optional(),
        dateOfBirth: z.string().optional(),
        passportExpiry: z.string().optional(),
        visaExpiry: z
          .array(z.object({ country: z.string(), expiry: z.string() }))
          .optional(),
        preferredPaymentMethod: z.string().optional(),
        preferredCurrency: z.string().optional(),
        preferredHotelBrands: z.array(z.string()).optional(),
        roomPreferences: z.record(z.string(), z.string()).optional(),
        seatPreference: z.string().optional(),
        cabinClass: z.string().optional(),
        dietaryRequirements: z.array(z.string()).optional(),
        allergies: z.string().optional(),
        favouriteDestinations: z.array(z.string()).optional(),
        bucketListDestinations: z.array(z.string()).optional(),
        travelStyle: z.array(z.string()).optional(),
        amenityPreferences: z.array(z.string()).optional(),
        favouriteSupplierIds: z.array(z.number().int().positive()).optional(),
        anniversaryDate: z.string().optional(),
        weddingAnniversaryDate: z.string().optional(),
        personalAssistantName: z.string().optional(),
        personalAssistantEmail: z.string().email().optional(),
        personalAssistantPhone: z.string().optional(),
        familyOfficeContactName: z.string().optional(),
        familyOfficeContactEmail: z.string().email().optional(),
        familyOfficeContactPhone: z.string().optional(),
        securityLevel: z.enum(["standard", "enhanced", "maximum"]).optional(),
        privacyNotes: z.string().optional(),
        nda: z.boolean().optional(),
        conciergeNotes: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { memberId, dateOfBirth, passportExpiry, ...data } = input;
      const timestampData = {
        ...(dateOfBirth ? { dateOfBirth: new Date(dateOfBirth) } : {}),
        ...(passportExpiry ? { passportExpiry: new Date(passportExpiry) } : {}),
      };
      const existing = await db
        .select({ id: memberProfiles.id })
        .from(memberProfiles)
        .where(eq(memberProfiles.memberId, memberId));
      if (existing.length > 0) {
        await db
          .update(memberProfiles)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .set({
            ...(data as any),
            ...(timestampData as any),
            updatedAt: new Date(),
          })
          .where(eq(memberProfiles.memberId, memberId));
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await db
          .insert(memberProfiles)
          .values({ memberId, ...(data as any), ...(timestampData as any) });
      }
      await emitCrmDomainEvent({
        aggregateType: "member",
        aggregateId: memberId,
        eventType: "profile_updated",
        payload: { memberId },
        idempotencyKey: `member:${memberId}:profile:${Date.now()}`,
      });
      return { success: true, memberId };
    }),

  /** Member: view their own extended profile */
  myProfile: memberProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    const [profile] = await db
      .select()
      .from(memberProfiles)
      .where(eq(memberProfiles.memberId, ctx.member.id));
    return profile ?? null;
  }),

  /** Advisor: update revenue metrics for a member */
  updateRevenue: protectedProcedure
    .input(
      z.object({
        memberId: z.number().int().positive(),
        lifetimeRevenue: z.string().optional(),
        annualRevenue: z.string().optional(),
        membershipFeesPaid: z.string().optional(),
        satisfactionScore: z.string().optional(),
        lastNpsScore: z.number().int().min(0).max(10).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { memberId, ...data } = input;
      const [existing] = await db
        .select({ id: memberProfiles.id })
        .from(memberProfiles)
        .where(eq(memberProfiles.memberId, memberId));
      if (existing) {
        await db
          .update(memberProfiles)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(memberProfiles.memberId, memberId));
      } else {
        await db.insert(memberProfiles).values({ memberId, ...data });
      }
      await emitCrmDomainEvent({
        aggregateType: "member",
        aggregateId: memberId,
        eventType: "revenue_updated",
        payload: { memberId },
        idempotencyKey: `member:${memberId}:revenue:${Date.now()}`,
      });
      return { success: true };
    }),
});

// ─── 2. Family Members ────────────────────────────────────────────────────────

export const familyMembersRouter = router({
  list: protectedProcedure
    .input(z.object({ memberId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db
        .select()
        .from(memberFamilyMembers)
        .where(eq(memberFamilyMembers.memberId, input.memberId))
        .orderBy(asc(memberFamilyMembers.name));
    }),

  add: protectedProcedure
    .input(
      z.object({
        memberId: z.number().int().positive(),
        name: z.string().min(1),
        relationship: z.string().min(1),
        dateOfBirth: z.string().optional(),
        passportNumber: z.string().optional(),
        passportExpiry: z.string().optional(),
        nationality: z.string().optional(),
        dietaryRequirements: z.string().optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [created] = await db
        .insert(memberFamilyMembers)
        .values({
          ...input,
          dateOfBirth: input.dateOfBirth
            ? new Date(input.dateOfBirth)
            : undefined,
          passportExpiry: input.passportExpiry
            ? new Date(input.passportExpiry)
            : undefined,
        })
        .returning();
      return created;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().optional(),
        relationship: z.string().optional(),
        dateOfBirth: z.string().optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, ...data } = input;
      await db
        .update(memberFamilyMembers)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .set({ ...(data as any), updatedAt: new Date() })
        .where(eq(memberFamilyMembers.id, id));
      return { success: true };
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db
        .delete(memberFamilyMembers)
        .where(eq(memberFamilyMembers.id, input.id));
      return { success: true };
    }),

  /** Member: view their own family members */
  myFamily: memberProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    return db
      .select()
      .from(memberFamilyMembers)
      .where(eq(memberFamilyMembers.memberId, ctx.member.id))
      .orderBy(asc(memberFamilyMembers.name));
  }),
});

// ─── 3. Supplier Services & Pricing Inquiries ─────────────────────────────────

export const supplierServicesRouter = router({
  listForSupplier: protectedProcedure
    .input(z.object({ supplierId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db
        .select()
        .from(supplierServices)
        .where(
          and(
            eq(supplierServices.supplierId, input.supplierId),
            eq(supplierServices.isActive, true),
          ),
        )
        .orderBy(asc(supplierServices.serviceType));
    }),

  addService: protectedProcedure
    .input(
      z.object({
        supplierId: z.number().int().positive(),
        serviceType: z.string().min(1),
        description: z.string().optional(),
        basePrice: z.string().optional(),
        currency: z.string().default("GBP"),
        commissionRate: z.string().optional(),
        availability: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [created] = await db
        .insert(supplierServices)
        .values(input)
        .returning();
      return created;
    }),

  submitPricingInquiry: protectedProcedure
    .input(
      z.object({
        supplierId: z.number().int().positive(),
        travelRequestId: z.number().int().positive().optional(),
        memberId: z.number().int().positive().optional(),
        serviceType: z.string().min(1),
        requestDetails: z.string().min(10),
        checkInDate: z.string().optional(),
        checkOutDate: z.string().optional(),
        guestCount: z.number().int().positive().optional(),
        budget: z.string().optional(),
        currency: z.string().default("GBP"),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [created] = await db
        .insert(pricingInquiries)
        .values({
          ...input,
          requestedByUserId: ctx.user.id,
          checkInDate: input.checkInDate
            ? new Date(input.checkInDate)
            : undefined,
          checkOutDate: input.checkOutDate
            ? new Date(input.checkOutDate)
            : undefined,
        })
        .returning();
      await emitCrmDomainEvent({
        aggregateType: "pricing_inquiry",
        aggregateId: created.id,
        eventType: "created",
        payload: { pricingInquiryId: created.id },
        idempotencyKey: `pricing-inquiry:${created.id}:created`,
      });
      return created;
    }),

  listInquiries: protectedProcedure
    .input(
      z.object({
        supplierId: z.number().int().positive().optional(),
        status: z
          .enum(["pending", "responded", "accepted", "declined", "expired"])
          .optional(),
      }),
    )
    .query(async ({ input }) => {
      const db = await getDb();
      const conditions = [];
      if (input.supplierId)
        conditions.push(eq(pricingInquiries.supplierId, input.supplierId));
      if (input.status)
        conditions.push(eq(pricingInquiries.status, input.status));
      return db
        .select()
        .from(pricingInquiries)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(pricingInquiries.createdAt));
    }),

  respondToInquiry: protectedProcedure
    .input(
      z.object({
        inquiryId: z.number().int().positive(),
        responseDetails: z.string().min(1),
        quotedPrice: z.string().optional(),
        status: z.enum(["responded", "declined"]),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db
        .update(pricingInquiries)
        .set({
          responseDetails: input.responseDetails,
          quotedPrice: input.quotedPrice,
          status: input.status,
          respondedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(pricingInquiries.id, input.inquiryId));
      await emitCrmDomainEvent({
        aggregateType: "pricing_inquiry",
        aggregateId: input.inquiryId,
        eventType: `status_${input.status}`,
        payload: { pricingInquiryId: input.inquiryId, status: input.status },
        idempotencyKey: `pricing-inquiry:${input.inquiryId}:status:${input.status}:${Date.now()}`,
      });
      return { success: true };
    }),
});

// ─── 4. Invoicing ─────────────────────────────────────────────────────────────

export const invoicingRouter = router({
  /** Create a client invoice (for non-hotel services) */
  createClientInvoice: protectedProcedure
    .input(
      z.object({
        memberId: z.number().int().positive(),
        bookingId: z.number().int().positive().optional(),
        travelRequestId: z.number().int().positive().optional(),
        lineItems: z
          .array(
            z.object({
              itemType: z.enum([
                "hotel",
                "flight",
                "villa",
                "apartment",
                "yacht",
                "jet",
                "transfer",
                "restaurant",
                "event",
                "experience",
                "membership_fee",
                "ancillary",
                "other",
              ]),
              description: z.string().min(1),
              quantity: z.string().default("1"),
              unitPrice: z.string(),
              commissionRate: z.string().optional(),
              supplierId: z.number().int().positive().optional(),
            }),
          )
          .min(1),
        currency: z.string().default("GBP"),
        taxAmount: z.string().default("0"),
        discountAmount: z.string().default("0"),
        notes: z.string().optional(),
        dueDate: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const invoiceNumber = generateInvoiceNumber();
      const subtotal = input.lineItems.reduce(
        (sum, item) =>
          sum + parseFloat(item.unitPrice) * parseFloat(item.quantity),
        0,
      );
      const totalAmount =
        subtotal +
        parseFloat(input.taxAmount) -
        parseFloat(input.discountAmount);

      const [invoice] = await db
        .insert(invoices)
        .values({
          invoiceNumber,
          invoiceType: "client_service",
          status: "draft",
          memberId: input.memberId,
          bookingId: input.bookingId,
          travelRequestId: input.travelRequestId,
          subtotal: String(subtotal),
          taxAmount: input.taxAmount,
          discountAmount: input.discountAmount,
          totalAmount: String(totalAmount),
          currency: input.currency,
          notes: input.notes,
          dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
          createdByUserId: ctx.user.id,
        })
        .returning();

      // Insert line items
      const lineItemsToInsert = input.lineItems.map((item, idx) => ({
        invoiceId: invoice.id,
        itemType: item.itemType,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: String(
          parseFloat(item.unitPrice) * parseFloat(item.quantity),
        ),
        commissionRate: item.commissionRate,
        commissionAmount: item.commissionRate
          ? String(
              (parseFloat(item.unitPrice) *
                parseFloat(item.quantity) *
                parseFloat(item.commissionRate)) /
                100,
            )
          : undefined,
        supplierId: item.supplierId,
        sortOrder: idx,
      }));
      await db.insert(invoiceLineItems).values(lineItemsToInsert);
      await emitCrmDomainEvent({
        aggregateType: "invoice",
        aggregateId: invoice.id,
        eventType: "created",
        payload: { invoiceId: invoice.id, invoiceType: invoice.invoiceType },
        idempotencyKey: `invoice:${invoice.id}:created`,
      });

      return invoice;
    }),

  /** Create a commission invoice sent to a supplier at month-end */
  createCommissionInvoice: protectedProcedure
    .input(
      z.object({
        supplierId: z.number().int().positive(),
        lineItems: z
          .array(
            z.object({
              description: z.string().min(1),
              quantity: z.string().default("1"),
              unitPrice: z.string(),
              commissionRate: z.string(),
              bookingId: z.number().int().positive().optional(),
            }),
          )
          .min(1),
        currency: z.string().default("GBP"),
        notes: z.string().optional(),
        dueDate: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const invoiceNumber = generateInvoiceNumber();
      const subtotal = input.lineItems.reduce(
        (sum, item) =>
          sum +
          (parseFloat(item.unitPrice) *
            parseFloat(item.quantity) *
            parseFloat(item.commissionRate)) /
            100,
        0,
      );

      const [invoice] = await db
        .insert(invoices)
        .values({
          invoiceNumber,
          invoiceType: "commission",
          status: "draft",
          supplierId: input.supplierId,
          subtotal: String(subtotal),
          taxAmount: "0",
          discountAmount: "0",
          totalAmount: String(subtotal),
          currency: input.currency,
          notes: input.notes,
          dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
          createdByUserId: ctx.user.id,
        })
        .returning();

      const lineItemsToInsert = input.lineItems.map((item, idx) => ({
        invoiceId: invoice.id,
        itemType: "other" as const,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: String(
          parseFloat(item.unitPrice) * parseFloat(item.quantity),
        ),
        commissionRate: item.commissionRate,
        commissionAmount: String(
          (parseFloat(item.unitPrice) *
            parseFloat(item.quantity) *
            parseFloat(item.commissionRate)) /
            100,
        ),
        bookingId: item.bookingId,
        sortOrder: idx,
      }));
      await db.insert(invoiceLineItems).values(lineItemsToInsert);
      await emitCrmDomainEvent({
        aggregateType: "invoice",
        aggregateId: invoice.id,
        eventType: "created",
        payload: { invoiceId: invoice.id, invoiceType: invoice.invoiceType },
        idempotencyKey: `invoice:${invoice.id}:created`,
      });

      return invoice;
    }),

  /** Create one commission invoice per supplier for eligible bookings in a reconciliation month. */
  generateCommissionReconciliation: protectedProcedure
    .input(
      z.object({
        month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM"),
        supplierId: z.number().int().positive().optional(),
        dueDays: z.number().int().min(1).max(90).default(14),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [year, month] = input.month.split("-").map(Number);
      const periodStart = new Date(year, month - 1, 1);
      const periodEnd = new Date(year, month, 0, 23, 59, 59, 999);
      const conditions = [
        gte(bookings.checkOut, periodStart),
        lte(bookings.checkOut, periodEnd),
        isNotNull(bookings.supplierId),
        isNotNull(bookings.commissionExpected),
        sql`${bookings.status} in ('confirmed', 'paid')`,
      ];
      if (input.supplierId) {
        conditions.push(eq(bookings.supplierId, input.supplierId));
      }
      const eligibleBookings = await db
        .select()
        .from(bookings)
        .where(and(...conditions));
      const bookingsBySupplier = new Map<number, typeof eligibleBookings>();
      for (const booking of eligibleBookings) {
        if (!booking.supplierId) continue;
        const supplierBookings =
          bookingsBySupplier.get(booking.supplierId) ?? [];
        supplierBookings.push(booking);
        bookingsBySupplier.set(booking.supplierId, supplierBookings);
      }

      const created: {
        supplierId: number;
        invoiceId: number;
        invoiceNumber: string;
        totalAmount: string;
      }[] = [];
      const skipped: { supplierId: number; reason: string }[] = [];
      for (const [supplierId, supplierBookings] of bookingsBySupplier) {
        const [existing] = await db
          .select({ id: invoices.id })
          .from(invoices)
          .where(
            and(
              eq(invoices.supplierId, supplierId),
              eq(invoices.invoiceType, "commission"),
              eq(invoices.reconciliationPeriod, input.month),
            ),
          );
        if (existing) {
          skipped.push({
            supplierId,
            reason: "reconciliation invoice already exists",
          });
          continue;
        }

        const lineItems = supplierBookings.map((booking, index) => {
          const bookingValue = Number(booking.totalAmount ?? "0");
          const commissionAmount = Number(
            booking.commissionExpected ?? booking.commissionAmount ?? "0",
          );
          const commissionRate =
            bookingValue > 0 ? (commissionAmount / bookingValue) * 100 : 0;
          return {
            invoiceId: 0,
            itemType: "other" as const,
            description: `Commission reconciliation for booking ${booking.referenceNumber ?? booking.id}`,
            quantity: "1",
            unitPrice: String(bookingValue),
            totalPrice: String(bookingValue),
            commissionRate: commissionRate.toFixed(4),
            commissionAmount: String(commissionAmount),
            bookingId: booking.id,
            sortOrder: index,
          };
        });
        const totalAmount = lineItems.reduce(
          (sum, item) => sum + Number(item.commissionAmount),
          0,
        );
        const dueDate = new Date(periodEnd);
        dueDate.setDate(dueDate.getDate() + input.dueDays);
        const [invoice] = await db
          .insert(invoices)
          .values({
            invoiceNumber: generateInvoiceNumber(),
            invoiceType: "commission",
            status: "draft",
            supplierId,
            subtotal: String(totalAmount),
            taxAmount: "0",
            discountAmount: "0",
            totalAmount: String(totalAmount),
            currency: supplierBookings[0]?.currency ?? "GBP",
            notes: `Automated ${input.month} supplier commission reconciliation.`,
            reconciliationPeriod: input.month,
            dueDate,
            createdByUserId: ctx.user.id,
          })
          .returning();
        await db
          .insert(invoiceLineItems)
          .values(
            lineItems.map((item) => ({ ...item, invoiceId: invoice.id })),
          );
        await emitCrmDomainEvent({
          aggregateType: "invoice",
          aggregateId: invoice.id,
          eventType: "commission_reconciliation_generated",
          payload: { invoiceId: invoice.id, supplierId, period: input.month },
          idempotencyKey: `invoice:${invoice.id}:commission-reconciliation:${input.month}`,
        });
        created.push({
          supplierId,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          totalAmount: String(totalAmount),
        });
      }

      return {
        period: input.month,
        eligibleBookings: eligibleBookings.length,
        created,
        skipped,
      };
    }),

  list: protectedProcedure
    .input(
      z.object({
        invoiceType: z.enum(["client_service", "commission"]).optional(),
        status: z
          .enum(["draft", "sent", "paid", "overdue", "voided", "disputed"])
          .optional(),
        memberId: z.number().int().positive().optional(),
        supplierId: z.number().int().positive().optional(),
      }),
    )
    .query(async ({ input }) => {
      const db = await getDb();
      const conditions = [];
      if (input.invoiceType)
        conditions.push(eq(invoices.invoiceType, input.invoiceType));
      if (input.status) conditions.push(eq(invoices.status, input.status));
      if (input.memberId)
        conditions.push(eq(invoices.memberId, input.memberId));
      if (input.supplierId)
        conditions.push(eq(invoices.supplierId, input.supplierId));
      return db
        .select()
        .from(invoices)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(invoices.createdAt));
    }),

  getWithLineItems: protectedProcedure
    .input(z.object({ invoiceId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [invoice] = await db
        .select()
        .from(invoices)
        .where(eq(invoices.id, input.invoiceId));
      if (!invoice) return null;
      const items = await db
        .select()
        .from(invoiceLineItems)
        .where(eq(invoiceLineItems.invoiceId, input.invoiceId))
        .orderBy(asc(invoiceLineItems.sortOrder));
      return { ...invoice, lineItems: items };
    }),

  updateStatus: protectedProcedure
    .input(
      z.object({
        invoiceId: z.number().int().positive(),
        status: z.enum([
          "draft",
          "sent",
          "paid",
          "overdue",
          "voided",
          "disputed",
        ]),
        paidAt: z.string().optional(),
        issuedAt: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db
        .update(invoices)
        .set({
          status: input.status,
          paidAt: input.paidAt ? new Date(input.paidAt) : undefined,
          issuedAt: input.issuedAt ? new Date(input.issuedAt) : undefined,
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, input.invoiceId));
      await emitCrmDomainEvent({
        aggregateType: "invoice",
        aggregateId: input.invoiceId,
        eventType: `status_${input.status}`,
        payload: { invoiceId: input.invoiceId, status: input.status },
        idempotencyKey: `invoice:${input.invoiceId}:status:${input.status}:${Date.now()}`,
      });
      return { success: true };
    }),

  /** Member: view their own invoices */
  myInvoices: memberProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    return db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.memberId, ctx.member.id),
          eq(invoices.invoiceType, "client_service"),
        ),
      )
      .orderBy(desc(invoices.createdAt));
  }),
});

// ─── 5. Celebrations & Special Dates ─────────────────────────────────────────

export const celebrationsRouter = router({
  list: protectedProcedure
    .input(z.object({ memberId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db
        .select()
        .from(celebrations)
        .where(eq(celebrations.memberId, input.memberId))
        .orderBy(asc(celebrations.celebrationDate));
    }),

  /** List upcoming celebrations across all members (for advisor dashboard) */
  upcoming: protectedProcedure
    .input(z.object({ daysAhead: z.number().int().positive().default(30) }))
    .query(async ({ input }) => {
      const db = await getDb();
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + input.daysAhead);
      return db
        .select()
        .from(celebrations)
        .where(lte(celebrations.celebrationDate, cutoff))
        .orderBy(asc(celebrations.celebrationDate));
    }),

  add: protectedProcedure
    .input(
      z.object({
        memberId: z.number().int().positive(),
        celebrationType: z.enum([
          "birthday",
          "anniversary",
          "graduation",
          "honeymoon",
          "retirement",
          "promotion",
          "other",
        ]),
        title: z.string().min(1),
        celebrationDate: z.string(),
        isRecurring: z.boolean().default(true),
        familyMemberId: z.number().int().positive().optional(),
        reminderDaysBefore: z.number().int().positive().default(30),
        notes: z.string().optional(),
        giftSuggestions: z.array(z.string()).optional(),
        giftBudget: z
          .string()
          .regex(/^\d+(\.\d{1,2})?$/)
          .optional(),
        giftStatus: z
          .enum(["pending", "arranged", "delivered", "cancelled"])
          .optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [created] = await db
        .insert(celebrations)
        .values({
          ...input,
          celebrationDate: new Date(input.celebrationDate),
        })
        .returning();
      await emitCrmDomainEvent({
        aggregateType: "celebration",
        aggregateId: created.id,
        eventType: "created",
        payload: { celebrationId: created.id, memberId: created.memberId },
        idempotencyKey: `celebration:${created.id}:created`,
      });
      return created;
    }),

  /** Member: view their own celebrations */
  myCelebrations: memberProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    return db
      .select()
      .from(celebrations)
      .where(eq(celebrations.memberId, ctx.member.id))
      .orderBy(asc(celebrations.celebrationDate));
  }),
});

// ─── 6. NPS & Post-Trip Feedback ─────────────────────────────────────────────

export const npsRouter = router({
  submit: memberProcedure
    .input(
      z.object({
        score: z.number().int().min(0).max(10),
        bookingId: z.number().int().positive().optional(),
        travelRequestId: z.number().int().positive().optional(),
        feedback: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const category =
        input.score >= 9
          ? "promoter"
          : input.score >= 7
            ? "passive"
            : "detractor";
      const [created] = await db
        .insert(npsResponses)
        .values({
          memberId: ctx.member.id,
          score: input.score,
          category,
          bookingId: input.bookingId,
          travelRequestId: input.travelRequestId,
          feedback: input.feedback,
          followUpRequired: category === "detractor",
        })
        .returning();
      await emitCrmDomainEvent({
        aggregateType: "nps_response",
        aggregateId: created.id,
        eventType: "submitted",
        payload: { npsResponseId: created.id, memberId: created.memberId },
        idempotencyKey: `nps:${created.id}:submitted`,
      });
      return created;
    }),

  list: protectedProcedure
    .input(
      z.object({
        memberId: z.number().int().positive().optional(),
        category: z.enum(["promoter", "passive", "detractor"]).optional(),
        followUpRequired: z.boolean().optional(),
      }),
    )
    .query(async ({ input }) => {
      const db = await getDb();
      const conditions = [];
      if (input.memberId)
        conditions.push(eq(npsResponses.memberId, input.memberId));
      if (input.category)
        conditions.push(eq(npsResponses.category, input.category));
      if (input.followUpRequired !== undefined)
        conditions.push(
          eq(npsResponses.followUpRequired, input.followUpRequired),
        );
      return db
        .select()
        .from(npsResponses)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(npsResponses.createdAt));
    }),

  markFollowedUp: protectedProcedure
    .input(z.object({ npsId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      await db
        .update(npsResponses)
        .set({
          followUpRequired: false,
          followedUpAt: new Date(),
          followedUpByUserId: ctx.user.id,
        })
        .where(eq(npsResponses.id, input.npsId));
      await emitCrmDomainEvent({
        aggregateType: "nps_response",
        aggregateId: input.npsId,
        eventType: "follow_up_completed",
        payload: { npsResponseId: input.npsId },
        idempotencyKey: `nps:${input.npsId}:follow-up-completed`,
      });
      return { success: true };
    }),

  /** Admin: get NPS summary statistics */
  summary: adminProcedure.query(async () => {
    const db = await getDb();

    const all = await db
      .select({ category: npsResponses.category })
      .from(npsResponses);
    const promoters = all.filter((r) => r.category === "promoter").length;
    const passives = all.filter((r) => r.category === "passive").length;
    const detractors = all.filter((r) => r.category === "detractor").length;
    const total = all.length;
    const npsScore =
      total > 0 ? Math.round(((promoters - detractors) / total) * 100) : 0;
    return { promoters, passives, detractors, npsScore, total };
  }),
});

// ─── 7. Communication Timeline ────────────────────────────────────────────────

export const communicationHubRouter = router({
  /** Log a communication entry (email, call, WhatsApp, note) */
  log: protectedProcedure
    .input(
      z.object({
        memberId: z.number().int().positive(),
        communicationType: z.enum([
          "email",
          "whatsapp",
          "phone_call",
          "portal_message",
          "internal_note",
          "sms",
        ]),
        channel: z.enum(["whatsapp", "email", "portal", "sms"]).optional(),
        direction: z.enum(["inbound", "outbound"]),
        subject: z.string().optional(),
        body: z.string().optional(),
        summary: z.string().optional(),
        transcription: z.string().optional(),
        sentiment: z
          .enum(["positive", "neutral", "negative", "urgent"])
          .optional(),
        durationSeconds: z.number().int().positive().optional(),
        travelRequestId: z.number().int().positive().optional(),
        bookingId: z.number().int().positive().optional(),
        followUpRequired: z.boolean().default(false),
        followUpDueAt: z.string().optional(),
        responseTimeMinutes: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [created] = await db
        .insert(communicationTimeline)
        .values({
          ...input,
          advisorUserId: ctx.user.id,
          followUpDueAt: input.followUpDueAt
            ? new Date(input.followUpDueAt)
            : undefined,
        })
        .returning();
      await emitCrmDomainEvent({
        aggregateType: "communication",
        aggregateId: created.id,
        eventType: "logged",
        payload: { communicationId: created.id, memberId: created.memberId },
        idempotencyKey: `communication:${created.id}:logged`,
      });
      return created;
    }),

  /** Analyze unstructured communication through the local CPU gateway before persistence. */
  analyzeAndLog: protectedProcedure
    .input(
      z.object({
        memberId: z.number().int().positive(),
        communicationType: z.enum([
          "email",
          "whatsapp",
          "phone_call",
          "portal_message",
          "internal_note",
          "sms",
        ]),
        channel: z.enum(["whatsapp", "email", "portal", "sms"]).optional(),
        direction: z.enum(["inbound", "outbound"]),
        subject: z.string().max(512).optional(),
        body: z.string().max(20_000).optional(),
        transcription: z.string().max(20_000).optional(),
        durationSeconds: z.number().int().positive().optional(),
        travelRequestId: z.number().int().positive().optional(),
        bookingId: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const content = input.transcription?.trim() || input.body?.trim();
      if (!content) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "A message body or call transcription is required for AI analysis",
        });
      }
      const facts = await buildConciergeMemberFacts(input.memberId);
      const result = await invokeLocalAi({
        capability: "intelligence",
        responseFormat: "json",
        system:
          "Analyze a concierge communication only from supplied content and member facts. Do not fabricate facts. Return JSON {summary:string,transcription:string|null,sentiment:positive|neutral|negative|urgent,sentiment_score:number,inquiry_category:booking|service_request|issue|feedback|celebration|visa|general,follow_up_required:boolean,follow_up_hours:number,entities:[string],routing_notes:string}. Use transcription only to clean supplied call text; never claim audio was processed when it was not supplied.",
        prompt: JSON.stringify({ member_facts: facts, communication: input }),
        temperature: 0.1,
        maxTokens: 900,
        metadata: {
          feature: "communication_intake",
          memberId: input.memberId,
          channel: input.channel ?? input.communicationType,
        },
      });
      const analysis = result.structured ?? {};
      const sentiment = analysis.sentiment;
      const allowedSentiment =
        sentiment === "positive" ||
        sentiment === "neutral" ||
        sentiment === "negative" ||
        sentiment === "urgent"
          ? sentiment
          : "neutral";
      const category = analysis.inquiry_category;
      const allowedCategories = [
        "booking",
        "service_request",
        "issue",
        "feedback",
        "celebration",
        "visa",
        "general",
      ];
      const inquiryCategory =
        typeof category === "string" && allowedCategories.includes(category)
          ? category
          : "general";
      const followUpRequired =
        analysis.follow_up_required === true || allowedSentiment === "urgent";
      const hours =
        typeof analysis.follow_up_hours === "number" &&
        Number.isFinite(analysis.follow_up_hours)
          ? Math.min(24 * 30, Math.max(1, Math.round(analysis.follow_up_hours)))
          : 24;
      const followUpDueAt = followUpRequired
        ? new Date(Date.now() + hours * 60 * 60 * 1000)
        : undefined;
      const [created] = await (
        await getDb()
      )
        .insert(communicationTimeline)
        .values({
          ...input,
          advisorUserId: ctx.user.id,
          body: input.body ?? content,
          transcription:
            typeof analysis.transcription === "string"
              ? analysis.transcription
              : input.transcription,
          summary:
            typeof analysis.summary === "string"
              ? analysis.summary
              : content.slice(0, 500),
          sentiment: allowedSentiment,
          sentimentScore:
            typeof analysis.sentiment_score === "number" &&
            Number.isFinite(analysis.sentiment_score)
              ? String(Math.max(-1, Math.min(1, analysis.sentiment_score)))
              : undefined,
          inquiryCategory,
          aiAnalysis: {
            entities: Array.isArray(analysis.entities) ? analysis.entities : [],
            routing_notes:
              typeof analysis.routing_notes === "string"
                ? analysis.routing_notes
                : "",
            model_output: analysis,
          },
          followUpRequired,
          followUpDueAt,
        })
        .returning();
      await emitCrmDomainEvent({
        aggregateType: "communication",
        aggregateId: created.id,
        eventType: "analyzed",
        payload: { communicationId: created.id, memberId: created.memberId },
        idempotencyKey: `communication:${created.id}:analyzed`,
      });
      return created;
    }),

  /** Get full communication timeline for a member */
  getForMember: protectedProcedure
    .input(
      z.object({
        memberId: z.number().int().positive(),
        communicationType: z
          .enum([
            "email",
            "whatsapp",
            "phone_call",
            "portal_message",
            "internal_note",
            "sms",
          ])
          .optional(),
        limit: z.number().int().positive().default(50),
      }),
    )
    .query(async ({ input }) => {
      const db = await getDb();
      const conditions = [eq(communicationTimeline.memberId, input.memberId)];
      if (input.communicationType)
        conditions.push(
          eq(communicationTimeline.communicationType, input.communicationType),
        );
      return db
        .select()
        .from(communicationTimeline)
        .where(and(...conditions))
        .orderBy(desc(communicationTimeline.createdAt))
        .limit(input.limit);
    }),

  /** List all follow-ups due */
  pendingFollowUps: protectedProcedure
    .input(z.object({ daysAhead: z.number().int().positive().default(7) }))
    .query(async ({ input }) => {
      const db = await getDb();
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + input.daysAhead);
      return db
        .select()
        .from(communicationTimeline)
        .where(
          and(
            eq(communicationTimeline.followUpRequired, true),
            isNull(communicationTimeline.followUpCompletedAt),
            lte(communicationTimeline.followUpDueAt, cutoff),
          ),
        )
        .orderBy(asc(communicationTimeline.followUpDueAt));
    }),

  /** Mark a follow-up as completed */
  completeFollowUp: protectedProcedure
    .input(z.object({ entryId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db
        .update(communicationTimeline)
        .set({ followUpCompletedAt: new Date(), updatedAt: new Date() })
        .where(eq(communicationTimeline.id, input.entryId));
      await emitCrmDomainEvent({
        aggregateType: "communication",
        aggregateId: input.entryId,
        eventType: "follow_up_completed",
        payload: { communicationId: input.entryId },
        idempotencyKey: `communication:${input.entryId}:follow-up-completed`,
      });
      return { success: true };
    }),

  /** Get response time analytics */
  responseTimeStats: adminProcedure.query(async () => {
    const db = await getDb();
    const entries = await db
      .select({
        responseTimeMinutes: communicationTimeline.responseTimeMinutes,
      })
      .from(communicationTimeline)
      .where(isNotNull(communicationTimeline.responseTimeMinutes));
    const times = entries
      .map((e) => e.responseTimeMinutes ?? 0)
      .filter((t) => t > 0);
    const avg =
      times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    const slaBreaches = times.filter((t) => t > 60).length; // SLA: respond within 60 minutes
    return { avgResponseMinutes: Math.round(avg), slaBreaches };
  }),
});

// ─── 8. Task Templates ────────────────────────────────────────────────────────

export const taskTemplatesRouter = router({
  list: protectedProcedure.query(async () => {
    const db = await getDb();

    return db
      .select()
      .from(taskTemplates)
      .where(eq(taskTemplates.isActive, true));
  }),

  create: adminProcedure
    .input(
      z.object({
        templateType: z.enum([
          "airport_fast_track",
          "villa_provisioning",
          "yacht_charter",
          "restaurant_reservation",
          "celebration_planning",
          "visa_check",
          "welcome_gift",
          "vip_amenity",
          "jet_charter",
          "transfer_arrangement",
          "custom",
        ]),
        name: z.string().min(1),
        description: z.string().optional(),
        defaultPriority: z
          .enum(["low", "medium", "high", "urgent"])
          .default("medium"),
        defaultDueDaysFromTrigger: z.number().int().positive().default(1),
        checklistItems: z
          .array(z.object({ item: z.string(), required: z.boolean() }))
          .optional(),
        triggerOnBookingStatus: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [created] = await db
        .insert(taskTemplates)
        .values(input)
        .returning();
      return created;
    }),

  /** Create a task from a template for a specific member/booking */
  instantiateFromTemplate: protectedProcedure
    .input(
      z.object({
        templateId: z.number().int().positive(),
        assignedToUserId: z.number().int().positive(),
        memberId: z.number().int().positive().optional(),
        travelRequestId: z.number().int().positive().optional(),
        bookingId: z.number().int().positive().optional(),
        dueDate: z.string().optional(),
        additionalNotes: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [template] = await db
        .select()
        .from(taskTemplates)
        .where(eq(taskTemplates.id, input.templateId));
      if (!template)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Template not found",
        });

      const dueDate = input.dueDate
        ? new Date(input.dueDate)
        : (() => {
            const d = new Date();
            d.setDate(d.getDate() + (template.defaultDueDaysFromTrigger ?? 1));
            return d;
          })();

      const [task] = await db
        .insert(advisorTasks)
        .values({
          assignedToUserId: input.assignedToUserId,
          createdByUserId: ctx.user.id,
          memberId: input.memberId,
          travelRequestId: input.travelRequestId,
          bookingId: input.bookingId,
          title: template.name,
          description: [template.description, input.additionalNotes]
            .filter(Boolean)
            .join("\n\n"),
          status: "open",
          priority: template.defaultPriority,
          dueDate,
        })
        .returning();
      return task;
    }),
});

// ─── 9. Trip Timeline ─────────────────────────────────────────────────────────

export const tripTimelineRouter = router({
  getForMember: protectedProcedure
    .input(z.object({ memberId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db
        .select()
        .from(tripTimeline)
        .where(eq(tripTimeline.memberId, input.memberId))
        .orderBy(desc(tripTimeline.departureDate));
    }),

  add: protectedProcedure
    .input(
      z.object({
        memberId: z.number().int().positive(),
        travelRequestId: z.number().int().positive().optional(),
        bookingId: z.number().int().positive().optional(),
        title: z.string().min(1),
        destination: z.string().optional(),
        departureDate: z.string().optional(),
        returnDate: z.string().optional(),
        totalSpend: z.string().optional(),
        currency: z.string().default("GBP"),
        satisfactionScore: z.number().int().min(1).max(5).optional(),
        highlights: z.array(z.string()).optional(),
        memberFeedback: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [created] = await db
        .insert(tripTimeline)
        .values({
          ...input,
          departureDate: input.departureDate
            ? new Date(input.departureDate)
            : undefined,
          returnDate: input.returnDate ? new Date(input.returnDate) : undefined,
        })
        .returning();
      return created;
    }),

  /** Member: view their own trip history */
  myTrips: memberProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    return db
      .select()
      .from(tripTimeline)
      .where(eq(tripTimeline.memberId, ctx.member.id))
      .orderBy(desc(tripTimeline.departureDate));
  }),
});

// ─── 10. VIP Amenities & Welcome Gifts ───────────────────────────────────────

export const vipAmenitiesRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        memberId: z.number().int().positive().optional(),
        bookingId: z.number().int().positive().optional(),
      }),
    )
    .query(async ({ input }) => {
      const db = await getDb();
      const conditions = [];
      if (input.memberId)
        conditions.push(eq(vipAmenities.memberId, input.memberId));
      if (input.bookingId)
        conditions.push(eq(vipAmenities.bookingId, input.bookingId));
      return db
        .select()
        .from(vipAmenities)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(vipAmenities.createdAt));
    }),

  request: protectedProcedure
    .input(
      z.object({
        memberId: z.number().int().positive(),
        bookingId: z.number().int().positive().optional(),
        travelRequestId: z.number().int().positive().optional(),
        amenityType: z.string().min(1),
        description: z.string().optional(),
        supplierId: z.number().int().positive().optional(),
        cost: z.string().optional(),
        currency: z.string().default("GBP"),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [created] = await db
        .insert(vipAmenities)
        .values({ ...input, requestedByUserId: ctx.user.id })
        .returning();
      await emitCrmDomainEvent({
        aggregateType: "vip_amenity",
        aggregateId: created.id,
        eventType: "requested",
        payload: { amenityId: created.id, memberId: created.memberId },
        idempotencyKey: `vip-amenity:${created.id}:requested`,
      });
      return created;
    }),

  confirm: protectedProcedure
    .input(z.object({ amenityId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db
        .update(vipAmenities)
        .set({ confirmedAt: new Date() })
        .where(eq(vipAmenities.id, input.amenityId));
      await emitCrmDomainEvent({
        aggregateType: "vip_amenity",
        aggregateId: input.amenityId,
        eventType: "confirmed",
        payload: { amenityId: input.amenityId },
        idempotencyKey: `vip-amenity:${input.amenityId}:confirmed`,
      });
      return { success: true };
    }),

  markDelivered: protectedProcedure
    .input(z.object({ amenityId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db
        .update(vipAmenities)
        .set({ deliveredAt: new Date() })
        .where(eq(vipAmenities.id, input.amenityId));
      await emitCrmDomainEvent({
        aggregateType: "vip_amenity",
        aggregateId: input.amenityId,
        eventType: "delivered",
        payload: { amenityId: input.amenityId },
        idempotencyKey: `vip-amenity:${input.amenityId}:delivered`,
      });
      return { success: true };
    }),
});

// ─── 11. Revenue Analytics Dashboard ─────────────────────────────────────────

export const revenueAnalyticsRouter = router({
  /** Advisor: derive current operating metrics directly from persisted finance and booking records. */
  operationalSnapshot: protectedProcedure
    .input(z.object({ days: z.number().int().min(1).max(365).default(30) }))
    .query(async ({ input }) => {
      const db = await getDb();
      const now = new Date();
      const todayStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      );
      const periodStart = new Date(todayStart);
      periodStart.setDate(periodStart.getDate() - (input.days - 1));

      const [todayRevenue] = await db
        .select({
          value: sql<string>`coalesce(sum(case when ${invoices.invoiceType} = 'client_service' then ${invoices.totalAmount} else 0 end), 0)`,
        })
        .from(invoices)
        .where(
          and(eq(invoices.status, "paid"), gte(invoices.paidAt, todayStart)),
        );
      const [bookingMetrics] = await db
        .select({
          averageBookingValue: sql<string>`coalesce(avg(${bookings.totalAmount}), 0)`,
          bookingCount: sql<number>`count(*)::int`,
        })
        .from(bookings)
        .where(
          and(
            gte(bookings.createdAt, periodStart),
            sql`${bookings.status} in ('confirmed', 'paid')`,
          ),
        );
      const [membershipFees] = await db
        .select({
          value: sql<string>`coalesce(sum(${invoiceLineItems.totalPrice}), 0)`,
        })
        .from(invoiceLineItems)
        .innerJoin(invoices, eq(invoiceLineItems.invoiceId, invoices.id))
        .where(
          and(
            eq(invoices.status, "paid"),
            eq(invoiceLineItems.itemType, "membership_fee"),
          ),
        );
      const categoryRows = await db
        .select({
          itemType: invoiceLineItems.itemType,
          value: sql<string>`coalesce(sum(${invoiceLineItems.totalPrice}), 0)`,
        })
        .from(invoiceLineItems)
        .innerJoin(invoices, eq(invoiceLineItems.invoiceId, invoices.id))
        .where(
          and(eq(invoices.status, "paid"), gte(invoices.paidAt, periodStart)),
        )
        .groupBy(invoiceLineItems.itemType);
      const revenueByCategory = {
        hotels: 0,
        ancillary: 0,
        luxuryTransport: 0,
        villas: 0,
        apartments: 0,
      };
      for (const row of categoryRows) {
        const value = Number(row.value ?? 0);
        if (row.itemType === "hotel") revenueByCategory.hotels += value;
        else if (row.itemType === "villa") revenueByCategory.villas += value;
        else if (row.itemType === "apartment")
          revenueByCategory.apartments += value;
        else if (row.itemType === "jet" || row.itemType === "yacht")
          revenueByCategory.luxuryTransport += value;
        else if (
          row.itemType === "transfer" ||
          row.itemType === "restaurant" ||
          row.itemType === "event" ||
          row.itemType === "experience" ||
          row.itemType === "ancillary"
        )
          revenueByCategory.ancillary += value;
      }
      const [activeRequests] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(travelRequests)
        .where(sql`${travelRequests.status} not in ('completed', 'cancelled')`);
      const [openTasks] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(advisorTasks)
        .where(sql`${advisorTasks.status} in ('open', 'in_progress')`);
      const upcomingTrips = await db
        .select({
          bookingId: bookings.id,
          referenceNumber: bookings.referenceNumber,
          checkIn: bookings.checkIn,
          checkOut: bookings.checkOut,
          totalAmount: bookings.totalAmount,
          memberId: members.id,
          memberName: members.name,
        })
        .from(bookings)
        .innerJoin(members, eq(bookings.memberId, members.id))
        .where(
          and(
            gte(bookings.checkIn, todayStart),
            sql`${bookings.status} in ('confirmed', 'paid')`,
          ),
        )
        .orderBy(asc(bookings.checkIn))
        .limit(6);

      return {
        asOf: now.toISOString(),
        days: input.days,
        totalDailyRevenue: todayRevenue?.value ?? "0",
        averageBookingValue: bookingMetrics?.averageBookingValue ?? "0",
        membershipFeesCollected: membershipFees?.value ?? "0",
        revenueByCategory,
        bookingsCount: bookingMetrics?.bookingCount ?? 0,
        activeRequestsCount: activeRequests?.count ?? 0,
        openTasksCount: openTasks?.count ?? 0,
        upcomingTrips,
      };
    }),

  /** Admin: get today's revenue snapshot */
  todaySnapshot: adminProcedure.query(async () => {
    const db = await getDb();
    const today = new Date().toISOString().split("T")[0];

    const [snapshot] = await db
      .select()
      .from(revenueSnapshots)
      .where(eq(revenueSnapshots.snapshotDate, today));
    return (
      snapshot ?? {
        snapshotDate: today,
        totalDailyRevenue: "0",
        averageBookingValue: "0",
        membershipFeesCollected: "0",
        revenueByCategory: {
          hotels: 0,
          ancillary: 0,
          transport: 0,
          villas: 0,
          apartments: 0,
        },
        bookingsCount: 0,
        newMembersCount: 0,
        activeRequestsCount: 0,
      }
    );
  }),

  /** Admin: get revenue breakdown by category */
  revenueByCategory: adminProcedure
    .input(z.object({ days: z.number().int().positive().default(30) }))
    .query(async ({ input }) => {
      const db = await getDb();

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - input.days);
      const snapshots = await db
        .select({ revenueByCategory: revenueSnapshots.revenueByCategory })
        .from(revenueSnapshots)
        .where(
          gte(
            revenueSnapshots.snapshotDate,
            cutoff.toISOString().split("T")[0],
          ),
        );
      const totals = {
        hotels: 0,
        ancillary: 0,
        transport: 0,
        villas: 0,
        apartments: 0,
        total: 0,
      };
      for (const s of snapshots) {
        const cat = s.revenueByCategory as Record<string, number> | null;
        if (cat) {
          totals.hotels += cat.hotels ?? 0;
          totals.ancillary += cat.ancillary ?? 0;
          totals.transport += cat.transport ?? 0;
          totals.villas += cat.villas ?? 0;
          totals.apartments += cat.apartments ?? 0;
        }
      }
      totals.total =
        Object.values(totals).reduce((a, b) => a + b, 0) - totals.total;
      return totals;
    }),

  /** Admin: upsert today's revenue snapshot (called by daily cron) */
  upsertSnapshot: adminProcedure
    .input(
      z.object({
        snapshotDate: z.string(),
        totalDailyRevenue: z.string(),
        averageBookingValue: z.string(),
        membershipFeesCollected: z.string(),
        revenueByCategory: z.object({
          hotels: z.number(),
          ancillary: z.number(),
          transport: z.number(),
          villas: z.number(),
          apartments: z.number(),
        }),
        bookingsCount: z.number().int(),
        newMembersCount: z.number().int(),
        activeRequestsCount: z.number().int(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const existing = await db
        .select({ id: revenueSnapshots.id })
        .from(revenueSnapshots)
        .where(eq(revenueSnapshots.snapshotDate, input.snapshotDate));
      if (existing.length > 0) {
        await db
          .update(revenueSnapshots)
          .set(input)
          .where(eq(revenueSnapshots.snapshotDate, input.snapshotDate));
      } else {
        await db.insert(revenueSnapshots).values(input);
      }
      return { success: true };
    }),

  /** Admin: get membership fees collected to date */
  membershipFeesSummary: adminProcedure.query(async () => {
    const db = await getDb();
    const profiles = await db
      .select({
        tier: members.tier,
        fees: memberProfiles.membershipFeesPaid,
      })
      .from(memberProfiles)
      .innerJoin(members, eq(memberProfiles.memberId, members.id));
    const result = { total: 0, platinum: 0, gold: 0, silver: 0 };
    for (const p of profiles) {
      const amount = parseFloat(p.fees ?? "0");
      result.total += amount;
      if (p.tier === "platinum") result.platinum += amount;
      else if (p.tier === "gold") result.gold += amount;
      else if (p.tier === "silver") result.silver += amount;
    }
    return {
      total: String(result.total.toFixed(2)),
      platinum: String(result.platinum.toFixed(2)),
      gold: String(result.gold.toFixed(2)),
      silver: String(result.silver.toFixed(2)),
    };
  }),
});

// ─── 12. AI Concierge Assistant ───────────────────────────────────────────────

export const aiConciergeRouter = router({
  /** Member-safe destination recommendations, always grounded in the caller's own persisted profile. */
  recommendDestinations: memberProcedure
    .input(
      z.object({
        travelStyle: z.array(z.string()).optional(),
        budget: z.string().optional(),
        travelMonth: z.string().optional(),
        partySize: z.number().int().positive().default(2),
      }),
    )
    .query(async ({ input, ctx }) => {
      const memberId = ctx.member.id;
      const facts = await buildConciergeMemberFacts(memberId);
      const result = await invokeLocalAi({
        capability: "intelligence",
        responseFormat: "json",
        system:
          "You are a luxury concierge. Recommend up to three destination concepts only from supplied member facts and request constraints. Do not invent confirmed supplier availability or prices. Return JSON {recommendations:[{destination,reason,bestTime,estimatedBudget,highlights:[string],suggestedSuppliers:[string]}],missing_data:[string]}. suggestedSuppliers may only name supplied favourite suppliers; otherwise return an empty list.",
        prompt: JSON.stringify({ member_facts: facts, request: input }),
        temperature: 0.2,
        maxTokens: 1_200,
        metadata: { feature: "destination_recommendations", memberId },
      });
      const rawRecommendations = Array.isArray(
        result.structured?.recommendations,
      )
        ? result.structured.recommendations
        : [];
      const recommendations = rawRecommendations.map((raw) => {
        const item = raw as Record<string, unknown>;
        return {
          destination:
            typeof item.destination === "string" ? item.destination : "",
          reason: typeof item.reason === "string" ? item.reason : "",
          bestTime:
            typeof item.bestTime === "string" ? item.bestTime : undefined,
          estimatedBudget:
            typeof item.estimatedBudget === "string"
              ? item.estimatedBudget
              : undefined,
          highlights: Array.isArray(item.highlights)
            ? item.highlights.filter(
                (value): value is string => typeof value === "string",
              )
            : [],
          suggestedSuppliers: Array.isArray(item.suggestedSuppliers)
            ? item.suggestedSuppliers.filter(
                (value): value is string => typeof value === "string",
              )
            : [],
        };
      });
      return {
        memberId,
        tier: ctx.member.tier,
        recommendations,
        missingData: result.structured?.missing_data ?? [],
      };
    }),

  /** Advisor-scoped recommendations for a selected persisted member. */
  recommendDestinationsForMember: protectedProcedure
    .input(
      z.object({
        memberId: z.number().int().positive(),
        travelStyle: z.array(z.string()).optional(),
        budget: z.string().optional(),
        travelMonth: z.string().optional(),
        partySize: z.number().int().positive().default(2),
      }),
    )
    .query(async ({ input }) => {
      const facts = await buildConciergeMemberFacts(input.memberId);
      const result = await invokeLocalAi({
        capability: "intelligence",
        responseFormat: "json",
        system:
          "You are a luxury concierge. Recommend up to three destination concepts only from supplied member facts and request constraints. Do not invent confirmed supplier availability or prices. Return JSON {recommendations:[{destination,reason,bestTime,estimatedBudget,highlights:[string],suggestedSuppliers:[string]}],missing_data:[string]}. suggestedSuppliers may only name supplied favourite suppliers; otherwise return an empty list.",
        prompt: JSON.stringify({ member_facts: facts, request: input }),
        temperature: 0.2,
        maxTokens: 1_200,
        metadata: {
          feature: "destination_recommendations",
          memberId: input.memberId,
        },
      });
      const rawRecommendations = Array.isArray(
        result.structured?.recommendations,
      )
        ? result.structured.recommendations
        : [];
      const recommendations = rawRecommendations.map((raw) => {
        const item = raw as Record<string, unknown>;
        return {
          destination:
            typeof item.destination === "string" ? item.destination : "",
          reason: typeof item.reason === "string" ? item.reason : "",
          bestTime:
            typeof item.bestTime === "string" ? item.bestTime : undefined,
          estimatedBudget:
            typeof item.estimatedBudget === "string"
              ? item.estimatedBudget
              : undefined,
          highlights: Array.isArray(item.highlights)
            ? item.highlights.filter(
                (value): value is string => typeof value === "string",
              )
            : [],
          suggestedSuppliers: Array.isArray(item.suggestedSuppliers)
            ? item.suggestedSuppliers.filter(
                (value): value is string => typeof value === "string",
              )
            : [],
        };
      });
      return {
        memberId: input.memberId,
        recommendations,
        missingData: result.structured?.missing_data ?? [],
      };
    }),

  /** Generate commercially reviewable upgrade opportunities from a real persisted proposal and member history. */
  suggestUpgrades: protectedProcedure
    .input(
      z.object({
        proposalId: z.number().int().positive().optional(),
        memberId: z.number().int().positive(),
      }),
    )
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db
        .select()
        .from(proposals)
        .where(
          input.proposalId
            ? and(
                eq(proposals.id, input.proposalId),
                eq(proposals.memberId, input.memberId),
              )
            : eq(proposals.memberId, input.memberId),
        )
        .orderBy(desc(proposals.updatedAt))
        .limit(1);
      const proposal = rows[0];
      if (!proposal) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            "A persisted proposal is required before upgrades can be assessed",
        });
      }
      const facts = await buildConciergeMemberFacts(input.memberId);
      const result = await invokeLocalAi({
        capability: "intelligence",
        responseFormat: "json",
        system:
          "You are a luxury travel concierge. Identify optional upgrades grounded only in supplied proposal and member facts. Do not fabricate availability, incentives, or exact prices. Return JSON {upgrades:[{category,type,suggested,description,additionalCost,estimatedCost,priority}],missing_data:[string]}. category/type describe the upgrade, suggested/description are client-safe wording, and additionalCost/estimatedCost are a non-binding estimate.",
        prompt: JSON.stringify({ member_facts: facts, proposal }),
        temperature: 0.15,
        maxTokens: 900,
        metadata: {
          feature: "proposal_upgrades",
          memberId: input.memberId,
          proposalId: proposal.id,
        },
      });
      const rawUpgrades = Array.isArray(result.structured?.upgrades)
        ? result.structured.upgrades
        : [];
      const upgrades = rawUpgrades.map((raw) => {
        const item = raw as Record<string, unknown>;
        const category =
          typeof item.category === "string"
            ? item.category
            : typeof item.type === "string"
              ? item.type
              : "experience";
        const suggested =
          typeof item.suggested === "string"
            ? item.suggested
            : typeof item.description === "string"
              ? item.description
              : "Review this optional upgrade with the member.";
        const additionalCost =
          typeof item.additionalCost === "string"
            ? item.additionalCost
            : typeof item.estimatedCost === "string"
              ? item.estimatedCost
              : undefined;
        return {
          category,
          suggested,
          additionalCost,
          type: typeof item.type === "string" ? item.type : category,
          description:
            typeof item.description === "string" ? item.description : suggested,
          estimatedCost:
            typeof item.estimatedCost === "string"
              ? item.estimatedCost
              : additionalCost,
          priority:
            typeof item.priority === "string" ? item.priority : "medium",
        };
      });
      return {
        proposalId: proposal.id,
        upgrades,
        missingData: result.structured?.missing_data ?? [],
      };
    }),

  /** Generate a personalised, reviewable follow-up from persisted member behaviour rather than a canned template. */
  generateFollowUpMessage: protectedProcedure
    .input(
      z.object({
        memberId: z.number().int().positive(),
        context: z.enum([
          "post_trip",
          "birthday",
          "anniversary",
          "re_engagement",
          "upsell",
        ]),
        tripId: z.number().int().positive().optional(),
      }),
    )
    .query(async ({ input }) => {
      const facts = await buildConciergeMemberFacts(input.memberId);
      const result = await invokeLocalAi({
        capability: "whatsapp",
        responseFormat: "json",
        system:
          "Draft a warm concierge follow-up grounded only in supplied facts. Do not promise availability or invent travel details. Return JSON {campaigns:[{type,subject,body,sendAt,channels:[string]}],missing_data:[string]}. Include one concise reviewed campaign for the requested context.",
        prompt: JSON.stringify({
          member_facts: facts,
          context: input.context,
          trip_id: input.tripId,
        }),
        temperature: 0.3,
        maxTokens: 700,
        metadata: {
          feature: "follow_up_campaign",
          memberId: input.memberId,
          context: input.context,
        },
      });
      const campaigns = Array.isArray(result.structured?.campaigns)
        ? result.structured.campaigns
        : [];
      const first = (campaigns[0] ?? {}) as Record<string, unknown>;
      return {
        memberId: input.memberId,
        context: input.context,
        suggestedMessage: typeof first.body === "string" ? first.body : "",
        channels: Array.isArray(first.channels) ? first.channels : [],
        campaigns,
        missingData: result.structured?.missing_data ?? [],
      };
    }),
});

// ─── Patch Routers: add missing procedures needed by frontend pages ────────────

export const celebrationsPatchRouter = router({
  delete: protectedProcedure
    .input(z.object({ celebrationId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db
        .delete(celebrations)
        .where(eq(celebrations.id, input.celebrationId));
      return { success: true };
    }),
});

export const vipAmenitiesPatchRouter = router({
  updateStatus: protectedProcedure
    .input(
      z.object({
        amenityId: z.number().int().positive(),
        status: z.enum(["pending", "confirmed", "delivered", "cancelled"]),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const updateData: Record<string, unknown> = {};
      if (input.status === "confirmed") updateData.confirmedAt = new Date();
      if (input.status === "delivered") updateData.deliveredAt = new Date();
      if (Object.keys(updateData).length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await db
          .update(vipAmenities)
          .set(updateData as any)
          .where(eq(vipAmenities.id, input.amenityId));
      }
      return { success: true };
    }),
});

export const tripTimelinePatchRouter = router({
  memberStats: protectedProcedure
    .input(z.object({ memberId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const trips = await db
        .select()
        .from(tripTimeline)
        .where(eq(tripTimeline.memberId, input.memberId));
      const totalSpend = trips.reduce(
        (sum, t) => sum + parseFloat(t.totalSpend ?? "0"),
        0,
      );
      const withScores = trips.filter((t) => t.satisfactionScore != null);
      const avgSatisfaction =
        withScores.length > 0
          ? (
              withScores.reduce(
                (sum, t) => sum + (t.satisfactionScore ?? 0),
                0,
              ) / withScores.length
            ).toFixed(1)
          : "0";
      const destCounts: Record<string, number> = {};
      for (const t of trips) {
        if (t.destination)
          destCounts[t.destination] = (destCounts[t.destination] ?? 0) + 1;
      }
      const topDestination =
        Object.entries(destCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      return {
        totalTrips: trips.length,
        totalSpend: totalSpend.toFixed(2),
        avgSatisfaction,
        topDestination,
      };
    }),
});

export const experienceManagementRouter = router({
  /** Generate idempotent operational actions for celebrations, VIP amenities, and post-trip feedback windows. */
  generateDueActions: protectedProcedure
    .input(z.object({ daysAhead: z.number().int().min(1).max(90).default(30) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const now = new Date();
      const windowEnd = new Date(
        now.getTime() + input.daysAhead * 24 * 60 * 60 * 1000,
      );
      const [allMembers, allCelebrations, amenities, trips, feedback] =
        await Promise.all([
          db
            .select({
              id: members.id,
              assignedAdvisorId: members.assignedAdvisorId,
              name: members.name,
            })
            .from(members),
          db.select().from(celebrations),
          db.select().from(vipAmenities),
          db
            .select()
            .from(tripTimeline)
            .where(isNotNull(tripTimeline.returnDate)),
          db.select({ bookingId: npsResponses.bookingId }).from(npsResponses),
        ]);
      const memberById = new Map(
        allMembers.map((member) => [member.id, member]),
      );
      const feedbackBookingIds = new Set(
        feedback
          .map((item) => item.bookingId)
          .filter((id): id is number => typeof id === "number"),
      );
      const tasks: Array<typeof advisorTasks.$inferInsert> = [];
      const skippedMembers = new Set<number>();
      const addTask = (
        memberId: number,
        automationKey: string,
        title: string,
        description: string,
        dueDate: Date,
        priority: "low" | "medium" | "high" | "urgent" = "medium",
        bookingId?: number,
      ) => {
        const member = memberById.get(memberId);
        if (!member?.assignedAdvisorId) {
          skippedMembers.add(memberId);
          return;
        }
        tasks.push({
          assignedToUserId: member.assignedAdvisorId,
          createdByUserId: ctx.user.id,
          memberId,
          bookingId,
          automationKey,
          title,
          description,
          dueDate,
          priority,
          status: "open",
        });
      };
      for (const celebration of allCelebrations) {
        const base = new Date(celebration.celebrationDate);
        const occurrence = celebration.isRecurring
          ? new Date(now.getFullYear(), base.getMonth(), base.getDate())
          : base;
        if (celebration.isRecurring && occurrence < now)
          occurrence.setFullYear(occurrence.getFullYear() + 1);
        const reminderDate = new Date(
          occurrence.getTime() -
            (celebration.reminderDaysBefore ?? 30) * 24 * 60 * 60 * 1000,
        );
        if (reminderDate >= now && reminderDate <= windowEnd) {
          addTask(
            celebration.memberId,
            `celebration:${celebration.id}:${occurrence.getFullYear()}`,
            `Plan ${celebration.title}`,
            `Celebration on ${occurrence.toLocaleDateString("en-GB")}. Review gift suggestions, VIP amenity, and concierge outreach. ${celebration.notes ?? ""}`.trim(),
            reminderDate,
            "high",
          );
        }
      }
      for (const amenity of amenities) {
        if (!amenity.confirmedAt) {
          addTask(
            amenity.memberId,
            `vip-amenity:${amenity.id}:confirm`,
            `Confirm VIP amenity: ${amenity.amenityType}`,
            amenity.description ??
              "Confirm supplier availability and delivery plan.",
            now,
            "high",
            amenity.bookingId ?? undefined,
          );
        } else if (!amenity.deliveredAt) {
          addTask(
            amenity.memberId,
            `vip-amenity:${amenity.id}:delivery`,
            `Verify VIP amenity delivery: ${amenity.amenityType}`,
            amenity.description ??
              "Confirm the amenity was delivered and record the outcome.",
            now,
            "medium",
            amenity.bookingId ?? undefined,
          );
        }
      }
      const feedbackWindowStart = new Date(
        now.getTime() - 7 * 24 * 60 * 60 * 1000,
      );
      for (const trip of trips) {
        if (
          !trip.returnDate ||
          trip.returnDate < feedbackWindowStart ||
          trip.returnDate > now ||
          !trip.bookingId ||
          feedbackBookingIds.has(trip.bookingId)
        )
          continue;
        addTask(
          trip.memberId,
          `post-trip-feedback:${trip.id}`,
          `Request post-trip feedback: ${trip.destination ?? trip.title}`,
          "Send a personal post-trip check-in and invite the member to complete NPS feedback. Review satisfaction notes before outreach.",
          now,
          "medium",
          trip.bookingId,
        );
      }
      if (tasks.length)
        await db
          .insert(advisorTasks)
          .values(tasks)
          .onConflictDoNothing({ target: advisorTasks.automationKey });
      return {
        generatedCandidates: tasks.length,
        skippedWithoutAssignedAdvisor: [...skippedMembers],
      };
    }),
});

export const npsPatchRouter = router({
  detractors: protectedProcedure.query(async () => {
    const db = await getDb();
    return db
      .select()
      .from(npsResponses)
      .where(
        and(
          eq(npsResponses.category, "detractor"),
          eq(npsResponses.followUpRequired, true),
        ),
      )
      .orderBy(desc(npsResponses.createdAt));
  }),
});

export const aiConciergePatchRouter = router({
  chat: memberProcedure
    .input(
      z.object({
        message: z.string().min(1).max(10_000),
        history: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string().max(10_000),
            }),
          )
          .max(20)
          .optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const facts = await buildConciergeMemberFacts(ctx.member.id);
      await db.insert(communicationTimeline).values({
        memberId: ctx.member.id,
        communicationType: "portal_message",
        channel: "portal",
        direction: "inbound",
        body: input.message,
        summary: input.message.slice(0, 500),
      });
      const result = await invokeLocalAi({
        capability: "whatsapp",
        responseFormat: "json",
        system:
          "You are Lanai's AI Concierge. Respond only from supplied member facts and chat context. Do not state availability, prices, or bookings as confirmed. If information is unavailable, say a concierge will verify it. Return JSON {reply:string,suggested_actions:[string],sentiment:positive|neutral|negative|urgent}.",
        prompt: JSON.stringify({
          member_facts: facts,
          history: input.history ?? [],
          message: input.message,
        }),
        temperature: 0.3,
        maxTokens: 700,
        metadata: { feature: "member_concierge_chat", memberId: ctx.member.id },
      });
      const reply =
        typeof result.structured?.reply === "string"
          ? result.structured.reply
          : "";
      if (!reply)
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: "AI concierge returned no reply",
        });
      const sentiment = result.structured?.sentiment;
      await db.insert(communicationTimeline).values({
        memberId: ctx.member.id,
        communicationType: "portal_message",
        channel: "portal",
        direction: "outbound",
        body: reply,
        summary: reply.slice(0, 500),
        sentiment:
          sentiment === "positive" ||
          sentiment === "neutral" ||
          sentiment === "negative" ||
          sentiment === "urgent"
            ? sentiment
            : "neutral",
      });
      return {
        memberId: ctx.member.id,
        reply,
        suggestedActions: Array.isArray(result.structured?.suggested_actions)
          ? result.structured.suggested_actions
          : [],
      };
    }),
  generateFollowUpCampaigns: protectedProcedure
    .input(z.object({ memberId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const facts = await buildConciergeMemberFacts(input.memberId);
      const result = await invokeLocalAi({
        capability: "whatsapp",
        responseFormat: "json",
        system:
          "Create up to three reviewable concierge campaigns based only on supplied member facts. Do not invent trips, availability, or prices. Return JSON {campaigns:[{type,subject,body,sendAt,channels:[string]}],missing_data:[string]}.",
        prompt: JSON.stringify({ member_facts: facts }),
        temperature: 0.25,
        maxTokens: 900,
        metadata: { feature: "follow_up_campaigns", memberId: input.memberId },
      });
      return {
        memberId: input.memberId,
        campaigns: Array.isArray(result.structured?.campaigns)
          ? result.structured.campaigns
          : [],
        missingData: result.structured?.missing_data ?? [],
      };
    }),
});
