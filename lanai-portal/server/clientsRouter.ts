import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { clients } from "../drizzle/schema";

/**
 * Postgres-backed Clients router.
 * Advisors can create, list, update and delete client records.
 */
export const clientsRouter = router({
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    return db.select().from(clients).orderBy(desc(clients.createdAt));
  }),

  create: protectedProcedure
    .input(
      z.object({
        firstName: z.string().trim().min(1).max(128),
        lastName: z.string().trim().min(1).max(128),
        email: z.string().email(),
        phone: z.string().max(64).optional(),
        city: z.string().max(128).optional(),
        country: z.string().max(128).optional(),
        company: z.string().max(255).optional(),
        notes: z.string().max(10_000).optional(),
        assignedAdvisorId: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const existing = await db
        .select({ id: clients.id })
        .from(clients)
        .where(eq(clients.email, input.email.toLowerCase()))
        .limit(1);
      if (existing[0]) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A client with this email already exists.",
        });
      }
      const [row] = await db
        .insert(clients)
        .values({
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email.toLowerCase(),
          phone: input.phone ?? null,
          city: input.city ?? null,
          country: input.country ?? null,
          company: input.company ?? null,
          notes: input.notes ?? null,
          assignedAdvisorId: input.assignedAdvisorId ?? ctx.user.id,
        })
        .returning();
      return row;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        firstName: z.string().trim().min(1).max(128).optional(),
        lastName: z.string().trim().min(1).max(128).optional(),
        email: z.string().email().optional(),
        phone: z.string().max(64).nullable().optional(),
        city: z.string().max(128).nullable().optional(),
        country: z.string().max(128).nullable().optional(),
        company: z.string().max(255).nullable().optional(),
        notes: z.string().max(10_000).nullable().optional(),
        assignedAdvisorId: z.number().int().positive().nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, ...data } = input;
      const [row] = await db
        .update(clients)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(clients.id, id))
        .returning();
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Client not found." });
      }
      return row;
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(clients).where(eq(clients.id, input.id));
      return { success: true };
    }),
});
