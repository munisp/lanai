/**
 * travelRouter.ts
 * Handles travel requests, proposals, bookings, suppliers, and documents.
 * All mutations emit events to Fluvio and notify via Dapr pub/sub.
 * When no database is available (test/offline mode), uses an in-memory store.
 */
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { router, protectedProcedure, memberProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import {
  travelRequests,
  proposals,
  bookings,
  suppliers,
  documents,
  advisorTasks,
  taskTemplates,
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

  /** Advisor records the member's digital approval (with signature). */
  approve: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        signatureData: z.string().optional(),
        approvedByUserId: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const patch: Record<string, unknown> = {
        status: "approved",
        approvedAt: new Date(),
        approvedByUserId: input.approvedByUserId ?? ctx.user?.id ?? null,
        signatureData: input.signatureData ?? null,
        updatedAt: new Date(),
      };
      if (!db) {
        const p = _store.proposals.find((p: any) => p.id === input.id);
        if (p) Object.assign(p, patch);
      } else {
        await db.update(proposals).set(patch).where(eq(proposals.id, input.id));
      }
      await Fluvio.produce("proposals", JSON.stringify({ event: "approved", id: input.id }));
      return { success: true };
    }),

  /** Advisor records a rejection with a reason. */
  reject: protectedProcedure
    .input(z.object({ id: z.number(), reason: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const patch: Record<string, unknown> = {
        status: "rejected",
        rejectedAt: new Date(),
        rejectionReason: input.reason ?? null,
        updatedAt: new Date(),
      };
      if (!db) {
        const p = _store.proposals.find((p: any) => p.id === input.id);
        if (p) Object.assign(p, patch);
      } else {
        await db.update(proposals).set(patch).where(eq(proposals.id, input.id));
      }
      await Fluvio.produce("proposals", JSON.stringify({ event: "rejected", id: input.id }));
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

  /** Advisor: generate a rich AI proposal and persist it to the client file. */
  generateFromAI: protectedProcedure
    .input(
      z.object({
        travelRequestId: z.number(),
        memberId: z.number(),
        clientName: z.string().min(1),
        destination: z.string().min(1),
        tripType: z.string().optional(),
        budget: z.string().optional(),
        dates: z.string().optional(),
        preferences: z.string().optional(),
        specialRequirements: z.string().optional(),
        heroImageUrl: z.string().url().optional(),
        mapEmbedUrl: z.string().url().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const aiUrl = process.env.AI_PROPOSALS_URL ?? "http://localhost:5556";
      let ai: any = null;
      try {
        const res = await fetch(`${aiUrl}/api/generate-proposal`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_name: input.clientName,
            destination: input.destination,
            travel_type: input.tripType ?? "luxury travel",
            budget: input.budget ?? "",
            dates: input.dates ?? "",
            preferences: input.preferences ?? "",
            special_requirements: input.specialRequirements ?? "",
          }),
          signal: AbortSignal.timeout(120000),
        });
        if (res.ok) ai = await res.json();
      } catch (err) {
        console.warn("[Proposals] AI generation failed, using structured fallback", String(err));
      }
      if (!ai) {
        ai = {
          proposal_title: `A Private ${input.destination} Experience — ${input.clientName}`,
          executive_summary: `We have curated an exceptional luxury journey to ${input.destination} tailored exclusively for you.`,
          why_this_destination: `${input.destination} offers an unparalleled combination of luxury, culture, and natural beauty.`,
          accommodation: { name: "Private Villa / Boutique Resort", description: "Handpicked for privacy and exceptional service.", why_chosen: "Matches your preference for intimate, exclusive settings." },
          day_by_day: [
            { day: 1, title: "Arrival & Welcome", description: "Private transfer, welcome dinner." },
            { day: 2, title: "Exploration", description: "Guided private experiences." },
            { day: 3, title: "Leisure & Departure", description: "Relaxation and farewell." },
          ],
          included_experiences: ["Private transfers", "Daily breakfast", "Curated excursions"],
          estimated_investment: input.budget || "To be confirmed",
          next_steps: "Please review and let us know if you'd like to adjust any element.",
          advisor_note: `This proposal has been personally curated for you, ${input.clientName}.`,
        };
      }
      const title = ai.proposal_title ?? `Proposal — ${input.destination}`;
      const db = await getDb();

      // Derive pricing tiers / upgrades / margin so the client UI always has
      // structured commercial detail, even when the model omits them.
      const basePrice = (() => {
        const digits = String(ai.estimated_investment ?? input.budget ?? "").replace(/[^0-9.]/g, "");
        const n = parseFloat(digits);
        return Number.isFinite(n) && n > 0 ? n : 0;
      })();
      const pricingTiers = ai.pricing_tiers ?? (basePrice > 0
        ? [
            { name: "Essential", description: "Curated core experience", price: `£${Math.round(basePrice).toLocaleString()}` },
            { name: "Signature", description: "Enhanced inclusions & upgrades", price: `£${Math.round(basePrice * 1.25).toLocaleString()}` },
            { name: "Ultimate", description: "Fully bespoke, no compromise", price: `£${Math.round(basePrice * 1.6).toLocaleString()}` },
          ]
        : null);
      const upgrades = ai.upgrades ?? (Array.isArray(ai.included_experiences) && ai.included_experiences.length
        ? ai.included_experiences.slice(0, 3).map((e: string) => ({ name: e, description: "Available as a premium add-on" }))
        : null);
      const marginPct = ai.margin_pct != null ? String(ai.margin_pct) : "18";

      const row = {
        travelRequestId: input.travelRequestId,
        memberId: input.memberId,
        createdByUserId: ctx.user?.id ?? null,
        title,
        description: ai.executive_summary ?? null,
        aiGenerated: true,
        aiModel: "lanai-ai-proposals",
        status: "draft" as const,
        totalPrice: ai.estimated_investment ? String(ai.estimated_investment).replace(/[^0-9.]/g, "") || null : null,
        currency: "GBP",
        aiContent: ai,
        heroImageUrl: input.heroImageUrl ?? null,
        mapEmbedUrl: input.mapEmbedUrl ?? null,
        pricingTiers,
        upgrades,
        marginPct,
      };
      if (!db) {
        const id = _store.nextId();
        _store.proposals.push({ id, ...row, createdAt: new Date(), updatedAt: new Date() });
        return { id, aiContent: ai };
      }
      const [inserted] = await db.insert(proposals).values(row).returning({ id: proposals.id });
      await Fluvio.produce("proposals", JSON.stringify({ event: "ai_created", id: inserted.id }));
      return { id: inserted.id, aiContent: ai };
    }),

  /** Get a single proposal with its full AI content */
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return _store.proposals.find((p: any) => p.id === input.id) ?? null;
      const [p] = await db.select().from(proposals).where(eq(proposals.id, input.id));
      return p ?? null;
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

  /** Advisor updates a booking's status. When the status changes, any task
   *  templates configured with triggerOnBookingStatus = <new status> are
   *  automatically instantiated as advisor tasks (concierge workflow). */
  updateStatus: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        status: z.enum(["pending", "confirmed", "in_progress", "completed", "cancelled"]),
        assignedToUserId: z.number().int().positive().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const now = new Date();
      if (!db) {
        const b = _store.bookings.find((b: any) => b.id === input.id);
        if (b) { b.status = input.status; b.updatedAt = now; }
      } else {
        const [current] = await db
          .select({ memberId: bookings.memberId, status: bookings.status })
          .from(bookings)
          .where(eq(bookings.id, input.id));
        if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found" });

        const patch: Record<string, unknown> = { status: input.status, updatedAt: now };
        if (input.notes !== undefined) patch.notes = input.notes;
        if (input.status === "confirmed") patch.confirmedAt = now;
        if (input.status === "cancelled") patch.cancelledAt = now;
        await db.update(bookings).set(patch).where(eq(bookings.id, input.id));

        // Auto-create concierge tasks from templates triggered by this status.
        if (current.status !== input.status) {
          const triggers = await db
            .select()
            .from(taskTemplates)
            .where(
              and(
                eq(taskTemplates.isActive, true),
                eq(taskTemplates.triggerOnBookingStatus, input.status)
              )
            );
          for (const tpl of triggers) {
            const due = new Date();
            due.setDate(due.getDate() + (tpl.defaultDueDaysFromTrigger ?? 1));
            await db.insert(advisorTasks).values({
              assignedToUserId: input.assignedToUserId ?? ctx.user.id,
              createdByUserId: ctx.user.id,
              memberId: current.memberId,
              bookingId: input.id,
              title: tpl.name,
              description: tpl.description ?? "",
              status: "open",
              priority: tpl.defaultPriority,
              dueDate: due,
            });
          }
        }
      }
      await Fluvio.produce("bookings", JSON.stringify({ event: "status_changed", id: input.id, status: input.status }));
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
