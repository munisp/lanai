import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";

const CHATWOOT_API_BASE = process.env.CHATWOOT_URL || "http://localhost:3000";
const CHATWOOT_TOKEN = process.env.CHATWOOT_ACCESS_TOKEN || "";
const CHATWOOT_ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID || "1";

async function chatwootFetch(endpoint: string, options: RequestInit = {}) {
  if (!CHATWOOT_TOKEN) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Chatwoot not configured",
    });
  }

  const url = `${CHATWOOT_API_BASE}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/${endpoint.startsWith("/") ? endpoint.slice(1) : endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CHATWOOT_TOKEN}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message: `Chatwoot API error: ${response.status} - ${errorText}`,
    });
  }

  return response.json();
}

export const chatwootRouter = router({
  // ── Conversations ────────────────────────────────────────────────────────

  /** List conversations with optional filtering */
  listConversations: protectedProcedure
    .input(
      z.object({
        status: z.enum(["open", "closed", "archived"]).optional().default("open"),
        limit: z.number().min(1).max(100).optional().default(50),
        offset: z.number().min(0).optional().default(0),
        inboxId: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      const params = new URLSearchParams({
        status: input.status,
        limit: String(input.limit),
        offset: String(input.offset),
      });

      if (input.inboxId) {
        params.set("inbox_id", String(input.inboxId));
      }

      const data = await chatwootFetch(`conversations?${params}`);
      
      const conversations = data.payload?.map((conv: any) => ({
        id: conv.id,
        identifier: conv.identifier,
        status: conv.status,
        priority: conv.priority,
        labels: conv.labels || [],
        contact: {
          id: conv.contact?.id,
          name: conv.contact?.name,
          phone: conv.contact?.phone_number,
          email: conv.contact?.email,
        },
        lastMessage: conv.last_activity_message?.content || "",
        lastMessageAt: conv.last_activity_message?.created_at,
        inbox: conv.inbox?.name || "General",
        createdAt: conv.created_at,
        updatedAt: conv.updated_at,
      })) || [];

      return {
        conversations,
        total: data.meta?.total_count || conversations.length,
      };
    }),

  /** Get a single conversation with all messages */
  getConversation: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .query(async ({ input }) => {
      const [convData, messagesData] = await Promise.all([
        chatwootFetch(`conversations/${input.conversationId}`),
        chatwootFetch(`conversations/${input.conversationId}/messages?limit=100`),
      ]);

      return {
        conversation: {
          id: convData.id,
          status: convData.status,
          priority: convData.priority,
          labels: convData.labels || [],
          contact: {
            id: convData.contact?.id,
            name: convData.contact?.name,
            phone: convData.contact?.phone_number,
            email: convData.contact?.email,
          },
          inbox: convData.inbox?.name || "General",
        },
        messages: (messagesData.payload || []).map((msg: any) => ({
          id: msg.id,
          content: msg.content,
          message_type: msg.message_type,
          created_at: msg.created_at,
          sender_name: msg.sender?.name || (msg.incoming ? "Contact" : "Advisor"),
          attachments: msg.attachments || [],
        })),
      };
    }),

  // ── Messages ─────────────────────────────────────────────────────────────

  /** Send a message in a conversation */
  sendMessage: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        content: z.string().min(1),
        message_type: z.enum(["outgoing", "incoming"]).default("outgoing"),
        attachments: z.any().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const data = await chatwootFetch(
        `conversations/${input.conversationId}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            content: input.content,
            message_type: input.message_type === "outgoing" ? 3 : 1, // 3 = outgoing, 1 = incoming
            incoming: input.message_type === "incoming",
            ...(input.attachments && { attachments: input.attachments }),
          }),
        }
      );

      return { success: true, messageId: data.id };
    }),

  /** Generate AI draft reply for a message */
  generateDraftReply: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        message: z.string().min(1),
        clientName: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      // Call the AI bridge microservice
      const aiBridgeUrl =
        process.env.CHATWOOT_AI_BRIDGE_URL || "http://localhost:5560";

      const response = await fetch(
        `${aiBridgeUrl}/api/ai-draft-reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: input.message,
            client_name: input.clientName || "Client",
          }),
        }
      );

      if (!response.ok) {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: "AI bridge service unavailable",
        });
      }

      const result = await response.json();

      return {
        draft_reply: result.draft_reply || "",
        suggested_action: result.suggested_action || "",
        intent: result.intent || "",
        urgency: result.urgency || "",
        sentiment: result.sentiment || "NEUTRAL",
      };
    }),

  // ── Contacts ─────────────────────────────────────────────────────────────

  /** List contacts from Chatwoot */
  listContacts: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).optional().default(50),
        offset: z.number().min(0).optional().default(0),
      })
    )
    .query(async ({ input }) => {
      const params = new URLSearchParams({
        limit: String(input.limit),
        offset: String(input.offset),
      });

      const data = await chatwootFetch(`contacts?${params}`);

      const contacts = (data.payload || []).map((contact: any) => ({
        id: contact.id,
        name: contact.name || "",
        phone: contact.phone_number || "",
        email: contact.email || "",
        identifier: contact.identifier || "",
        lastActivityAt: contact.last_activity_at,
        customAttributes: contact.custom_attributes || {},
      }));

      return {
        contacts,
        total: data.meta?.total_count || contacts.length,
      };
    }),

  /** Search contacts by email or phone */
  searchContacts: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1),
      })
    )
    .query(async ({ input }) => {
      const params = new URLSearchParams({
        search: input.query,
        limit: "20",
      });

      const data = await chatwootFetch(`contacts?${params}`);

      const contacts = (data.payload || []).map((contact: any) => ({
        id: contact.id,
        name: contact.name || "",
        phone: contact.phone_number || "",
        email: contact.email || "",
        identifier: contact.identifier || "",
      }));

      return { contacts };
    }),

  // ── Analytics ────────────────────────────────────────────────────────────

  /** Get Chatwoot conversation statistics */
  getStats: protectedProcedure.query(async () => {
    const [openConvs, closedConvs] = await Promise.all([
      chatwootFetch("conversations?status=open&limit=1"),
      chatwootFetch("conversations?status=closed&limit=1"),
    ]);

    return {
      openCount: openConvs.meta?.total_count || 0,
      closedCount: closedConvs.meta?.total_count || 0,
      totalConversations:
        (openConvs.meta?.total_count || 0) +
        (closedConvs.meta?.total_count || 0),
    };
  }),
});
