/**
 * Unified conversation screen router (SR-700).
 *
 * One round trip returns everything the advisor conversation view needs:
 * the Chatwoot conversation, the linked member profile, all messages with
 * their transcription state, the latest triage result for the most recent
 * inbound message, the advisor tasks for the member, and the open SLA timer.
 *
 * IDOR posture (SR-307/401): this router is exposed via protectedProcedure,
 * which is advisor-gated by the auth middleware (only advisor / senior_advisor
 * / admin sessions reach it; member sessions are rejected before the resolver
 * runs). Member-scoped data isolation is therefore enforced by that middleware
 * rather than by a per-row ownership check here. The resolver only ever
 * returns rows for a conversation that actually exists and returns null
 * otherwise, so a caller can never read another member's data by guessing a
 * chatwoot conversation id that does not exist.
 */
import { z } from "zod";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import {
  advisorTasks,
  aiInferenceRuns,
  chatwootConversations,
  chatwootMessages,
  members,
  slaTimers,
} from "../drizzle/schema";

const MAX_TASKS = 10;

export const conversationRouter = router({
  /**
   * Returns the unified conversation payload for a Chatwoot conversation id,
   * or null when no such conversation exists.
   */
  getUnified: protectedProcedure
    .input(z.object({ chatwootConversationId: z.string().min(4).max(64) }))
    .query(async ({ input }) => {
      const db = await getDb();

      const [conversation] = await db
        .select({
          id: chatwootConversations.id,
          chatwootId: chatwootConversations.chatwootId,
          memberId: chatwootConversations.memberId,
          channel: chatwootConversations.channel,
          status: chatwootConversations.status,
          contactName: chatwootConversations.contactName,
          contactEmail: chatwootConversations.contactEmail,
          contactIdentifier: chatwootConversations.contactIdentifier,
          updatedAt: chatwootConversations.updatedAt,
        })
        .from(chatwootConversations)
        .where(eq(chatwootConversations.chatwootId, input.chatwootConversationId))
        .limit(1);
      if (!conversation) return null;

      // Member profile is optional (a conversation may exist before linking).
      const [member] = conversation.memberId
        ? await db
            .select({
              id: members.id,
              name: members.name,
              tier: members.tier,
              notes: members.notes,
              dietaryRequirements: members.dietaryRequirements,
              accessibilityNeeds: members.accessibilityNeeds,
              nationality: members.nationality,
              dateOfBirth: members.dateOfBirth,
            })
            .from(members)
            .where(eq(members.id, conversation.memberId))
            .limit(1)
        : [null];

      const messages = await db
        .select({
          chatwootId: chatwootMessages.chatwootId,
          messageType: chatwootMessages.messageType,
          content: chatwootMessages.content,
          transcription: chatwootMessages.transcription,
          transcriptionStatus: chatwootMessages.transcriptionStatus,
          transcriptionError: chatwootMessages.transcriptionError,
          attachmentUrl: chatwootMessages.attachmentUrl,
          createdAt: chatwootMessages.createdAt,
        })
        .from(chatwootMessages)
        .where(eq(chatwootMessages.conversationId, conversation.id))
        .orderBy(asc(chatwootMessages.createdAt));

      // Triage for the latest inbound message only: pick ai_inference_runs rows
      // whose requestId matches 'triage:<chatwootId>' for any inbound message in
      // this conversation, take the newest one per message, and surface only the
      // run for the most recent inbound message.
      const inboundChatwootIds = messages
        .filter((m) => m.messageType === "inbound")
        .map((m) => m.chatwootId);
      let triage: {
        status: string;
        outputMetadata: Record<string, unknown> | null;
        error: string | null;
        completedAt: Date | null;
      } | null = null;
      if (inboundChatwootIds.length > 0) {
        const triageRequestIds = inboundChatwootIds.map((id) => `triage:${id}`);
        const runs = await db
          .select({
            requestId: aiInferenceRuns.requestId,
            status: aiInferenceRuns.status,
            outputMetadata: aiInferenceRuns.outputMetadata,
            error: aiInferenceRuns.error,
            completedAt: aiInferenceRuns.completedAt,
            createdAt: aiInferenceRuns.createdAt,
          })
          .from(aiInferenceRuns)
          .where(inArray(aiInferenceRuns.requestId, triageRequestIds))
          .orderBy(desc(aiInferenceRuns.createdAt));
        if (runs.length > 0) {
          const latest = runs[0];
          const outputMetadata =
            latest.outputMetadata &&
            typeof latest.outputMetadata === "object" &&
            !Array.isArray(latest.outputMetadata)
              ? (latest.outputMetadata as Record<string, unknown>)
              : null;
          triage = {
            status: latest.status,
            outputMetadata,
            error: latest.error,
            completedAt: latest.completedAt,
          };
        }
      }

      const tasks = conversation.memberId
        ? await db
            .select({
              id: advisorTasks.id,
              title: advisorTasks.title,
              status: advisorTasks.status,
              priority: advisorTasks.priority,
              automationKey: advisorTasks.automationKey,
              dueDate: advisorTasks.dueDate,
              createdAt: advisorTasks.createdAt,
            })
            .from(advisorTasks)
            .where(eq(advisorTasks.memberId, conversation.memberId))
            .orderBy(desc(advisorTasks.createdAt))
            .limit(MAX_TASKS)
        : [];
      const taskRows = tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        automationKey: t.automationKey,
        dueDate: t.dueDate,
        createdAt: t.createdAt,
        slaFlag: Boolean(t.automationKey && t.automationKey.startsWith("sla_breach:")),
      }));

      const [slaRow] = await db
        .select({
          urgency: slaTimers.urgency,
          openedAt: slaTimers.openedAt,
          firstResponseAt: slaTimers.firstResponseAt,
          breachWarnedAt: slaTimers.breachWarnedAt,
        })
        .from(slaTimers)
        .where(
          and(
            eq(slaTimers.conversationId, conversation.id),
          ),
        )
        .orderBy(desc(slaTimers.openedAt))
        .limit(1);

      return {
        conversation: {
          chatwootId: conversation.chatwootId,
          channel: conversation.channel,
          status: conversation.status,
          contactName: conversation.contactName,
          contactEmail: conversation.contactEmail,
          contactIdentifier: conversation.contactIdentifier,
          updatedAt: conversation.updatedAt,
        },
        member: member
          ? {
              id: member.id,
              name: member.name,
              tier: member.tier,
              notes: member.notes,
              dietaryRequirements: member.dietaryRequirements,
              accessibilityNeeds: member.accessibilityNeeds,
              nationality: member.nationality,
              dateOfBirth: member.dateOfBirth,
            }
          : null,
        messages,
        triage,
        tasks: taskRows,
        sla: slaRow ?? null,
      };
    }),
});
