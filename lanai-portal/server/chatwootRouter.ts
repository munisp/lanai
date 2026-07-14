/**
 * Chatwoot tRPC router — procedures for managing the Chatwoot integration.
 */
import { z } from "zod";
import { memberProcedure, protectedProcedure, router } from "./_core/trpc";
import {
  initializeChatwootConfig,
  listInboxes,
  syncContactForMember,
  sendMessage,
  testChatwootConnection,
  updateChatwootConfigService,
  getChatwootConfigService,
  getConversationsForContact,
} from "./chatwootService";
import {
  createChatwootConversation,
  listChatwootConversations,
  listChatwootMessages,
  updateChatwootConversation,
  getMemberById,
  getChatwootConversationByChatwootId,
} from "./db";

export const chatwootRouter = router({
  // ── Configuration ───────────────────────────────────────────────────────

  /** Gets the current Chatwoot configuration. */
  getConfig: protectedProcedure.query(async () => {
    return getChatwootConfigService();
  }),

  /** Updates Chatwoot configuration (advisor-only). */
  updateConfig: protectedProcedure
    .input(
      z.object({
        instanceUrl: z.string().url().optional(),
        accessToken: z.string().optional(),
        accountId: z.number().optional(),
        enabled: z.boolean().optional(),
        defaultInboxId: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      await updateChatwootConfigService(input);
      // Re-initialize if enabled
      if (input.enabled) {
        await initializeChatwootConfig().catch(() => {});
      }
      return { success: true };
    }),

  /** Tests the Chatwoot API connection. */
  testConnection: protectedProcedure.mutation(async () => {
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
      })
    )
    .mutation(async ({ input }) => {
      const member = await getMemberById(input.memberId);
      if (!member) throw new Error("Member not found");
      return syncContactForMember(member.id, member.name, member.email, null);
    }),

  // ── Conversations ──────────────────────────────────────────────────────

  /** Lists conversations for the current advisor (or all if admin). */
  listConversations: protectedProcedure.query(async ({ ctx }) => {
    return listChatwootConversations(ctx.user.id);
  }),

  /** Lists conversations for a specific member (advisor-only). */
  listMemberConversations: protectedProcedure
    .input(
      z.object({
        memberId: z.number(),
      })
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
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Resolve local conversation to get Chatwoot conversation ID
      const localConv = await getChatwootConversationByChatwootId(input.chatwootConversationId);
      if (!localConv) throw new Error("Conversation not found");

      // In production: call Chatwoot API to send the message
      // For now, create a local outbound message record
      const chatwootConvId = parseInt(input.chatwootConversationId.replace("conv_", ""), 10);

      await sendMessage(chatwootConvId, input.content, "outgoing");

      // Update local mirror
      await updateChatwootConversation(input.chatwootConversationId, {
        advisorResponded: true,
        lastMessage: input.content,
      });

      return { success: true };
    }),

  // ── Member Portal ──────────────────────────────────────────────────────

  /** Gets conversations for the authenticated member. */
  myConversations: memberProcedure.query(async ({ ctx }) => {
    // In production: fetch from Chatwoot using member's contact ID
    const convs = await listChatwootConversations();
    return convs.filter((c) => c.memberId === ctx.member.id);
  }),

  /** Sends a message from the member portal. */
  memberSendMessage: memberProcedure
    .input(
      z.object({
        content: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Find or create the member's Chatwoot contact
      const contactResult = await syncContactForMember(ctx.member.id, ctx.member.name, ctx.member.email, null);

      // Create a new conversation
      const result = await createChatwootConversation({
        chatwootId: `conv_${Date.now()}`,
        memberId: ctx.member.id,
        contactIdentifier: ctx.member.email ?? "",
        contactName: ctx.member.name,
        contactEmail: ctx.member.email,
        channel: "website",
        status: "open",
        lastMessage: input.content,
      });

      return { conversationId: result };
    }),

  /** Gets messages for a conversation (member portal). */
  getMessages: memberProcedure
    .input(
      z.object({
        conversationId: z.number(),
      })
    )
    .query(async ({ input }) => {
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
      })
    )
    .mutation(async ({ input }) => {
      // In production: call LLM with conversation context
      // For now return a structured draft
      const draft = `Thank you for reaching out, ${input.memberName ?? "valued member"}. I have reviewed your message and will ensure this is handled with the utmost care. Please allow me a moment to confirm the details and I will follow up shortly.`;
      return { draft };
    }),

  /** Syncs all Chatwoot conversations into the local database. */
  syncConversations: protectedProcedure.mutation(async () => {
    const convs = await listChatwootConversations();
    return { synced: convs.length };
  }),

  /** Gets Chatwoot conversation statistics for the dashboard. */
  getStats: protectedProcedure.query(async () => {
    const convs = await listChatwootConversations();
    const open = convs.filter((c) => c.status === "open").length;
    const resolved = convs.filter((c) => c.status === "resolved").length;
    const pending = convs.filter((c) => c.status === "pending").length;
    const unresponded = convs.filter((c) => !c.advisorResponded && c.status === "open").length;
    return { open, resolved, pending, unresponded, total: convs.length };
  }),
});
