import { z } from "zod";
import { eq } from "drizzle-orm";
import { advisorTasks, members } from "../drizzle/schema";
import { getDb } from "./db";
import { adminProcedure, router } from "./_core/trpc";
import {
  getCrmFieldConflict,
  getCrmObjectLinkById,
  getCrmSyncSummary,
  listCrmObjectLinks,
  listCrmSyncDeliveries,
  listOpenCrmFieldConflicts,
  listRecentCrmInboundEvents,
  markCrmObjectLinkState,
  resolveCrmFieldConflict,
} from "./_core/crmSyncStore";
import { synchronizeCrmObjectLink } from "./_core/crmSyncService";
import { TwentyCrmClient, TwentyCrmError } from "./_core/twentyClient";
import { TWENTY_OBJECT_API_NAMES } from "./_core/crmProjection";

async function applyCrmConflictValue(
  link: NonNullable<Awaited<ReturnType<typeof getCrmObjectLinkById>>>,
  fieldName: string,
  value: unknown,
) {
  const db = await getDb();
  const lanaiId = Number(link.lanaiObjectId);
  if (!Number.isInteger(lanaiId)) {
    throw new Error(`CRM link ${link.id} has an invalid Lanai identifier`);
  }
  if (link.lanaiObjectType === "member") {
    if (fieldName === "name" && typeof value === "string") {
      await db
        .update(members)
        .set({ name: value.slice(0, 255), updatedAt: new Date() })
        .where(eq(members.id, lanaiId));
      return;
    }
    if (fieldName === "emails" && typeof value === "string") {
      await db
        .update(members)
        .set({
          email: value.toLowerCase().slice(0, 320),
          updatedAt: new Date(),
        })
        .where(eq(members.id, lanaiId));
      return;
    }
    if (fieldName === "phones" && typeof value === "string") {
      await db
        .update(members)
        .set({ phone: value.slice(0, 64), updatedAt: new Date() })
        .where(eq(members.id, lanaiId));
      return;
    }
  }
  if (link.lanaiObjectType === "advisor_task") {
    if (fieldName === "title" && typeof value === "string") {
      await db
        .update(advisorTasks)
        .set({ title: value.slice(0, 255), updatedAt: new Date() })
        .where(eq(advisorTasks.id, lanaiId));
      return;
    }
    if (fieldName === "body" && typeof value === "string") {
      await db
        .update(advisorTasks)
        .set({ description: value.slice(0, 10_000), updatedAt: new Date() })
        .where(eq(advisorTasks.id, lanaiId));
      return;
    }
    if (
      fieldName === "status" &&
      ["open", "in_progress", "done", "cancelled"].includes(String(value))
    ) {
      await db
        .update(advisorTasks)
        .set({
          status: String(value) as
            "open" | "in_progress" | "done" | "cancelled",
          updatedAt: new Date(),
        })
        .where(eq(advisorTasks.id, lanaiId));
      return;
    }
    if (fieldName === "dueAt" && typeof value === "string") {
      const dueDate = new Date(value);
      if (!Number.isNaN(dueDate.valueOf())) {
        await db
          .update(advisorTasks)
          .set({ dueDate, updatedAt: new Date() })
          .where(eq(advisorTasks.id, lanaiId));
        return;
      }
    }
  }
  throw new Error(
    `CRM-selected resolution for ${link.lanaiObjectType}.${fieldName} is not supported`,
  );
}

export const crmSyncRouter = router({
  summary: adminProcedure.query(async () => getCrmSyncSummary()),

  links: adminProcedure
    .input(
      z.object({
        state: z
          .enum([
            "pending",
            "synced",
            "conflicted",
            "failed",
            "dead_letter",
            "detached",
          ])
          .optional(),
        limit: z.number().int().min(1).max(500).default(100),
      }),
    )
    .query(async ({ input }) => listCrmObjectLinks(input)),

  deliveries: adminProcedure
    .input(
      z.object({
        status: z
          .enum([
            "pending",
            "synced",
            "conflicted",
            "failed",
            "dead_letter",
            "detached",
          ])
          .optional(),
        limit: z.number().int().min(1).max(500).default(100),
      }),
    )
    .query(async ({ input }) => listCrmSyncDeliveries(input)),

  inboundEvents: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(500).default(100) }))
    .query(async ({ input }) => listRecentCrmInboundEvents(input.limit)),

  conflicts: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(500).default(100) }))
    .query(async ({ input }) => listOpenCrmFieldConflicts(input.limit)),

  resyncLink: adminProcedure
    .input(
      z.object({
        linkId: z.number().int().positive(),
        reason: z.string().min(3).max(256).default("advisor-resync"),
      }),
    )
    .mutation(async ({ input }) => {
      const link = await getCrmObjectLinkById(input.linkId);
      if (!link)
        throw new Error(`CRM object link ${input.linkId} was not found`);
      const result = await synchronizeCrmObjectLink({
        lanaiObjectType: link.lanaiObjectType,
        lanaiObjectId: link.lanaiObjectId,
        reason: input.reason,
      });
      await markCrmObjectLinkState(link.id, "synced");
      return { success: true, result };
    }),

  reconcileLink: adminProcedure
    .input(z.object({ linkId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const link = await getCrmObjectLinkById(input.linkId);
      if (!link)
        throw new Error(`CRM object link ${input.linkId} was not found`);
      if (link.syncState === "detached")
        return { success: true, state: "detached" as const };
      const client = new TwentyCrmClient();
      try {
        const remote = await client.getRecord(
          TWENTY_OBJECT_API_NAMES[
            link.crmObjectType as keyof typeof TWENTY_OBJECT_API_NAMES
          ],
          link.crmObjectId,
        );
        await markCrmObjectLinkState(link.id, "synced", {
          lastCrmRevision:
            typeof remote.updatedAt === "string" ? remote.updatedAt : null,
        });
        return {
          success: true,
          state: "synced" as const,
          remoteRevision: remote.updatedAt ?? null,
        };
      } catch (error) {
        const state =
          error instanceof TwentyCrmError && error.status === 404
            ? "detached"
            : "failed";
        await markCrmObjectLinkState(link.id, state);
        return {
          success: false,
          state,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),

  resolveConflict: adminProcedure
    .input(
      z.object({
        conflictId: z.number().int().positive(),
        resolution: z.enum(["resolved_lanai", "resolved_crm", "ignored"]),
        resolutionNote: z.string().max(2_000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const conflict = await getCrmFieldConflict(input.conflictId);
      if (!conflict)
        throw new Error(`CRM field conflict ${input.conflictId} was not found`);
      if (conflict.status !== "open")
        throw new Error(
          `CRM field conflict ${input.conflictId} is already resolved`,
        );
      const link = await getCrmObjectLinkById(conflict.crmObjectLinkId);
      if (!link)
        throw new Error(
          `CRM object link ${conflict.crmObjectLinkId} was not found`,
        );
      if (input.resolution === "resolved_crm") {
        await applyCrmConflictValue(
          link,
          conflict.fieldName,
          conflict.crmValue,
        );
      }
      const resolved = await resolveCrmFieldConflict({
        conflictId: input.conflictId,
        resolution: input.resolution,
        resolvedByUserId: ctx.user.id,
        resolutionNote: input.resolutionNote,
      });
      if (input.resolution === "resolved_lanai") {
        await synchronizeCrmObjectLink({
          lanaiObjectType: link.lanaiObjectType,
          lanaiObjectId: link.lanaiObjectId,
          reason: `conflict-${input.conflictId}-lanai`,
        });
      }
      await markCrmObjectLinkState(link.id, "synced");
      return resolved;
    }),
});
