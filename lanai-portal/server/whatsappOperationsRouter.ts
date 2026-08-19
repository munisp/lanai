import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  auditLogs,
  outboxEvents,
  whatsappWebhookEvents,
} from "../drizzle/schema";
import { getDb } from "./db";
import { adminProcedure, router, seniorAdvisorProcedure } from "./_core/trpc";

const DEAD_LETTER_STATUS = "dead_letter";
const WHATSAPP_AUDIT_RESOURCE = "whatsapp_webhook_event";

const listInput = z.object({
  limit: z.number().int().min(1).max(100).default(50),
});

/**
 * Operational controls for the durable WhatsApp consumer.
 *
 * These procedures intentionally never return provider payloads, sender details,
 * message text, or AI output. Senior advisors may inspect operational metadata;
 * only an administrator who also passes Permify's administer relation may replay.
 */
export const whatsappOperationsRouter = router({
  /** Lists terminal consumer failures without exposing message content or payloads. */
  listDeadLetters: seniorAdvisorProcedure
    .input(listInput)
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db
        .select({
          id: whatsappWebhookEvents.id,
          provider: whatsappWebhookEvents.provider,
          providerEventId: whatsappWebhookEvents.providerEventId,
          payloadSha256: whatsappWebhookEvents.payloadSha256,
          attempts: whatsappWebhookEvents.attempts,
          lastError: whatsappWebhookEvents.lastError,
          createdAt: whatsappWebhookEvents.createdAt,
          updatedAt: whatsappWebhookEvents.updatedAt,
          sourceOutboxEventId: outboxEvents.id,
          sourceOutboxStatus: outboxEvents.status,
          sourceOutboxPublishedAt: outboxEvents.publishedAt,
        })
        .from(whatsappWebhookEvents)
        .innerJoin(
          outboxEvents,
          eq(whatsappWebhookEvents.outboxEventId, outboxEvents.id),
        )
        .where(eq(whatsappWebhookEvents.status, DEAD_LETTER_STATUS))
        .orderBy(desc(whatsappWebhookEvents.updatedAt))
        .limit(input.limit);

      return rows.map((row) => ({
        ...row,
        // Bound operational error material even if a future dependency emits a
        // verbose error. Provider payloads and message bodies are never selected.
        lastError: row.lastError?.slice(0, 512) ?? null,
      }));
    }),

  /** Returns immutable replay audit metadata for one event, without payload data. */
  replayHistory: seniorAdvisorProcedure
    .input(z.object({ eventId: z.number().int().positive(), limit: z.number().int().min(1).max(100).default(50) }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db
        .select({
          id: auditLogs.id,
          actorType: auditLogs.actorType,
          actorId: auditLogs.actorId,
          action: auditLogs.action,
          before: auditLogs.before,
          after: auditLogs.after,
          metadata: auditLogs.metadata,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.resourceType, WHATSAPP_AUDIT_RESOURCE),
            eq(auditLogs.resourceId, input.eventId),
          ),
        )
        .orderBy(desc(auditLogs.createdAt))
        .limit(input.limit);
    }),

  /**
   * Requeues one reviewed dead-letter record for a fresh bounded retry budget.
   *
   * This never creates a provider event, mutates its payload/hash, or changes the
   * already-published inbound outbox record. An atomic status predicate allows at
   * most one administrator to replay a specific terminal event.
   */
  replayDeadLetter: adminProcedure
    .input(
      z.object({
        eventId: z.number().int().positive(),
        reason: z.string().trim().min(12).max(500),
        acknowledgePayloadUnchanged: z.literal(true),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const now = new Date();

      const replayed = await db.transaction(async (tx) => {
        const [event] = await tx
          .update(whatsappWebhookEvents)
          .set({
            status: "failed",
            attempts: 0,
            nextAttemptAt: now,
            lastError: null,
            claimToken: null,
            claimExpiresAt: null,
            updatedAt: now,
          })
          .where(
            and(
              eq(whatsappWebhookEvents.id, input.eventId),
              eq(whatsappWebhookEvents.status, DEAD_LETTER_STATUS),
            ),
          )
          .returning({
            id: whatsappWebhookEvents.id,
            provider: whatsappWebhookEvents.provider,
            providerEventId: whatsappWebhookEvents.providerEventId,
            payloadSha256: whatsappWebhookEvents.payloadSha256,
            previousAttempts: whatsappWebhookEvents.attempts,
            outboxEventId: whatsappWebhookEvents.outboxEventId,
          });

        if (!event) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "WhatsApp event is not available for manual replay.",
          });
        }

        await tx.insert(auditLogs).values({
          actorType: "user",
          actorId: ctx.user.id,
          action: "update",
          resourceType: WHATSAPP_AUDIT_RESOURCE,
          resourceId: event.id,
          before: {
            status: DEAD_LETTER_STATUS,
            attempts: event.previousAttempts,
            payloadSha256: event.payloadSha256,
          },
          after: {
            status: "failed",
            attempts: 0,
            nextAttemptAt: now.toISOString(),
          },
          metadata: {
            operation: "manual_replay",
            reason: input.reason,
            provider: event.provider,
            providerEventId: event.providerEventId,
            sourceOutboxEventId: event.outboxEventId,
            payloadUnchangedAcknowledged: true,
          },
        });

        return event;
      });

      return {
        eventId: replayed.id,
        status: "failed" as const,
        attempts: 0,
        nextAttemptAt: now,
      };
    }),
});
