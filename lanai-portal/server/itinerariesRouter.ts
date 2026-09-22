/**
 * Custom Itineraries router — advisor-built, member-facing day-by-day plans.
 */
import { z } from "zod";
import { eq, desc, and } from "drizzle-orm";
import { router, protectedProcedure, memberProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { customItineraries } from "../drizzle/schema";

const daySchema = z.object({
  day: z.number().int().positive(),
  date: z.string().optional(),
  title: z.string().optional(),
  activities: z.array(z.object({
    time: z.string().optional(),
    title: z.string(),
    description: z.string().optional(),
    category: z.string().optional(),
  })),
});

export const itinerariesRouter = router({
  /** Advisor: list custom itineraries for a member. */
  listForMember: protectedProcedure
    .input(z.object({ memberId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(customItineraries)
        .where(eq(customItineraries.memberId, input.memberId))
        .orderBy(desc(customItineraries.createdAt));
    }),

  /** Advisor: create a custom itinerary. */
  create: protectedProcedure
    .input(
      z.object({
        memberId: z.number().int().positive(),
        title: z.string().min(1),
        destination: z.string().optional(),
        status: z.enum(["draft", "shared", "final"]).default("draft"),
        days: z.array(daySchema).default([]),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) {
        return {
          id: 1,
          advisorUserId: ctx.user?.id ?? null,
          ...input,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
      const [created] = await db
        .insert(customItineraries)
        .values({
          memberId: input.memberId,
          advisorUserId: ctx.user?.id ?? null,
          title: input.title,
          destination: input.destination ?? null,
          status: input.status,
          days: input.days,
          notes: input.notes ?? null,
        })
        .returning();
      return created;
    }),

  /** Advisor: update a custom itinerary. */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        title: z.string().min(1).optional(),
        destination: z.string().optional(),
        status: z.enum(["draft", "shared", "final"]).optional(),
        days: z.array(daySchema).optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, ...patch } = input;
      if (!db) return { id, ...patch };
      const [updated] = await db
        .update(customItineraries)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(customItineraries.id, id))
        .returning();
      return updated;
    }),

  /** Advisor: delete a custom itinerary. */
  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: true };
      await db.delete(customItineraries).where(eq(customItineraries.id, input.id));
      return { success: true };
    }),

  /** Member: list itineraries shared with them (status shared/final). */
  myItineraries: memberProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(customItineraries)
      .where(and(eq(customItineraries.memberId, ctx.member.id), eq(customItineraries.status, "shared")))
      .orderBy(desc(customItineraries.createdAt));
  }),
});
