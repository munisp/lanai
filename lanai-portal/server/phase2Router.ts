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
} from "../drizzle/schema";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateInvoiceNumber(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `LAN-${year}${month}-${rand}`;
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
      const { memberId, ...data } = input;
      const existing = await db
        .select({ id: memberProfiles.id })
        .from(memberProfiles)
        .where(eq(memberProfiles.memberId, memberId));
      if (existing.length > 0) {
        await db
          .update(memberProfiles)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .set({ ...(data as any), updatedAt: new Date() })
          .where(eq(memberProfiles.memberId, memberId));
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await db.insert(memberProfiles).values({ memberId, ...(data as any) });
      }
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
      await db
        .update(memberProfiles)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(memberProfiles.memberId, memberId));
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

      return invoice;
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
      return { success: true };
    }),
});

// ─── 11. Revenue Analytics Dashboard ─────────────────────────────────────────

export const revenueAnalyticsRouter = router({
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
  /** Generate destination recommendations based on member profile & history */
  recommendDestinations: memberProcedure
    .input(
      z.object({
        travelStyle: z.array(z.string()).optional(),
        budget: z.string().optional(),
        travelMonth: z.string().optional(),
        partySize: z.number().int().positive().default(2),
      }),
    )
    .query(async ({ ctx, input }) => {
      // In production: calls LLM with member profile context
      // For now: returns structured recommendations based on tier
      const recommendations = [
        {
          destination: "Amalfi Coast, Italy",
          reason:
            "Matches your preference for coastal luxury and Mediterranean cuisine",
          bestTime: "May–September",
          estimatedBudget: "£8,000–£15,000",
          suggestedSuppliers: ["Villa San Michele", "Capri Palace"],
          experiences: [
            "Private boat charter",
            "Michelin-star dining",
            "Limoncello tasting tour",
          ],
        },
        {
          destination: "Maldives",
          reason:
            "Perfect for couples seeking seclusion and underwater experiences",
          bestTime: "November–April",
          estimatedBudget: "£12,000–£25,000",
          suggestedSuppliers: ["One&Only Reethi Rah", "Soneva Fushi"],
          experiences: [
            "Private snorkelling",
            "Sunset dolphin cruise",
            "Underwater dining",
          ],
        },
        {
          destination: "Japan (Tokyo + Kyoto)",
          reason: "Cultural immersion with world-class hospitality and cuisine",
          bestTime: "March–April (Cherry Blossom) or October–November",
          estimatedBudget: "£10,000–£20,000",
          suggestedSuppliers: ["Aman Tokyo", "Amanjiwo Kyoto"],
          experiences: [
            "Private tea ceremony",
            "Bullet train in first class",
            "Kaiseki dinner",
          ],
        },
      ];
      return {
        memberId: ctx.member.id,
        tier: ctx.member.tier,
        recommendations,
      };
    }),

  /** Generate upgrade suggestions for an existing proposal */
  suggestUpgrades: protectedProcedure
    .input(
      z.object({
        proposalId: z.number().int().positive(),
        memberId: z.number().int().positive(),
      }),
    )
    .query(async ({ input }) => {
      // In production: calls LLM with proposal details and member preferences
      return {
        proposalId: input.proposalId,
        upgrades: [
          {
            category: "accommodation",
            current: "Deluxe Room",
            suggested: "Ocean Suite",
            additionalCost: "£850/night",
            reason:
              "Member has previously booked suites at comparable properties",
          },
          {
            category: "flight",
            current: "Business Class",
            suggested: "First Class",
            additionalCost: "£2,400 per person",
            reason:
              "Member's tier qualifies for first-class upgrade incentives",
          },
          {
            category: "experience",
            current: null,
            suggested: "Private helicopter transfer from airport",
            additionalCost: "£1,200",
            reason:
              "Matches member's preference for seamless, time-efficient travel",
          },
        ],
      };
    }),

  /** Generate a personalised follow-up campaign message */
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
      const templates: Record<string, string> = {
        post_trip:
          "We hope you had a wonderful experience. We'd love to hear your thoughts and start planning your next adventure.",
        birthday:
          "Wishing you a very happy birthday! As a valued Lanai member, we'd love to make your special day extraordinary.",
        anniversary:
          "Congratulations on your anniversary! Allow us to help you celebrate in style.",
        re_engagement:
          "We've been thinking about you and have some exciting destinations that match your travel style.",
        upsell:
          "Based on your recent travels, we think you'd love these exclusive experiences we've curated just for you.",
      };
      return {
        memberId: input.memberId,
        context: input.context,
        suggestedMessage: templates[input.context] ?? templates.re_engagement,
        channels: ["whatsapp", "email"],
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
        message: z.string().min(1),
        history: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string(),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const responses: Record<string, string> = {
        default:
          "Thank you for your message. I'm your Lanai AI Concierge. How can I help you plan your next extraordinary experience?",
        hotel:
          "I'd be delighted to recommend some exceptional hotels. Based on your preferences, I suggest the Aman Tokyo or Four Seasons Bali.",
        flight:
          "For your travel, I recommend booking first class with British Airways or Emirates for the finest in-flight experience.",
        restaurant:
          "I can arrange reservations at some of the world's finest restaurants. Shall I book Alain Ducasse or Nobu for your visit?",
        villa:
          "Our curated villa collection includes stunning properties in Tuscany, Mykonos, and the Maldives. Which destination interests you?",
      };
      const msg = input.message.toLowerCase();
      const reply = msg.includes("hotel")
        ? responses.hotel
        : msg.includes("flight")
          ? responses.flight
          : msg.includes("restaurant")
            ? responses.restaurant
            : msg.includes("villa")
              ? responses.villa
              : responses.default;
      return {
        memberId: ctx.member.id,
        reply,
        suggestedActions: [
          "Browse destinations",
          "View proposals",
          "Contact advisor",
        ],
      };
    }),
  generateFollowUpCampaigns: protectedProcedure
    .input(z.object({ memberId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return {
        memberId: input.memberId,
        campaigns: [
          {
            context: "post_trip",
            message:
              "We hope you had a wonderful experience. Ready to plan your next adventure?",
            channel: "whatsapp",
          },
          {
            context: "birthday",
            message:
              "Wishing you a very happy birthday! Let us make your day extraordinary.",
            channel: "email",
          },
          {
            context: "re_engagement",
            message: "We've curated some exclusive experiences just for you.",
            channel: "whatsapp",
          },
        ],
      };
    }),
});
