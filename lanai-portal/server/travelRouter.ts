/**
 * travelRouter.ts
 * Handles travel requests, proposals, bookings, suppliers, and documents.
 * All mutations emit events to Fluvio and notify via Dapr pub/sub.
 * When no database is available (test/offline mode), uses an in-memory store.
 */
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { router, protectedProcedure, memberProcedure } from "./_core/trpc";
import { getDb } from "./db";
import {
  travelRequests,
  proposals,
  bookings,
  suppliers,
  documents,
} from "../drizzle/schema";
import { Fluvio, Dapr, Permify, TigerBeetle } from "./_core/infrastructure";

// ── In-memory store for test/offline mode ────────────────────────────────────
const _store = {
  travelRequests: [] as any[],
  proposals: [] as any[],
  bookings: [] as any[],
  suppliers: [] as any[],
  documents: [] as any[],
  _id: 100,
  nextId() { return this._id++; },
};

// ── Travel Requests ──────────────────────────────────────────────────────────

export const travelRequestsRouter = router({
  /** Member submits a new travel request */
  create: memberProcedure
    .input(
      z.object({
        destination: z.string().min(1),
        dates: z.string().min(1),
        pax: z.number().int().min(1),
        budget: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      let rowId: number;
      if (!db) {
        rowId = _store.nextId();
        _store.travelRequests.push({ id: rowId, memberId: ctx.member.id, ...input, status: "new", createdAt: new Date(), updatedAt: new Date() });
      } else {
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
        rowId = row.id;
      }
      await Fluvio.produce("travel-requests", JSON.stringify({ event: "created", id: rowId, memberId: ctx.member.id }));
      await Dapr.publishEvent("pubsub", "travel-request-created", { id: rowId });
      return { id: rowId };
    }),

  /** Advisor lists all travel requests */
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return _store.travelRequests;
    return db.select().from(travelRequests).orderBy(desc(travelRequests.createdAt));
  }),

  /** Member lists their own travel requests */
  myRequests: memberProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return _store.travelRequests.filter((r: any) => r.memberId === ctx.member.id);
    return db
      .select()
      .from(travelRequests)
      .where(eq(travelRequests.memberId, ctx.member.id))
      .orderBy(desc(travelRequests.createdAt));
  }),

  /** Advisor updates the status of a travel request */
  updateStatus: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["new", "in_progress", "proposal_sent", "booked", "completed", "cancelled"]),
        assignedToUserId: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        const r = _store.travelRequests.find((r: any) => r.id === input.id);
        if (r) r.status = input.status;
      } else {
        await db
          .update(travelRequests)
          .set({ status: input.status, assignedToUserId: input.assignedToUserId ?? null, updatedAt: new Date() })
          .where(eq(travelRequests.id, input.id));
      }
      await Fluvio.produce("travel-requests", JSON.stringify({ event: "status_updated", id: input.id, status: input.status }));
      return { success: true };
    }),
});

// ── Proposals ────────────────────────────────────────────────────────────────

export const proposalsRouter = router({
  /** Advisor creates a proposal for a travel request */
  create: protectedProcedure
    .input(
      z.object({
        travelRequestId: z.number(),
        memberId: z.number(),
        title: z.string().min(1),
        description: z.string().optional(),
        totalPrice: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      let rowId: number;
      if (!db) {
        rowId = _store.nextId();
        _store.proposals.push({ id: rowId, ...input, status: "draft", createdAt: new Date(), updatedAt: new Date() });
      } else {
        const [row] = await db
          .insert(proposals)
          .values({
            travelRequestId: input.travelRequestId,
            memberId: input.memberId,
            title: input.title,
            description: input.description ?? null,
            totalPrice: input.totalPrice ?? null,
            status: "draft",
          })
          .returning({ id: proposals.id });
        rowId = row.id;
      }
      await Fluvio.produce("proposals", JSON.stringify({ event: "created", id: rowId }));
      return { id: rowId };
    }),

  /** Advisor sends a proposal to the member */
  send: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        const p = _store.proposals.find((p: any) => p.id === input.id);
        if (p) p.status = "sent";
      } else {
        await db.update(proposals).set({ status: "sent", updatedAt: new Date() }).where(eq(proposals.id, input.id));
      }
      await Dapr.publishEvent("pubsub", "proposal-sent", { id: input.id });
      return { success: true };
    }),

  /** Member approves or rejects a proposal */
  respond: memberProcedure
    .input(
      z.object({
        id: z.number(),
        decision: z.enum(["approved", "rejected"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      // Permify check: member can only respond to their own proposals
      const allowed = await Permify.check(`member:${ctx.member.id}`, "respond", `proposal:${input.id}`);
      if (!allowed) throw new Error("Not authorised");

      if (!db) {
        const p = _store.proposals.find((p: any) => p.id === input.id);
        if (p) p.status = input.decision;
      } else {
        await db
          .update(proposals)
          .set({ status: input.decision, updatedAt: new Date() })
          .where(and(eq(proposals.id, input.id), eq(proposals.memberId, ctx.member.id)));
      }
      await Fluvio.produce("proposals", JSON.stringify({ event: "responded", id: input.id, decision: input.decision }));
      await Dapr.publishEvent("pubsub", "proposal-responded", { id: input.id, decision: input.decision });
      return { success: true };
    }),

  /** List proposals for a travel request */
  listByRequest: protectedProcedure
    .input(z.object({ travelRequestId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return _store.proposals.filter((p: any) => p.travelRequestId === input.travelRequestId);
      return db
        .select()
        .from(proposals)
        .where(eq(proposals.travelRequestId, input.travelRequestId))
        .orderBy(desc(proposals.createdAt));
    }),

  /** Member lists their own proposals */
  myProposals: memberProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return _store.proposals.filter((p: any) => p.memberId === ctx.member.id);
    return db
      .select()
      .from(proposals)
      .where(eq(proposals.memberId, ctx.member.id))
      .orderBy(desc(proposals.createdAt));
  }),
});

// ── Bookings ─────────────────────────────────────────────────────────────────

export const bookingsRouter = router({
  /** Advisor confirms a booking after proposal approval */
  create: protectedProcedure
    .input(
      z.object({
        proposalId: z.number(),
        memberId: z.number(),
        supplierId: z.number().optional(),
        referenceNumber: z.string().optional(),
        commissionExpected: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      let rowId: number;
      if (!db) {
        rowId = _store.nextId();
        _store.bookings.push({ id: rowId, ...input, status: "pending", commissionReceived: false, createdAt: new Date(), updatedAt: new Date() });
      } else {
        const [row] = await db
          .insert(bookings)
          .values({
            proposalId: input.proposalId,
            memberId: input.memberId,
            supplierId: input.supplierId ?? null,
            referenceNumber: input.referenceNumber ?? null,
            commissionExpected: input.commissionExpected ?? null,
            status: "pending",
          })
          .returning({ id: bookings.id });
        rowId = row.id;
      }
      // Record in TigerBeetle ledger
      await TigerBeetle.createTransfer(BigInt(1000), BigInt(1001), BigInt(1002));
      await Fluvio.produce("bookings", JSON.stringify({ event: "created", id: rowId }));
      return { id: rowId };
    }),

  /** Advisor marks commission as received */
  markCommissionReceived: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        const b = _store.bookings.find((b: any) => b.id === input.id);
        if (b) b.commissionReceived = true;
      } else {
        await db.update(bookings).set({ commissionReceived: true, updatedAt: new Date() }).where(eq(bookings.id, input.id));
      }
      await Fluvio.produce("bookings", JSON.stringify({ event: "commission_received", id: input.id }));
      return { success: true };
    }),

  /** List all bookings */
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return _store.bookings;
    return db.select().from(bookings).orderBy(desc(bookings.createdAt));
  }),

  /** Member views their bookings */
  myBookings: memberProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return _store.bookings.filter((b: any) => b.memberId === ctx.member.id);
    return db
      .select()
      .from(bookings)
      .where(eq(bookings.memberId, ctx.member.id))
      .orderBy(desc(bookings.createdAt));
  }),
});

// ── Suppliers ────────────────────────────────────────────────────────────────

export const suppliersRouter = router({
  /** Advisor creates a supplier */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        category: z.string().optional(),
        contactEmail: z.string().email().optional(),
        contactPhone: z.string().optional(),
        rating: z.number().int().min(1).max(5).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      let rowId: number;
      if (!db) {
        rowId = _store.nextId();
        _store.suppliers.push({ id: rowId, ...input, createdAt: new Date(), updatedAt: new Date() });
      } else {
        const [row] = await db
          .insert(suppliers)
          .values({
            name: input.name,
            category: input.category ?? null,
            contactEmail: input.contactEmail ?? null,
            contactPhone: input.contactPhone ?? null,
            rating: input.rating ?? null,
          })
          .returning({ id: suppliers.id });
        rowId = row.id;
      }
      return { id: rowId };
    }),

  /** List all suppliers */
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return _store.suppliers;
    return db.select().from(suppliers).orderBy(suppliers.name);
  }),

  /** Update supplier details */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().optional(),
        category: z.string().optional(),
        contactEmail: z.string().email().optional(),
        contactPhone: z.string().optional(),
        rating: z.number().int().min(1).max(5).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, ...data } = input;
      if (!db) {
        const s = _store.suppliers.find((s: any) => s.id === id);
        if (s) Object.assign(s, data);
      } else {
        await db.update(suppliers).set({ ...data, updatedAt: new Date() }).where(eq(suppliers.id, id));
      }
      return { success: true };
    }),
});

// ── Documents (Digital Vault) ────────────────────────────────────────────────

export const documentsRouter = router({
  /** Advisor uploads a document for a member */
  upload: protectedProcedure
    .input(
      z.object({
        memberId: z.number(),
        title: z.string().min(1),
        fileUrl: z.string().url(),
        documentType: z.string().optional(),
        uploadedByUserId: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      let rowId: number;
      if (!db) {
        rowId = _store.nextId();
        _store.documents.push({ id: rowId, ...input, uploadedByUserId: ctx.user.id, createdAt: new Date() });
      } else {
        const [row] = await db
          .insert(documents)
          .values({
            memberId: input.memberId,
            title: input.title,
            fileUrl: input.fileUrl,
            documentType: input.documentType ?? null,
            uploadedByUserId: ctx.user.id,
          })
          .returning({ id: documents.id });
        rowId = row.id;
      }
      await Dapr.publishEvent("pubsub", "document-uploaded", { id: rowId, memberId: input.memberId });
      return { id: rowId };
    }),

  /** Member views their own documents */
  myDocuments: memberProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return _store.documents.filter((d: any) => d.memberId === ctx.member.id);
    return db
      .select()
      .from(documents)
      .where(eq(documents.memberId, ctx.member.id))
      .orderBy(desc(documents.createdAt));
  }),

  /** Advisor lists documents for a member */
  listByMember: protectedProcedure
    .input(z.object({ memberId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return _store.documents.filter((d: any) => d.memberId === input.memberId);
      return db
        .select()
        .from(documents)
        .where(eq(documents.memberId, input.memberId))
        .orderBy(desc(documents.createdAt));
    }),
});
