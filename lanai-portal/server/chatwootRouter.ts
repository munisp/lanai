/**
 * Chatwoot tRPC router — procedures for managing the Chatwoot integration.
 */
import { z } from "zod";
import { adminProcedure, memberProcedure, protectedProcedure, router } from "./_core/trpc";
import { invokeLocalAi } from "./_core/localAi";
import {
  listInboxes,
  syncContactForMember,
  sendMessage,
  testChatwootConnection,
  updateChatwootConfigService,
  getChatwootConfigService,
  getConversationsForContact,
  createConversation,
  syncConversations as syncChatwootConversations,
} from "./chatwootService";
import {
  createChatwootConversation,
  createChatwootMessage,
  listChatwootConversations,
  listChatwootMessages,
  updateChatwootConversation,
  getMemberById,
  getChatwootConversationByChatwootId,
} from "./db";

function toPublicChatwootConfig(
  config: Awaited<ReturnType<typeof getChatwootConfigService>>,
) {
  if (!config) return null;
  return {
    id: config.id,
    instanceUrl: config.instanceUrl,
    accountId: config.accountId,
    enabled: config.enabled,
    defaultInboxId: config.defaultInboxId,
    hasAccessToken: Boolean(config.accessToken),
  };
}

export const chatwootRouter = router({
  // ── Configuration ───────────────────────────────────────────────────────

  /** Gets the current Chatwoot configuration. */
  getConfig: protectedProcedure.query(async () => {
    return toPublicChatwootConfig(await getChatwootConfigService());
  }),

  /** Updates Chatwoot configuration (administrator-only). */
  updateConfig: adminProcedure
    .input(
      z.object({
        instanceUrl: z.string().url().optional(),
        accessToken: z.string().optional(),
        accountId: z.number().optional(),
        enabled: z.boolean().optional(),
        defaultInboxId: z.number().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const config = await updateChatwootConfigService(input);
      if (!config) throw new Error("Chatwoot configuration was not persisted");

      // A configuration update is only reported as successful after an enabled
      // integration acknowledges a real API request.
      if (config.enabled) {
        const check = await testChatwootConnection();
        if (!check.success) throw new Error(check.message);
      }

      return {
        success: true,
        config: toPublicChatwootConfig(config),
      };
    }),

  /** Tests the Chatwoot API connection (administrator-only). */
  testConnection: adminProcedure.mutation(async () => {
    return testChatwootConnection();
  }),

  // ── Inbox Management ───────────────────────────────────────────────────

  /** Lists all Chatwoot inboxes (advisor-only). */
  listInboxes: protectedProcedure.query(async () => {
    return listInboxes();
  }),

  // ── Contact Sync ───────────────────────────────────────────────────────

  /** Syncs a member's contact to Chatwoot (advisor-only). */
  syncMember: protectedProcedure
    .input(
      z.object({
        memberId: z.number(),
      }),
    )
    .mutation(async ({ input }) => {
      const member = await getMemberById(input.memberId);
      if (!member) throw new Error("Member not found");
      return syncContactForMember(
        member.id,
        member.name,
        member.email,
        null,
        member.tier,
      );
    }),

  // ── Conversations ──────────────────────────────────────────────────────

  /** Lists the durable communication mirror for an authorized advisor. */
  listConversations: protectedProcedure.query(async () => {
    await syncChatwootConversations();
    // Chatwoot remote assignment is not yet mirrored into advisorUserId. Filtering
    // by the local field would silently hide every unassigned conversation, so the
    // authorized CRM workspace receives the complete synchronized inbox.
    return listChatwootConversations();
  }),

  /** Lists conversations for a specific member (advisor-only). */
  listMemberConversations: protectedProcedure
    .input(
      z.object({
        memberId: z.number(),
      }),
    )
    .query(async ({ input }) => {
      // Get all conversations and filter by memberId
      const all = await listChatwootConversations();
      return all.filter((c) => c.memberId === input.memberId);
    }),

  // ── Messaging ──────────────────────────────────────────────────────────

  /** Sends a message on a Chatwoot conversation (advisor-only). */
  sendMessage: protectedProcedure
    .input(
      z.object({
        chatwootConversationId: z.string(),
        content: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const localConv = await getChatwootConversationByChatwootId(
        input.chatwootConversationId,
      );
      if (!localConv) throw new Error("Conversation not found");

      const chatwootConvId = Number.parseInt(
        input.chatwootConversationId.replace(/^conv_/, ""),
        10,
      );
      if (!Number.isInteger(chatwootConvId) || chatwootConvId <= 0) {
        throw new Error("Persisted Chatwoot conversation identifier is invalid");
      }

      const remote = await sendMessage(chatwootConvId, input.content, "outgoing");
      const localMessageId = await createChatwootMessage({
        chatwootId: `msg_${remote.messageId}`,
        conversationId: localConv.id,
        messageType: "outbound",
        content: input.content,
        attachmentUrl: null,
        isTemplate: false,
      });
      const updated = await updateChatwootConversation(
        input.chatwootConversationId,
        {
          advisorResponded: true,
          lastMessage: input.content,
          updatedAt: new Date(),
        },
      );
      if (!updated) {
        throw new Error("Chatwoot local conversation mirror was not updated");
      }

      return { success: true, messageId: remote.messageId, localMessageId };
    }),

  // ── Member Portal ──────────────────────────────────────────────────────

  /** Gets the authenticated member's current Chatwoot conversations. */
  myConversations: memberProcedure.query(async ({ ctx }) => {
    await syncChatwootConversations();
    const convs = await listChatwootConversations();
    return convs.filter((c) => c.memberId === ctx.member.id);
  }),

  /** Sends a message from the member portal. */
  memberSendMessage: memberProcedure
    .input(
      z.object({
        content: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const existing = (await listChatwootConversations()).find(
        (conversation) =>
          conversation.memberId === ctx.member.id &&
          conversation.status === "open",
      );
      if (existing) {
        const remoteConversationId = Number(
          existing.chatwootId.replace(/^conv_/, ""),
        );
        if (!Number.isInteger(remoteConversationId))
          throw new Error(
            "Persisted Chatwoot conversation identifier is invalid",
          );
        const remote = await sendMessage(
          remoteConversationId,
          input.content,
          "incoming",
        );
        await createChatwootMessage({
          chatwootId: `msg_${remote.messageId}`,
          conversationId: existing.id,
          messageType: "inbound",
          content: input.content,
          attachmentUrl: null,
          isTemplate: false,
        });
        await updateChatwootConversation(existing.chatwootId, {
          lastMessage: input.content,
          updatedAt: new Date(),
        });
        return {
          conversationId: existing.id,
          chatwootConversationId: existing.chatwootId,
        };
      }

      const contact = await syncContactForMember(
        ctx.member.id,
        ctx.member.name,
        ctx.member.email,
        null,
        ctx.member.tier,
      );
      const config = await getChatwootConfigService();
      if (!config?.defaultInboxId)
        throw new Error("Chatwoot default inbox is not configured");
      const remote = await createConversation(
        contact.contactId,
        config.defaultInboxId,
        input.content,
        "incoming",
      );
      const localId = await createChatwootConversation({
        chatwootId: `conv_${remote.conversationId}`,
        memberId: ctx.member.id,
        contactIdentifier: ctx.member.email ?? "",
        contactName: ctx.member.name,
        contactEmail: ctx.member.email,
        channel: "website",
        status: "open",
        lastMessage: input.content,
      });
      await createChatwootMessage({
        chatwootId: `msg_${remote.messageId}`,
        conversationId: localId,
        messageType: "inbound",
        content: input.content,
        attachmentUrl: null,
        isTemplate: false,
      });
      return {
        conversationId: localId,
        chatwootConversationId: `conv_${remote.conversationId}`,
      };
    }),

  /** Gets messages for a conversation (member portal). */
  getMessages: memberProcedure
    .input(
      z.object({
        conversationId: z.number(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const conversations = await listChatwootConversations();
      const conversation = conversations.find(
        (item) => item.id === input.conversationId,
      );
      if (!conversation || conversation.memberId !== ctx.member.id) {
        throw new Error("Conversation was not found for the authenticated member");
      }
      return listChatwootMessages(input.conversationId);
    }),

  /** Gets a single conversation by chatwoot ID (advisor). */
  getConversation: protectedProcedure
    .input(z.object({ chatwootId: z.string() }))
    .query(async ({ input }) => {
      const convs = await listChatwootConversations();
      const conv = convs.find((c) => c.chatwootId === input.chatwootId);
      if (!conv) return null;
      const messages = await listChatwootMessages(conv.id);
      return { ...conv, messages };
    }),

  /** AI-generated draft reply for a conversation (advisor). */
  generateDraftReply: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        lastMessage: z.string(),
        memberName: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const conversations = await listChatwootConversations();
      const conversation = conversations.find(
        (item) => item.id === input.conversationId,
      );
      if (!conversation) throw new Error("Conversation not found");
      const messages = await listChatwootMessages(conversation.id);
      const transcript = messages
        .slice(-12)
        .map((message) => `${message.messageType}: ${message.content}`)
        .join("\n");
      const result = await invokeLocalAi({
        capability: "whatsapp",
        system:
          "You draft concise, high-touch concierge replies. Never promise a booking, availability, price, or action that has not been confirmed. Ask one precise follow-up question when required.",
        prompt: `Member: ${input.memberName ?? conversation.contactName ?? "Member"}\nLatest message: ${input.lastMessage}\nConversation transcript:\n${transcript}\n\nWrite a polished draft reply only.`,
        responseFormat: "text",
        temperature: 0.2,
        maxTokens: 350,
        metadata: { conversationId: conversation.id, memberId: conversation.memberId },
      });
      return { draft: result.output, generated: true };
    }),

  /** Syncs the remote Chatwoot inbox into the local query mirror. */
  syncConversations: protectedProcedure.mutation(async () => {
    const synced = await syncChatwootConversations();
    return { synced };
  }),

  /** Gets Chatwoot conversation statistics for the dashboard. */
  getStats: protectedProcedure.query(async () => {
    const convs = await listChatwootConversations();
    const open = convs.filter((c) => c.status === "open").length;
    const resolved = convs.filter((c) => c.status === "resolved").length;
    const pending = convs.filter((c) => c.status === "pending").length;
    const unresponded = convs.filter(
      (c) => !c.advisorResponded && c.status === "open",
    ).length;
    return { open, resolved, pending, unresponded, total: convs.length };
  }),
});
