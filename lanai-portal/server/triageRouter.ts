/**
 * Triage inbox tRPC router (SR-302).
 *
 * Advisor-only views over captured messages and their AI triage. Ordering is
 * exactly the SRS rank order: unread inbound first, then urgent, then SLA
 * risk (wired in P3), then newest. Sending stays human-only; this router
 * never sends anything.
 */
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { adminProcedure, protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import {
  advisorTasks,
  aiInferenceRuns,
  chatwootConversations,
  chatwootMessages,
  members,
} from "../drizzle/schema";
import { triageRequestId, processTriage } from "./triageService";

const MAX_INBOX_CONVERSATIONS = 100;

export const triageRouter = router({
  /**
   * Ranked triage inbox: one entry per Chatwoot conversation with its latest
   * inbound message and latest triage result.
   */
  listInbox: protectedProcedure
    .input(z.object({ limit: z.number().int().positive().max(100).default(50) }))
    .query(async ({ input }) => {
      const db = await getDb();
      const conversations = await db
        .select({
          id: chatwootConversations.id,
          chatwootId: chatwootConversations.chatwootId,
          memberId: chatwootConversations.memberId,
          memberName: members.name,
          memberTier: members.tier,
          contactIdentifier: chatwootConversations.contactIdentifier,
          channel: chatwootConversations.channel,
          status: chatwootConversations.status,
          lastMessage: chatwootConversations.lastMessage,
          advisorResponded: chatwootConversations.advisorResponded,
          updatedAt: chatwootConversations.updatedAt,
        })
        .from(chatwootConversations)
        .leftJoin(members, eq(members.id, chatwootConversations.memberId))
        .orderBy(desc(chatwootConversations.updatedAt))
        .limit(input.limit);

      const conversationIds = conversations.map((c) => c.id);
      if (conversationIds.length === 0) return [];

      const inboundMessages = await db
        .select({
          id: chatwootMessages.id,
          chatwootId: chatwootMessages.chatwootId,
          conversationId: chatwootMessages.conversationId,
          content: chatwootMessages.content,
          transcription: chatwootMessages.transcription,
          transcriptionStatus: chatwootMessages.transcriptionStatus,
          createdAt: chatwootMessages.createdAt,
        })
        .from(chatwootMessages)
        .where(
          and(
            inArray(chatwootMessages.conversationId, conversationIds),
            eq(chatwootMessages.messageType, "inbound"),
          ),
        )
        .orderBy(desc(chatwootMessages.createdAt));
      const latestInboundByConversation = new Map<number, (typeof inboundMessages)[number]>();
      for (const message of inboundMessages) {
        const existing = latestInboundByConversation.get(message.conversationId);
        if (!existing) latestInboundByConversation.set(message.conversationId, message);
      }

      const triagedIds = [...latestInboundByConversation.values()].map((m) =>
        triageRequestId(m.chatwootId),
      );
      const triageRuns = triagedIds.length
        ? await db
            .select({
              requestId: aiInferenceRuns.requestId,
              status: aiInferenceRuns.status,
              outputMetadata: aiInferenceRuns.outputMetadata,
              error: aiInferenceRuns.error,
              completedAt: aiInferenceRuns.completedAt,
            })
            .from(aiInferenceRuns)
            .where(inArray(aiInferenceRuns.requestId, triagedIds))
        : [];
      const triageByMessage = new Map(
        triageRuns.map((run) => [run.requestId.replace(/^triage:/, ""), run]),
      );

      const entries = conversations
        .map((conversation) => {
          const latest = latestInboundByConversation.get(conversation.id) ?? null;
          const triageRun = latest ? triageByMessage.get(latest.chatwootId) ?? null : null;
          const triageMeta =
            triageRun && typeof triageRun.outputMetadata === "object" && triageRun.outputMetadata !== null
              ? ((triageRun.outputMetadata as { triage?: Record<string, unknown> }).triage ?? null)
              : null;
          const unread = Boolean(latest) && !conversation.advisorResponded;
          const urgent = triageMeta?.urgency === "urgent";
          return {
            conversationId: conversation.chatwootId,
            memberName: conversation.memberName,
            memberTier: conversation.memberTier,
            channel: conversation.channel,
            conversationStatus: conversation.status,
            lastMessage: conversation.lastMessage,
            latestInbound: latest
              ? {
                  chatwootId: latest.chatwootId,
                  content: latest.content,
                  transcription: latest.transcription,
                  transcriptionStatus: latest.transcriptionStatus,
                  createdAt: latest.createdAt,
                }
              : null,
            triage: triageMeta,
            triageRunStatus: triageRun?.status ?? "none",
            triageError: triageRun?.error ?? null,
            unread,
            urgent,
            // P3 wires the SLA timer into this field; harmless as null now.
            slaRisk: false as boolean,
            updatedAt: conversation.updatedAt,
            sortRank:
              (unread ? 8 : 0) + (urgent ? 4 : 0) + (triageRun?.status === "failed" ? 2 : 0),
          };
        })
        .sort((a, b) => {
          if (a.sortRank !== b.sortRank) return b.sortRank - a.sortRank;
          return (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0);
        });

      return entries;
    }),

  /** Full triage detail for one message: message, triage, member facts. */
  getByMessageId: protectedProcedure
    .input(z.object({ chatwootMessageId: z.string().min(4).max(64) }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [row] = await db
        .select({
          message: chatwootMessages,
          conversation: chatwootConversations,
          memberName: members.name,
          memberTier: members.tier,
          memberNotes: members.notes,
          memberDietaryRequirements: members.dietaryRequirements,
          memberAccessibilityNeeds: members.accessibilityNeeds,
        })
        .from(chatwootMessages)
        .innerJoin(chatwootConversations, eq(chatwootConversations.id, chatwootMessages.conversationId))
        .leftJoin(members, eq(members.id, chatwootConversations.memberId))
        .where(eq(chatwootMessages.chatwootId, input.chatwootMessageId))
        .limit(1);
      if (!row) return null;

      const [run] = await db
        .select({
          status: aiInferenceRuns.status,
          outputMetadata: aiInferenceRuns.outputMetadata,
          error: aiInferenceRuns.error,
        })
        .from(aiInferenceRuns)
        .where(eq(aiInferenceRuns.requestId, triageRequestId(input.chatwootMessageId)))
        .limit(1);
      const triage =
        run && typeof run.outputMetadata === "object" && run.outputMetadata !== null
          ? ((run.outputMetadata as { triage?: Record<string, unknown> }).triage ?? null)
          : null;

      return {
        message: row.message,
        conversation: {
          chatwootId: row.conversation.chatwootId,
          memberName: row.memberName,
          memberTier: row.memberTier,
          channel: row.conversation.channel,
          status: row.conversation.status,
        },
        memberFacts: {
          notes: row.memberNotes,
          dietaryRequirements: row.memberDietaryRequirements,
          accessibilityNeeds: row.memberAccessibilityNeeds,
        },
        triage,
        triageRunStatus: run?.status ?? "none",
        triageError: run?.error ?? null,
      };
    }),

  /**
   * Regenerate triage for one message: clears the previous run row (and any
   * failed-triage task) and re-runs the pipeline. Never sends anything.
   */
  regenerate: adminProcedure
    .input(z.object({ chatwootMessageId: z.string().min(4).max(64) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [message] = await db
        .select({ chatwootId: chatwootMessages.chatwootId })
        .from(chatwootMessages)
        .where(eq(chatwootMessages.chatwootId, input.chatwootMessageId))
        .limit(1);
      if (!message) {
        throw new Error("Message not found");
      }
      await db
        .delete(aiInferenceRuns)
        .where(eq(aiInferenceRuns.requestId, triageRequestId(input.chatwootMessageId)));
      await db
        .delete(advisorTasks)
        .where(eq(advisorTasks.automationKey, `triage_failed:${input.chatwootMessageId}`));
      const numericId = Number(input.chatwootMessageId.replace(/^msg_/, ""));
      if (!Number.isInteger(numericId) || numericId <= 0) {
        throw new Error("Message id is not a Chatwoot id");
      }
      await processTriage({
        id: numericId,
        event: "message_created",
        message_type: 0,
      });
      return { regenerated: true };
    }),
});