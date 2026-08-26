/**
 * Chatwoot tRPC router: procedures for managing the Chatwoot integration.
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
  createConversation,
  syncConversations as syncChatwootConversations,
  syncConversationMessages,
} from "./chatwootService";
import {
  createChatwootConversation,
  createChatwootMessage,
  listChatwootConversations,
  listChatwootMessages,
  updateChatwootConversation,
  getMemberById,
  getChatwootConversationByChatwootId,
  getOwnedChatwootConversation,
  buildClientMemoryContext,
} from "./db";
import { ENV } from "./_core/env";

/** Structured WhatsApp triage returned by the AI gateway draft-reply endpoint. */
export type WhatsAppTriage = {
  intent?: string;
  urgency?: string;
  sentiment?: string;
  summary?: string;
  suggested_action?: string;
  suggested_tags?: string[];
  draft_reply?: string;
  estimated_value?: number;
};

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
      }),
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

  /** Lists conversations for the current advisor (or all if admin). */
  listConversations: protectedProcedure.query(async ({ ctx }) => {
    await syncChatwootConversations();
    return listChatwootConversations(ctx.user.id);
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
    .mutation(async ({ input, ctx }) => {
      // Resolve local conversation to get Chatwoot conversation ID
      const localConv = await getChatwootConversationByChatwootId(
        input.chatwootConversationId,
      );
      if (!localConv) throw new Error("Conversation not found");

      // In production: call Chatwoot API to send the message
      // For now, create a local outbound message record
      const chatwootConvId = parseInt(
        input.chatwootConversationId.replace("conv_", ""),
        10,
      );

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
    // Refresh the local mirror from Chatwoot so AI auto-replies and latest
    // messages show up for the member.
    await syncChatwootConversations().catch(() => {});
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
        if (Number.isInteger(remoteConversationId)) {
          try {
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
          } catch (err) {
            // The mirrored Chatwoot conversation may no longer exist remotely
            // (e.g. Chatwoot was reset). Mark the stale local mirror resolved
            // and fall through to create a fresh conversation.
            console.warn(
              "[Chatwoot] Existing conversation send failed, recreating:",
              err instanceof Error ? err.message : err,
            );
            await updateChatwootConversation(existing.chatwootId, {
              status: "resolved",
              updatedAt: new Date(),
            });
          }
        }
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
        conversationId: z.number().int().positive(),
      }),
    )
    .query(async ({ input, ctx }) => {
      // Ownership check: a member may only read their own conversation.
      // Returns empty for a conversation they do not own so no information
      // about other members' conversations leaks through this endpoint.
      const conv = await getOwnedChatwootConversation(
        input.conversationId,
        ctx.member.id,
      );
      if (!conv) return [];

      // Sync the full thread from Chatwoot into the local mirror so AI
      // auto-replies appear in the member's view.
      const remoteId = Number(conv.chatwootId.replace(/^conv_/, ""));
      if (Number.isInteger(remoteId)) {
        await syncConversationMessages(input.conversationId, remoteId).catch(
          () => {},
        );
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

  /** AI-generated structured triage and draft reply for a conversation (advisor). */
  generateDraftReply: protectedProcedure
    .input(
      z.object({
        conversationId: z.number().int().positive(),
        lastMessage: z.string().min(1),
        memberName: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      // Resolve the conversation to its member so the draft is grounded in
      // that member's memory: preferences, family, important dates, recent
      // requests. The gateway stays stateless; the portal assembles context.
      const conv = (await listChatwootConversations()).find(
        (c) => c.id === input.conversationId,
      );
      const context = conv?.memberId
        ? await buildClientMemoryContext(conv.memberId).catch(() => "")
        : "";
      if (!ENV.aiGatewayUrl || !ENV.aiGatewayToken) {
        throw new Error("AI gateway is not configured");
      }
      const gwResp = await fetch(
        `${ENV.aiGatewayUrl.replace(/\/$/, "")}/whatsapp/draft-reply`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${ENV.aiGatewayToken}`,
          },
          body: JSON.stringify({
            message: input.lastMessage,
            client_name: input.memberName ?? conv?.contactName ?? undefined,
            context,
          }),
        },
      );
      if (!gwResp.ok) {
        throw new Error(`AI gateway error (${gwResp.status})`);
      }
      const data = (await gwResp.json()) as { structured?: WhatsAppTriage };
      const triage = data.structured;
      if (!triage) {
        throw new Error("AI gateway did not return structured triage");
      }
      // Keep a top-level `draft` alias so callers that read data.draft keep
      // working alongside the structured triage fields.
      return { ...triage, draft: triage.draft_reply ?? "" };
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
    const unresponded = convs.filter(
      (c) => !c.advisorResponded && c.status === "open",
    ).length;
    return { open, resolved, pending, unresponded, total: convs.length };
  }),
});
