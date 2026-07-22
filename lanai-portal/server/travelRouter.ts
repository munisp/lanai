import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { router, protectedProcedure, memberProcedure } from "./_core/trpc";
import { getDb } from "./db";
import {
  bookings,
  documents,
  proposals,
  proposalItems,
  suppliers,
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
      .select()
      .from(travelRequests)
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
      const [row] = await db
        .update(proposals)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(proposals.id, id))
        .returning({ id: proposals.id });
      if (!row) throw new Error("Proposal was not found");
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
        contactEmail: z.string().email().optional(),
        contactPhone: z.string().trim().max(64).optional(),
        rating: z.number().int().min(1).max(5).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [row] = await db
        .insert(suppliers)
        .values({
          name: input.name,
          category: input.category ?? null,
          contactEmail: input.contactEmail?.toLowerCase() ?? null,
          contactPhone: input.contactPhone ?? null,
          rating: input.rating ?? null,
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

  update: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().trim().min(1).max(255).optional(),
        category: z.string().trim().max(128).nullable().optional(),
        contactEmail: z.string().email().nullable().optional(),
        contactPhone: z.string().trim().max(64).nullable().optional(),
        rating: z.number().int().min(1).max(5).nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, ...data } = input;
      const [row] = await db
        .update(suppliers)
        .set({
          ...data,
          contactEmail: data.contactEmail?.toLowerCase(),
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
