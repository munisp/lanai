import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { router, protectedProcedure, memberProcedure } from "./_core/trpc";
import { getDb, registerStorageUrls } from "./db";
import {
  bookings,
  documents,
  members,
  proposals,
  proposalItems,
  suppliers,
  supplierRoomRates,
  supplierAmenities,
  travelRequests,
} from "../drizzle/schema";
import { Permify } from "./_core/infrastructure";
import { recordBookingCommission } from "./_core/ledger";
import { dispatchOutboxBatch, enqueueDomainEvent } from "./_core/outbox";
import { instantiateBookingStageTasks } from "./_core/bookingTaskAutomation";

async function recordEvent(
  input: Parameters<typeof enqueueDomainEvent>[0],
): Promise<void> {
  await enqueueDomainEvent(input);
  void dispatchOutboxBatch().catch((error) =>
    console.error("[outbox] asynchronous dispatch failed", error),
  );
}

// ─── Travel Requests ──────────────────────────────────────────────────────────

export const travelRequestsRouter = router({
  create: memberProcedure
    .input(
      z.object({
        destination: z.string().trim().min(1).max(255),
        dates: z.string().trim().min(1).max(255),
        pax: z.number().int().min(1).max(50),
        budget: z.string().trim().max(64).optional(),
        notes: z.string().trim().max(10_000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [row] = await db
        .insert(travelRequests)
        .values({
          memberId: ctx.member.id,
          destination: input.destination,
          dates: input.dates,
          pax: input.pax,
          budget: input.budget ?? null,
          notes: input.notes ?? null,
          status: "new",
        })
        .returning({ id: travelRequests.id });
      if (!row) throw new Error("Travel request could not be created");
      await Permify.writeTuple(
        `member:${ctx.member.id}`,
        "owner",
        `travel_request:${row.id}`,
      );
      await recordEvent({
        aggregateType: "travel_request",
        aggregateId: row.id,
        eventType: "created",
        payload: {
          travelRequestId: row.id,
          memberId: ctx.member.id,
          destination: input.destination,
        },
        idempotencyKey: `travel-request:${row.id}:created`,
      });
      return row;
    }),

  list: protectedProcedure.query(async () => {
    const db = await getDb();
    return db
      .select({
        id: travelRequests.id,
        memberId: travelRequests.memberId,
        destination: travelRequests.destination,
        originCity: travelRequests.originCity,
        dates: travelRequests.dates,
        departureDate: travelRequests.departureDate,
        returnDate: travelRequests.returnDate,
        pax: travelRequests.pax,
        adults: travelRequests.adults,
        children: travelRequests.children,
        infants: travelRequests.infants,
        budget: travelRequests.budget,
        budgetCurrency: travelRequests.budgetCurrency,
        accommodationType: travelRequests.accommodationType,
        flightClass: travelRequests.flightClass,
        specialRequests: travelRequests.specialRequests,
        notes: travelRequests.notes,
        status: travelRequests.status,
        assignedToUserId: travelRequests.assignedToUserId,
        priority: travelRequests.priority,
        crmOpportunityId: travelRequests.crmOpportunityId,
        createdAt: travelRequests.createdAt,
        updatedAt: travelRequests.updatedAt,
        memberName: members.name,
        memberEmail: members.email,
      })
      .from(travelRequests)
      .leftJoin(members, eq(travelRequests.memberId, members.id))
      .orderBy(desc(travelRequests.createdAt));
  }),

  myRequests: memberProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    return db
      .select()
      .from(travelRequests)
      .where(eq(travelRequests.memberId, ctx.member.id))
      .orderBy(desc(travelRequests.createdAt));
  }),

  updateStatus: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        status: z.enum([
          "new",
          "in_progress",
          "proposal_sent",
          "booked",
          "completed",
          "cancelled",
        ]),
        assignedToUserId: z.number().int().positive().nullable().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [row] = await db
        .update(travelRequests)
        .set({
          status: input.status,
          assignedToUserId: input.assignedToUserId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(travelRequests.id, input.id))
        .returning({
          id: travelRequests.id,
          memberId: travelRequests.memberId,
        });
      if (!row) throw new Error("Travel request was not found");
      await Permify.writeTuple(
        `user:${ctx.user.id}`,
        "assigned_advisor",
        `travel_request:${row.id}`,
      );
      await recordEvent({
        aggregateType: "travel_request",
        aggregateId: row.id,
        eventType: "status_updated",
        payload: {
          travelRequestId: row.id,
          memberId: row.memberId,
          status: input.status,
          advisorId: ctx.user.id,
        },
        idempotencyKey: `travel-request:${row.id}:status:${input.status}:${Date.now()}`,
      });
      return { success: true };
    }),
});

// ─── Proposals ────────────────────────────────────────────────────────────────

export const proposalsRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        travelRequestId: z.number().int().positive(),
        memberId: z.number().int().positive(),
        title: z.string().trim().min(1).max(255),
        description: z.string().trim().max(20_000).optional(),
        heroImageUrl: z.string().url().max(1024).optional(),
        mapEmbedUrl: z.string().url().max(2048).optional(),
        clientMessage: z.string().trim().max(10_000).optional(),
        itinerary: z
          .array(
            z.object({
              day: z.number().int().min(1),
              title: z.string().trim().min(1).max(255),
              location: z.string().trim().max(255).optional(),
              description: z.string().trim().max(10_000).optional(),
              imageUrl: z.string().url().max(1024).optional(),
              mapUrl: z.string().url().max(2048).optional(),
              activities: z.array(z.string().trim().min(1).max(255)).optional(),
            }),
          )
          .optional(),
        pricingTiers: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(128),
              description: z.string().trim().max(2_000).optional(),
              totalPrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
              currency: z.string().length(3).default("GBP"),
              inclusions: z.array(z.string().trim().min(1).max(255)).optional(),
              recommended: z.boolean().optional(),
            }),
          )
          .optional(),
        totalPrice: z
          .string()
          .regex(/^\d+(\.\d{1,2})?$/)
          .optional(),
        currency: z.string().length(3).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const request = await db
        .select({ memberId: travelRequests.memberId })
        .from(travelRequests)
        .where(eq(travelRequests.id, input.travelRequestId))
        .limit(1);
      if (!request[0] || request[0].memberId !== input.memberId)
        throw new Error("Travel request and member do not match");
      const [row] = await db
        .insert(proposals)
        .values({
          travelRequestId: input.travelRequestId,
          memberId: input.memberId,
          createdByUserId: ctx.user.id,
          title: input.title,
          description: input.description ?? null,
          heroImageUrl: input.heroImageUrl ?? null,
          mapEmbedUrl: input.mapEmbedUrl ?? null,
          itinerary: input.itinerary ?? null,
          pricingTiers: input.pricingTiers ?? null,
          clientMessage: input.clientMessage ?? null,
          totalPrice: input.totalPrice ?? null,
          currency: input.currency?.toUpperCase() ?? "GBP",
          status: "draft",
        })
        .returning({ id: proposals.id });
      if (!row) throw new Error("Proposal could not be created");
      await Promise.all([
        Permify.writeTuple(
          `member:${input.memberId}`,
          "owner",
          `proposal:${row.id}`,
        ),
        Permify.writeTuple(
          `user:${ctx.user.id}`,
          "advisor",
          `proposal:${row.id}`,
        ),
        registerStorageUrls(
          [
            input.heroImageUrl,
            input.mapEmbedUrl,
            ...(input.itinerary?.map((i) => i.imageUrl) ?? []),
            ...(input.itinerary?.map((i) => i.mapUrl) ?? []),
          ],
          input.memberId,
          "proposal",
        ),
      ]);
      await recordEvent({
        aggregateType: "proposal",
        aggregateId: row.id,
        eventType: "created",
        payload: {
          proposalId: row.id,
          travelRequestId: input.travelRequestId,
          memberId: input.memberId,
          advisorId: ctx.user.id,
        },
        idempotencyKey: `proposal:${row.id}:created`,
      });
      return row;
    }),

  updatePresentation: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        title: z.string().trim().min(1).max(255).optional(),
        description: z.string().trim().max(20_000).optional(),
        heroImageUrl: z.string().url().max(1024).nullable().optional(),
        mapEmbedUrl: z.string().url().max(2048).nullable().optional(),
        clientMessage: z.string().trim().max(10_000).nullable().optional(),
        itinerary: z
          .array(
            z.object({
              day: z.number().int().min(1),
              title: z.string().trim().min(1).max(255),
              location: z.string().trim().max(255).optional(),
              description: z.string().trim().max(10_000).optional(),
              imageUrl: z.string().url().max(1024).optional(),
              mapUrl: z.string().url().max(2048).optional(),
              activities: z.array(z.string().trim().min(1).max(255)).optional(),
            }),
          )
          .optional(),
        pricingTiers: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(128),
              description: z.string().trim().max(2_000).optional(),
              totalPrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
              currency: z.string().length(3).default("GBP"),
              inclusions: z.array(z.string().trim().min(1).max(255)).optional(),
              recommended: z.boolean().optional(),
            }),
          )
          .optional(),
        totalPrice: z
          .string()
          .regex(/^\d+(\.\d{1,2})?$/)
          .optional(),
        currency: z.string().length(3).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, ...data } = input;
      // Fetch the owning member so any new storage-backed image URLs in this
      // update are registered for download authorization.
      const [owner] = await db
        .select({ memberId: proposals.memberId })
        .from(proposals)
        .where(eq(proposals.id, id))
        .limit(1);
      if (!owner) throw new Error("Proposal was not found");
      const [row] = await db
        .update(proposals)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(proposals.id, id))
        .returning({ id: proposals.id });
      if (!row) throw new Error("Proposal was not found");
      const itinerary = input.itinerary ?? [];
      await registerStorageUrls(
        [
          input.heroImageUrl ?? null,
          input.mapEmbedUrl ?? null,
          ...itinerary.map((i) => i.imageUrl),
          ...itinerary.map((i) => i.mapUrl),
        ],
        owner.memberId,
        "proposal",
      ).catch(() => {
        // A registry write failure must not break the proposal update.
      });
      return row;
    }),

  detail: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [proposal] = await db
        .select()
        .from(proposals)
        .where(eq(proposals.id, input.id));
      if (!proposal) return null;
      const items = await db
        .select()
        .from(proposalItems)
        .where(eq(proposalItems.proposalId, proposal.id))
        .orderBy(proposalItems.sortOrder);
      const commercial = {
        totalPrice: proposal.totalPrice ?? "0",
        totalCommission: items.reduce(
          (sum, item) => sum + Number(item.commissionAmount ?? "0"),
          0,
        ),
        averageMarginPercent: items.length
          ? items.reduce(
              (sum, item) => sum + Number(item.commissionRate ?? "0"),
              0,
            ) / items.length
          : 0,
      };
      return { proposal, items, commercial };
    }),

  myProposalDetail: memberProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      const [proposal] = await db
        .select()
        .from(proposals)
        .where(
          and(
            eq(proposals.id, input.id),
            eq(proposals.memberId, ctx.member.id),
          ),
        );
      if (!proposal) return null;
      const items = await db
        .select({
          id: proposalItems.id,
          sortOrder: proposalItems.sortOrder,
          itemType: proposalItems.itemType,
          title: proposalItems.title,
          description: proposalItems.description,
          checkIn: proposalItems.checkIn,
          checkOut: proposalItems.checkOut,
          nights: proposalItems.nights,
          quantity: proposalItems.quantity,
          totalPrice: proposalItems.totalPrice,
          currency: proposalItems.currency,
          notes: proposalItems.notes,
          imageUrl: proposalItems.imageUrl,
        })
        .from(proposalItems)
        .where(eq(proposalItems.proposalId, proposal.id))
        .orderBy(proposalItems.sortOrder);
      return { proposal, items };
    }),

  send: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [row] = await db
        .update(proposals)
        .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
        .where(eq(proposals.id, input.id))
        .returning({ id: proposals.id, memberId: proposals.memberId });
      if (!row) throw new Error("Proposal was not found");
      await recordEvent({
        aggregateType: "proposal",
        aggregateId: row.id,
        eventType: "sent",
        payload: {
          proposalId: row.id,
          memberId: row.memberId,
          advisorId: ctx.user.id,
        },
        idempotencyKey: `proposal:${row.id}:sent`,
      });
      return { success: true };
    }),

  respond: memberProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        decision: z.enum(["approved", "rejected"]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const allowed = await Permify.check(
        `member:${ctx.member.id}`,
        "respond",
        `proposal:${input.id}`,
      );
      if (!allowed)
        throw new Error("Not authorized to respond to this proposal");
      const db = await getDb();
      const [row] = await db
        .update(proposals)
        .set({
          status: input.decision,
          approvedAt: input.decision === "approved" ? new Date() : null,
          rejectedAt: input.decision === "rejected" ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(proposals.id, input.id),
            eq(proposals.memberId, ctx.member.id),
          ),
        )
        .returning({ id: proposals.id });
      if (!row) throw new Error("Proposal was not found");
      await recordEvent({
        aggregateType: "proposal",
        aggregateId: row.id,
        eventType: "responded",
        payload: {
          proposalId: row.id,
          memberId: ctx.member.id,
          decision: input.decision,
        },
        idempotencyKey: `proposal:${row.id}:response:${input.decision}`,
      });
      return { success: true };
    }),

  listByRequest: protectedProcedure
    .input(z.object({ travelRequestId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db
        .select()
        .from(proposals)
        .where(eq(proposals.travelRequestId, input.travelRequestId))
        .orderBy(desc(proposals.createdAt));
    }),

  myProposals: memberProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    return db
      .select()
      .from(proposals)
      .where(eq(proposals.memberId, ctx.member.id))
      .orderBy(desc(proposals.createdAt));
  }),
});

// ─── Bookings ─────────────────────────────────────────────────────────────────

export const bookingsRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        proposalId: z.number().int().positive(),
        memberId: z.number().int().positive(),
        supplierId: z.number().int().positive().optional(),
        referenceNumber: z.string().trim().max(128).optional(),
        commissionExpected: z
          .string()
          .regex(/^\d+(\.\d{1,2})?$/)
          .optional(),
        currency: z.string().length(3).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const proposal = await db
        .select({
          memberId: proposals.memberId,
          status: proposals.status,
          travelRequestId: proposals.travelRequestId,
        })
        .from(proposals)
        .where(eq(proposals.id, input.proposalId))
        .limit(1);
      if (
        !proposal[0] ||
        proposal[0].memberId !== input.memberId ||
        proposal[0].status !== "approved"
      ) {
        throw new Error(
          "An approved proposal for this member is required before creating a booking",
        );
      }
      const currency = input.currency?.toUpperCase() ?? "GBP";
      const [row] = await db
        .insert(bookings)
        .values({
          proposalId: input.proposalId,
          memberId: input.memberId,
          supplierId: input.supplierId ?? null,
          createdByUserId: ctx.user.id,
          referenceNumber: input.referenceNumber ?? null,
          commissionExpected: input.commissionExpected ?? null,
          currency,
          status: "pending",
        })
        .returning({ id: bookings.id });
      if (!row) throw new Error("Booking could not be created");
      await Promise.all([
        Permify.writeTuple(
          `member:${input.memberId}`,
          "owner",
          `booking:${row.id}`,
        ),
        Permify.writeTuple(
          `user:${ctx.user.id}`,
          "advisor",
          `booking:${row.id}`,
        ),
      ]);
      let ledgerTransferId: string | null = null;
      if (input.commissionExpected) {
        const transfer = await recordBookingCommission({
          bookingId: row.id,
          memberId: input.memberId,
          amount: input.commissionExpected,
          currency,
        });
        ledgerTransferId = transfer.transferId;
      }
      await recordEvent({
        aggregateType: "booking",
        aggregateId: row.id,
        eventType: "created",
        payload: {
          bookingId: row.id,
          proposalId: input.proposalId,
          memberId: input.memberId,
          advisorId: ctx.user.id,
          ledgerTransferId,
        },
        idempotencyKey: `booking:${row.id}:created`,
      });
      const taskAutomation = await instantiateBookingStageTasks({
        bookingId: row.id,
        memberId: input.memberId,
        assignedToUserId: ctx.user.id,
        createdByUserId: ctx.user.id,
        travelRequestId: proposal[0]?.travelRequestId,
        status: "pending",
      });
      return { id: row.id, ledgerTransferId, taskAutomation };
    }),

  updateStatus: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        status: z.enum([
          "pending",
          "confirmed",
          "paid",
          "cancelled",
          "refunded",
        ]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [existing] = await db
        .select({
          id: bookings.id,
          memberId: bookings.memberId,
          proposalId: bookings.proposalId,
        })
        .from(bookings)
        .where(eq(bookings.id, input.id));
      if (!existing) throw new Error("Booking was not found");
      const [row] = await db
        .update(bookings)
        .set({
          status: input.status,
          confirmedAt: input.status === "confirmed" ? new Date() : undefined,
          cancelledAt: input.status === "cancelled" ? new Date() : undefined,
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, input.id))
        .returning({ id: bookings.id });
      const [proposal] = await db
        .select({ travelRequestId: proposals.travelRequestId })
        .from(proposals)
        .where(eq(proposals.id, existing.proposalId));
      const taskAutomation = await instantiateBookingStageTasks({
        bookingId: existing.id,
        memberId: existing.memberId,
        assignedToUserId: ctx.user.id,
        createdByUserId: ctx.user.id,
        travelRequestId: proposal?.travelRequestId,
        status: input.status,
      });
      await recordEvent({
        aggregateType: "booking",
        aggregateId: existing.id,
        eventType: `status_${input.status}`,
        payload: {
          bookingId: existing.id,
          memberId: existing.memberId,
          advisorId: ctx.user.id,
          status: input.status,
          createdTaskIds: taskAutomation.createdTaskIds,
        },
        idempotencyKey: `booking:${existing.id}:status:${input.status}`,
      });
      return { id: row?.id ?? existing.id, taskAutomation };
    }),

  markCommissionReceived: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [row] = await db
        .update(bookings)
        .set({
          commissionReceived: true,
          commissionReceivedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, input.id))
        .returning({ id: bookings.id, memberId: bookings.memberId });
      if (!row) throw new Error("Booking was not found");
      await recordEvent({
        aggregateType: "booking",
        aggregateId: row.id,
        eventType: "commission_received",
        payload: {
          bookingId: row.id,
          memberId: row.memberId,
          advisorId: ctx.user.id,
        },
        idempotencyKey: `booking:${row.id}:commission-received`,
      });
      return { success: true };
    }),

  list: protectedProcedure.query(async () => {
    const db = await getDb();
    return db.select().from(bookings).orderBy(desc(bookings.createdAt));
  }),

  myBookings: memberProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    return db
      .select()
      .from(bookings)
      .where(eq(bookings.memberId, ctx.member.id))
      .orderBy(desc(bookings.createdAt));
  }),
});

// ─── Suppliers ────────────────────────────────────────────────────────────────

export const suppliersRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(255),
        category: z.string().trim().max(128).optional(),
        subCategory: z.string().trim().max(128).optional(),
        country: z.string().trim().max(128).optional(),
        city: z.string().trim().max(128).optional(),
        propertyType: z
          .enum([
            "hotel",
            "villa",
            "yacht",
            "jet",
            "transfer",
            "experience",
            "other",
          ])
          .optional(),
        rating: z.number().int().min(1).max(5).optional(),
        isVirtuoso: z.boolean().optional(),
        preferredPartnerNetwork: z.string().trim().max(64).optional(),
        contactEmail: z.string().email().optional(),
        contactPhone: z.string().trim().max(64).optional(),
        website: z.string().trim().max(512).optional(),
        defaultCommissionRate: z.number().min(0).max(100).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [row] = await db
        .insert(suppliers)
        .values({
          name: input.name,
          category: input.category ?? null,
          subCategory: input.subCategory ?? null,
          country: input.country ?? null,
          city: input.city ?? null,
          propertyType: input.propertyType ?? null,
          rating: input.rating ?? null,
          isVirtuoso: input.isVirtuoso ?? false,
          preferredPartnerNetwork: input.preferredPartnerNetwork ?? null,
          contactEmail: input.contactEmail?.toLowerCase() ?? null,
          contactPhone: input.contactPhone ?? null,
          website: input.website ?? null,
          defaultCommissionRate: input.defaultCommissionRate?.toString() ?? null,
        })
        .returning({ id: suppliers.id });
      if (!row) throw new Error("Supplier could not be created");
      await recordEvent({
        aggregateType: "supplier",
        aggregateId: row.id,
        eventType: "created",
        payload: { supplierId: row.id, advisorId: ctx.user.id },
        idempotencyKey: `supplier:${row.id}:created`,
      });
      return row;
    }),

  list: protectedProcedure.query(async () => {
    const db = await getDb();
    return db.select().from(suppliers).orderBy(suppliers.name);
  }),

  // Virtuoso catalog query used by the recommendation engine: suppliers by
  // destination and property type, optionally restricted to Virtuoso.
  listByDestination: protectedProcedure
    .input(
      z.object({
        city: z.string().trim().max(128).optional(),
        country: z.string().trim().max(128).optional(),
        propertyType: z
          .enum([
            "hotel",
            "villa",
            "yacht",
            "jet",
            "transfer",
            "experience",
            "other",
          ])
          .optional(),
        virtuosoOnly: z.boolean().optional(),
      }),
    )
    .query(async ({ input }) => {
      const db = await getDb();
      const conds = [eq(suppliers.isActive, true)];
      if (input.city) conds.push(eq(suppliers.city, input.city));
      if (input.country) conds.push(eq(suppliers.country, input.country));
      if (input.propertyType)
        conds.push(eq(suppliers.propertyType, input.propertyType));
      if (input.virtuosoOnly) conds.push(eq(suppliers.isVirtuoso, true));
      return db
        .select()
        .from(suppliers)
        .where(and(...conds))
        .orderBy(desc(suppliers.rating));
    }),

  // A full catalog entry: the supplier plus its room tiers and amenities.
  getCatalogEntry: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [supplier] = await db
        .select()
        .from(suppliers)
        .where(eq(suppliers.id, input.id))
        .limit(1);
      if (!supplier) return null;
      const roomRates = await db
        .select()
        .from(supplierRoomRates)
        .where(
          and(
            eq(supplierRoomRates.supplierId, input.id),
            eq(supplierRoomRates.isActive, true),
          ),
        )
        .orderBy(supplierRoomRates.startingRate);
      const amenities = await db
        .select()
        .from(supplierAmenities)
        .where(
          and(
            eq(supplierAmenities.supplierId, input.id),
            eq(supplierAmenities.isActive, true),
          ),
        );
      return { ...supplier, roomRates, amenities };
    }),

  addRoomRate: protectedProcedure
    .input(
      z.object({
        supplierId: z.number().int().positive(),
        roomTier: z.enum([
          "standard",
          "deluxe",
          "junior_suite",
          "suite",
          "presidential",
          "other",
        ]),
        startingRate: z.string().regex(/^\d+(\.\d{1,2})?$/),
        currency: z.string().length(3).default("GBP"),
        seasonNotes: z.string().trim().max(255).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [row] = await db
        .insert(supplierRoomRates)
        .values({
          supplierId: input.supplierId,
          roomTier: input.roomTier,
          startingRate: input.startingRate,
          currency: input.currency,
          seasonNotes: input.seasonNotes ?? null,
        })
        .returning({ id: supplierRoomRates.id });
      if (!row) throw new Error("Room rate could not be added");
      return row;
    }),

  addAmenity: protectedProcedure
    .input(
      z.object({
        supplierId: z.number().int().positive(),
        name: z.string().trim().min(1).max(128),
        benefitType: z.string().trim().max(64).optional(),
        description: z.string().trim().max(1000).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [row] = await db
        .insert(supplierAmenities)
        .values({
          supplierId: input.supplierId,
          name: input.name,
          benefitType: input.benefitType ?? null,
          description: input.description ?? null,
        })
        .returning({ id: supplierAmenities.id });
      if (!row) throw new Error("Amenity could not be added");
      return row;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().trim().min(1).max(255).optional(),
        category: z.string().trim().max(128).nullable().optional(),
        subCategory: z.string().trim().max(128).nullable().optional(),
        country: z.string().trim().max(128).nullable().optional(),
        city: z.string().trim().max(128).nullable().optional(),
        propertyType: z
          .enum([
            "hotel",
            "villa",
            "yacht",
            "jet",
            "transfer",
            "experience",
            "other",
          ])
          .nullable()
          .optional(),
        rating: z.number().int().min(1).max(5).nullable().optional(),
        isVirtuoso: z.boolean().optional(),
        preferredPartnerNetwork: z.string().trim().max(64).nullable().optional(),
        contactEmail: z.string().email().nullable().optional(),
        contactPhone: z.string().trim().max(64).nullable().optional(),
        website: z.string().trim().max(512).nullable().optional(),
        defaultCommissionRate: z.number().min(0).max(100).nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, defaultCommissionRate, ...data } = input;
      const [row] = await db
        .update(suppliers)
        .set({
          ...data,
          contactEmail: data.contactEmail?.toLowerCase(),
          defaultCommissionRate:
            defaultCommissionRate === undefined
              ? undefined
              : defaultCommissionRate === null
                ? null
                : defaultCommissionRate.toString(),
          updatedAt: new Date(),
        })
        .where(eq(suppliers.id, id))
        .returning({ id: suppliers.id });
      if (!row) throw new Error("Supplier was not found");
      return { success: true };
    }),
});

// ─── Documents ────────────────────────────────────────────────────────────────

export const documentsRouter = router({
  upload: protectedProcedure
    .input(
      z.object({
        memberId: z.number().int().positive(),
        title: z.string().trim().min(1).max(255),
        fileUrl: z.string().url().max(1024),
        documentType: z.string().trim().max(64).optional(),
        travelRequestId: z.number().int().positive().optional(),
        bookingId: z.number().int().positive().optional(),
        isVisibleToMember: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [row] = await db
        .insert(documents)
        .values({
          memberId: input.memberId,
          travelRequestId: input.travelRequestId ?? null,
          bookingId: input.bookingId ?? null,
          title: input.title,
          fileUrl: input.fileUrl,
          documentType: input.documentType ?? null,
          uploadedByUserId: ctx.user.id,
          isVisibleToMember: input.isVisibleToMember ?? true,
        })
        .returning({ id: documents.id });
      if (!row) throw new Error("Document could not be recorded");
      await Promise.all([
        Permify.writeTuple(
          `member:${input.memberId}`,
          "owner",
          `document:${row.id}`,
        ),
        Permify.writeTuple(
          `user:${ctx.user.id}`,
          "advisor",
          `document:${row.id}`,
        ),
        registerStorageUrls([input.fileUrl], input.memberId, "document"),
      ]);
      await recordEvent({
        aggregateType: "document",
        aggregateId: row.id,
        eventType: "uploaded",
        payload: {
          documentId: row.id,
          memberId: input.memberId,
          advisorId: ctx.user.id,
        },
        idempotencyKey: `document:${row.id}:uploaded`,
      });
      return row;
    }),

  myDocuments: memberProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    return db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.memberId, ctx.member.id),
          eq(documents.isVisibleToMember, true),
        ),
      )
      .orderBy(desc(documents.createdAt));
  }),

  listByMember: protectedProcedure
    .input(z.object({ memberId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db
        .select()
        .from(documents)
        .where(eq(documents.memberId, input.memberId))
        .orderBy(desc(documents.createdAt));
    }),
});
