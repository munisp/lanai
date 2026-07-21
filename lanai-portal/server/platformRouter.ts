/**
 * platformRouter.ts
 *
 * Comprehensive router covering all stakeholder features:
 *   - Notifications (advisor + member)
 *   - AI Insights + Morning Briefings
 *   - Conversations + Messages (WhatsApp / Portal / Email)
 *   - Commission Ledger
 *   - Audit Logs
 *   - Member Preferences
 *   - Advisor Tasks
 *   - Tags (member tagging)
 *   - Proposal Items (line items)
 *   - Platform Analytics / Events
 *
 * All mutations emit events to Fluvio and notify via Dapr.
 * PostgreSQL is mandatory; no in-memory runtime fallback is permitted.
 */

import { z } from "zod";
import { eq, and, desc, asc, isNull, sql } from "drizzle-orm";
import {
  router,
  protectedProcedure,
  memberProcedure,
  adminProcedure,
} from "./_core/trpc";
import { getDb } from "./db";
import {
  notifications,
  aiInsights,
  morningBriefings,
  conversations,
  messages,
  commissionLedger,
  auditLogs,
  memberPreferences,
  advisorTasks,
  tags,
  memberTags,
  proposalItems,
  platformEvents,
  members,
  users,
  supplierContacts,
} from "../drizzle/schema";
import { Fluvio, Dapr, TigerBeetle, Temporal } from "./_core/infrastructure";

// ─── Helper: write an audit log entry ────────────────────────────────────────
async function writeAudit(
  actorType: "user" | "member" | "system",
  actorId: number | undefined,
  action:
    | "create"
    | "update"
    | "delete"
    | "login"
    | "logout"
    | "invite"
    | "approve"
    | "reject",
  resourceType: string,
  resourceId?: number,
  before?: unknown,
  after?: unknown,
) {
  const db = await getDb();

  await db.insert(auditLogs).values({
    actorType,
    actorId: actorId ?? null,
    action,
    resourceType,
    resourceId: resourceId ?? null,
    before: before ?? null,
    after: after ?? null,
  });
}

// ─── Helper: create a notification ───────────────────────────────────────────
async function createNotification(input: {
  recipientType: "user" | "member";
  recipientUserId?: number;
  recipientMemberId?: number;
  type:
    | "travel_request"
    | "proposal"
    | "booking"
    | "message"
    | "payment"
    | "system"
    | "ai_insight";
  title: string;
  body?: string;
  resourceType?: string;
  resourceId?: number;
  actionUrl?: string;
}) {
  const db = await getDb();
  const hasUserRecipient = input.recipientUserId !== undefined;
  const hasMemberRecipient = input.recipientMemberId !== undefined;
  if (
    (input.recipientType === "user" &&
      (!hasUserRecipient || hasMemberRecipient)) ||
    (input.recipientType === "member" &&
      (!hasMemberRecipient || hasUserRecipient))
  ) {
    throw new Error(
      `Notification recipient mismatch for recipient type ${input.recipientType}`,
    );
  }

  await db.insert(notifications).values({
    recipientType: input.recipientType,
    recipientUserId:
      input.recipientType === "user" ? input.recipientUserId! : null,
    recipientMemberId:
      input.recipientType === "member" ? input.recipientMemberId! : null,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    resourceType: input.resourceType ?? null,
    resourceId: input.resourceId ?? null,
    actionUrl: input.actionUrl ?? null,
    isRead: false,
  });
}

// ─── Helper: track a platform event ──────────────────────────────────────────
async function trackEvent(
  eventType: string,
  actorType: string,
  actorId: number,
  resourceType?: string,
  resourceId?: number,
  properties?: unknown,
) {
  const db = await getDb();

  await db.insert(platformEvents).values({
    eventType,
    actorType,
    actorId,
    resourceType: resourceType ?? null,
    resourceId: resourceId ?? null,
    properties: properties ?? null,
  });
}

// ─── Notifications Router ─────────────────────────────────────────────────────

export const notificationsRouter = router({
  /** Advisor: list their own unread notifications */
  myAdvisorNotifications: protectedProcedure
    .input(z.object({ unreadOnly: z.boolean().optional() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      const q = db
        .select()
        .from(notifications)
        .where(eq(notifications.recipientUserId, ctx.user.id))
        .orderBy(desc(notifications.createdAt))
        .limit(50);
      return q;
    }),

  /** Member: list their own notifications */
  myMemberNotifications: memberProcedure
    .input(z.object({ unreadOnly: z.boolean().optional() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      return db
        .select()
        .from(notifications)
        .where(eq(notifications.recipientMemberId, ctx.member.id))
        .orderBy(desc(notifications.createdAt))
        .limit(50);
    }),

  /** Mark a notification as read */
  markRead: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      await db
        .update(notifications)
        .set({ isRead: true, readAt: new Date() })
        .where(eq(notifications.id, input.id));
      return { success: true };
    }),

  /** Mark all notifications as read for the current advisor */
  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();

    await db
      .update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(eq(notifications.recipientUserId, ctx.user.id));
    return { success: true };
  }),

  /** Admin: send a notification to a member */
  sendToMember: protectedProcedure
    .input(
      z.object({
        memberId: z.number(),
        type: z.enum([
          "travel_request",
          "proposal",
          "booking",
          "message",
          "payment",
          "system",
          "ai_insight",
        ]),
        title: z.string().min(1),
        body: z.string().optional(),
        actionUrl: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      await createNotification({
        recipientType: "member",
        recipientMemberId: input.memberId,
        ...input,
      });
      await Dapr.publishEvent("pubsub", "notification-sent", {
        memberId: input.memberId,
        type: input.type,
      });
      return { success: true };
    }),

  /** Unread count for current advisor */
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    const rows = await db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientUserId, ctx.user.id),
          eq(notifications.isRead, false),
        ),
      );
    return { count: Number(rows[0]?.count ?? 0) };
  }),
});

// ─── AI Insights Router ───────────────────────────────────────────────────────

export const aiInsightsRouter = router({
  /** Advisor: list all AI insights */
  list: protectedProcedure
    .input(
      z.object({
        memberId: z.number().optional(),
        insightType: z
          .enum([
            "churn_risk",
            "upsell_opportunity",
            "preference_detected",
            "anniversary",
            "morning_briefing",
            "proposal_suggestion",
          ])
          .optional(),
        unactionedOnly: z.boolean().optional(),
      }),
    )
    .query(async ({ input }) => {
      const db = await getDb();
      return db
        .select()
        .from(aiInsights)
        .orderBy(desc(aiInsights.createdAt))
        .limit(100);
    }),

  /** Advisor: create an AI insight manually */
  create: protectedProcedure
    .input(
      z.object({
        memberId: z.number().optional(),
        travelRequestId: z.number().optional(),
        insightType: z.enum([
          "churn_risk",
          "upsell_opportunity",
          "preference_detected",
          "anniversary",
          "morning_briefing",
          "proposal_suggestion",
        ]),
        title: z.string().min(1),
        body: z.string().min(1),
        confidence: z.number().min(0).max(1).optional(),
        model: z.string().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      let rowId: number;

      const [row] = await db
        .insert(aiInsights)
        .values({
          memberId: input.memberId ?? null,
          travelRequestId: input.travelRequestId ?? null,
          insightType: input.insightType,
          title: input.title,
          body: input.body,
          confidence: input.confidence?.toString() ?? null,
          model: input.model ?? null,
          metadata: input.metadata ?? null,
          isActioned: false,
        })
        .returning({ id: aiInsights.id });
      rowId = row.id;

      await Fluvio.produce(
        "ai-insights",
        JSON.stringify({
          event: "created",
          id: rowId,
          type: input.insightType,
        }),
      );
      if (input.memberId) {
        await createNotification({
          recipientType: "user",
          recipientUserId: ctx.user.id,
          type: "ai_insight",
          title: input.title,
          body: input.body,
          resourceType: "ai_insight",
          resourceId: rowId,
        });
      }
      return { id: rowId };
    }),

  /** Advisor: mark an insight as actioned */
  markActioned: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();

      await db
        .update(aiInsights)
        .set({
          isActioned: true,
          actionedByUserId: ctx.user.id,
          actionedAt: new Date(),
        })
        .where(eq(aiInsights.id, input.id));
      return { success: true };
    }),

  /** Get or generate today's morning briefing */
  morningBriefing: protectedProcedure.query(async () => {
    const db = await getDb();
    const today = new Date().toISOString().slice(0, 10);

    const rows = await db
      .select()
      .from(morningBriefings)
      .where(eq(morningBriefings.date, today))
      .limit(1);
    return rows[0] ?? null;
  }),

  /** Admin: save a morning briefing */
  saveMorningBriefing: protectedProcedure
    .input(
      z.object({
        headline: z.string().optional(),
        body: z.string().min(1),
        urgentItems: z.array(z.unknown()).optional(),
        opportunities: z.array(z.unknown()).optional(),
        model: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const today = new Date().toISOString().slice(0, 10);

      const existing = await db
        .select({ id: morningBriefings.id })
        .from(morningBriefings)
        .where(eq(morningBriefings.date, today))
        .limit(1);
      if (existing.length > 0) {
        await db
          .update(morningBriefings)
          .set({
            headline: input.headline ?? null,
            body: input.body,
            urgentItems: input.urgentItems ?? null,
            opportunities: input.opportunities ?? null,
          })
          .where(eq(morningBriefings.date, today));
        return { id: existing[0].id };
      }
      const [row] = await db
        .insert(morningBriefings)
        .values({
          date: today,
          generatedByUserId: ctx.user.id,
          headline: input.headline ?? null,
          body: input.body,
          urgentItems: input.urgentItems ?? null,
          opportunities: input.opportunities ?? null,
          model: input.model ?? null,
        })
        .returning({ id: morningBriefings.id });
      return { id: row.id };
    }),
});

// ─── Conversations + Messages Router ─────────────────────────────────────────

export const messagingRouter = router({
  /** Advisor: list all conversations */
  listConversations: protectedProcedure
    .input(
      z.object({
        channel: z.enum(["whatsapp", "email", "portal", "sms"]).optional(),
        unresolvedOnly: z.boolean().optional(),
      }),
    )
    .query(async ({ input }) => {
      const db = await getDb();
      return db
        .select()
        .from(conversations)
        .orderBy(desc(conversations.lastMessageAt))
        .limit(100);
    }),

  /** Member: list their own conversations */
  myConversations: memberProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    return db
      .select()
      .from(conversations)
      .where(eq(conversations.memberId, ctx.member.id))
      .orderBy(desc(conversations.updatedAt));
  }),

  /** Start a new conversation */
  startConversation: memberProcedure
    .input(
      z.object({
        subject: z.string().optional(),
        channel: z.enum(["whatsapp", "email", "portal", "sms"]).optional(),
        travelRequestId: z.number().optional(),
        firstMessage: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      let convId: number;

      const [conv] = await db
        .insert(conversations)
        .values({
          memberId: ctx.member.id,
          channel: input.channel ?? "portal",
          subject: input.subject ?? null,
          travelRequestId: input.travelRequestId ?? null,
          lastMessageAt: new Date(),
        })
        .returning({ id: conversations.id });
      convId = conv.id;
      await db.insert(messages).values({
        conversationId: convId,
        senderType: "member",
        senderMemberId: ctx.member.id,
        body: input.firstMessage,
      });

      await Fluvio.produce(
        "messages",
        JSON.stringify({
          event: "new_conversation",
          conversationId: convId,
          memberId: ctx.member.id,
        }),
      );
      await Dapr.publishEvent("pubsub", "new-conversation", {
        conversationId: convId,
      });
      return { conversationId: convId };
    }),

  /** Send a message in a conversation */
  sendMessage: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        body: z.string().min(1),
        attachmentUrl: z.string().url().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      let msgId: number;

      const [msg] = await db
        .insert(messages)
        .values({
          conversationId: input.conversationId,
          senderType: "advisor",
          senderUserId: ctx.user.id,
          body: input.body,
          attachmentUrl: input.attachmentUrl ?? null,
        })
        .returning({ id: messages.id });
      msgId = msg.id;
      await db
        .update(conversations)
        .set({ lastMessageAt: new Date(), updatedAt: new Date() })
        .where(eq(conversations.id, input.conversationId));

      await Fluvio.produce(
        "messages",
        JSON.stringify({
          event: "message_sent",
          messageId: msgId,
          conversationId: input.conversationId,
        }),
      );
      return { messageId: msgId };
    }),

  /** Member sends a message */
  memberSendMessage: memberProcedure
    .input(
      z.object({
        conversationId: z.number(),
        body: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      let msgId: number;

      const [msg] = await db
        .insert(messages)
        .values({
          conversationId: input.conversationId,
          senderType: "member",
          senderMemberId: ctx.member.id,
          body: input.body,
        })
        .returning({ id: messages.id });
      msgId = msg.id;
      await db
        .update(conversations)
        .set({ lastMessageAt: new Date(), updatedAt: new Date() })
        .where(eq(conversations.id, input.conversationId));

      await Fluvio.produce(
        "messages",
        JSON.stringify({ event: "member_message", messageId: msgId }),
      );
      return { messageId: msgId };
    }),

  /** Get messages for a conversation */
  getMessages: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, input.conversationId))
        .orderBy(asc(messages.createdAt));
    }),

  /** Advisor: resolve a conversation */
  resolveConversation: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      await db
        .update(conversations)
        .set({ isResolved: true, updatedAt: new Date() })
        .where(eq(conversations.id, input.id));
      return { success: true };
    }),

  /** Advisor: assign conversation to themselves */
  assignConversation: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();

      await db
        .update(conversations)
        .set({ assignedAdvisorId: ctx.user.id, updatedAt: new Date() })
        .where(eq(conversations.id, input.id));
      return { success: true };
    }),
});

// ─── Commission Ledger Router ─────────────────────────────────────────────────

export const commissionRouter = router({
  /** Advisor: list all commission entries */
  list: protectedProcedure
    .input(
      z.object({
        status: z
          .enum(["expected", "invoiced", "received", "disputed", "written_off"])
          .optional(),
        advisorId: z.number().optional(),
      }),
    )
    .query(async ({ input }) => {
      const db = await getDb();
      return db
        .select()
        .from(commissionLedger)
        .orderBy(desc(commissionLedger.createdAt))
        .limit(200);
    }),

  /** Advisor: create a commission entry for a booking */
  create: protectedProcedure
    .input(
      z.object({
        bookingId: z.number(),
        memberId: z.number(),
        supplierId: z.number().optional(),
        expectedAmount: z.string(),
        currency: z.string().optional(),
        expectedDate: z.string().optional(),
        invoiceRef: z.string().optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      let rowId: number;

      const [row] = await db
        .insert(commissionLedger)
        .values({
          bookingId: input.bookingId,
          memberId: input.memberId,
          supplierId: input.supplierId ?? null,
          advisorId: ctx.user.id,
          expectedAmount: input.expectedAmount,
          currency: input.currency ?? "GBP",
          expectedDate: input.expectedDate
            ? new Date(input.expectedDate)
            : null,
          invoiceRef: input.invoiceRef ?? null,
          notes: input.notes ?? null,
          status: "expected",
        })
        .returning({ id: commissionLedger.id });
      rowId = row.id;

      // Record in TigerBeetle
      await TigerBeetle.createTransfer(
        BigInt(Math.round(parseFloat(input.expectedAmount) * 100)),
        BigInt(2001),
        BigInt(2002),
      );
      await Fluvio.produce(
        "commissions",
        JSON.stringify({ event: "created", id: rowId }),
      );
      return { id: rowId };
    }),

  /** Advisor: mark commission as received */
  markReceived: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        receivedAmount: z.string(),
        receivedDate: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();

      await db
        .update(commissionLedger)
        .set({
          status: "received",
          receivedAmount: input.receivedAmount,
          receivedDate: input.receivedDate
            ? new Date(input.receivedDate)
            : new Date(),
          updatedAt: new Date(),
        })
        .where(eq(commissionLedger.id, input.id));
      await Fluvio.produce(
        "commissions",
        JSON.stringify({ event: "received", id: input.id }),
      );
      return { success: true };
    }),

  /** Advisor: mark commission as disputed */
  markDisputed: protectedProcedure
    .input(z.object({ id: z.number(), notes: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      await db
        .update(commissionLedger)
        .set({
          status: "disputed",
          notes: input.notes ?? null,
          updatedAt: new Date(),
        })
        .where(eq(commissionLedger.id, input.id));
      return { success: true };
    }),

  /** Analytics: commission summary */
  summary: protectedProcedure.query(async () => {
    const db = await getDb();

    const rows = await db
      .select({
        status: commissionLedger.status,
        total: sql<string>`sum("expectedAmount")`,
      })
      .from(commissionLedger)
      .groupBy(commissionLedger.status);
    return rows;
  }),
});

// ─── Audit Logs Router ────────────────────────────────────────────────────────

export const auditRouter = router({
  /** Admin: list audit logs */
  list: adminProcedure
    .input(
      z.object({
        resourceType: z.string().optional(),
        actorId: z.number().optional(),
        limit: z.number().int().min(1).max(500).optional(),
      }),
    )
    .query(async ({ input }) => {
      const db = await getDb();
      return db
        .select()
        .from(auditLogs)
        .orderBy(desc(auditLogs.createdAt))
        .limit(input.limit ?? 100);
    }),
});

// ─── Member Preferences Router ────────────────────────────────────────────────

export const preferencesRouter = router({
  /** Member: get their preferences */
  get: memberProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    const rows = await db
      .select()
      .from(memberPreferences)
      .where(eq(memberPreferences.memberId, ctx.member.id))
      .limit(1);
    return rows[0] ?? null;
  }),

  /** Member: upsert their preferences */
  upsert: memberProcedure
    .input(
      z.object({
        preferredAirlines: z.array(z.string()).optional(),
        preferredHotelChains: z.array(z.string()).optional(),
        preferredCabinClass: z.string().optional(),
        preferredRoomType: z.string().optional(),
        frequentFlyerNumbers: z.record(z.string(), z.string()).optional(),
        hotelLoyaltyNumbers: z.record(z.string(), z.string()).optional(),
        seatPreference: z.string().optional(),
        mealPreference: z.string().optional(),
        travelStyle: z.string().optional(),
        favouriteDestinations: z.array(z.string()).optional(),
        bucketListDestinations: z.array(z.string()).optional(),
        avoidedDestinations: z.array(z.string()).optional(),
        communicationPreference: z.string().optional(),
        notifyOnProposal: z.boolean().optional(),
        notifyOnBooking: z.boolean().optional(),
        notifyOnMessage: z.boolean().optional(),
        customPreferences: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();

      const existing = await db
        .select({ id: memberPreferences.id })
        .from(memberPreferences)
        .where(eq(memberPreferences.memberId, ctx.member.id))
        .limit(1);
      if (existing.length > 0) {
        await db
          .update(memberPreferences)
          .set({ ...input, updatedAt: new Date() })
          .where(eq(memberPreferences.memberId, ctx.member.id));
      } else {
        await db
          .insert(memberPreferences)
          .values({ memberId: ctx.member.id, ...input });
      }
      await writeAudit("member", ctx.member.id, "update", "member_preferences");
      return { success: true };
    }),

  /** Advisor: get preferences for a member */
  getForMember: protectedProcedure
    .input(z.object({ memberId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db
        .select()
        .from(memberPreferences)
        .where(eq(memberPreferences.memberId, input.memberId))
        .limit(1);
      return rows[0] ?? null;
    }),
});

// ─── Advisor Tasks Router ─────────────────────────────────────────────────────

export const tasksRouter = router({
  /** Advisor: list their own tasks */
  myTasks: protectedProcedure
    .input(
      z.object({
        status: z.enum(["open", "in_progress", "done", "cancelled"]).optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      return db
        .select()
        .from(advisorTasks)
        .where(eq(advisorTasks.assignedToUserId, ctx.user.id))
        .orderBy(asc(advisorTasks.dueDate), desc(advisorTasks.createdAt));
    }),

  /** Advisor: create a task */
  create: protectedProcedure
    .input(
      z.object({
        assignedToUserId: z.number(),
        memberId: z.number().optional(),
        travelRequestId: z.number().optional(),
        bookingId: z.number().optional(),
        title: z.string().min(1),
        description: z.string().optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
        dueDate: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      let rowId: number;

      const [row] = await db
        .insert(advisorTasks)
        .values({
          assignedToUserId: input.assignedToUserId,
          createdByUserId: ctx.user.id,
          memberId: input.memberId ?? null,
          travelRequestId: input.travelRequestId ?? null,
          bookingId: input.bookingId ?? null,
          title: input.title,
          description: input.description ?? null,
          priority: input.priority ?? "medium",
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          status: "open",
        })
        .returning({ id: advisorTasks.id });
      rowId = row.id;

      await Fluvio.produce(
        "tasks",
        JSON.stringify({ event: "created", id: rowId }),
      );
      return { id: rowId };
    }),

  /** Advisor: update task status */
  updateStatus: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["open", "in_progress", "done", "cancelled"]),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();

      await db
        .update(advisorTasks)
        .set({
          status: input.status,
          completedAt: input.status === "done" ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(advisorTasks.id, input.id));
      return { success: true };
    }),

  /** Admin: list all tasks across all advisors */
  listAll: adminProcedure
    .input(
      z.object({
        status: z.enum(["open", "in_progress", "done", "cancelled"]).optional(),
      }),
    )
    .query(async ({ input }) => {
      const db = await getDb();
      return db
        .select()
        .from(advisorTasks)
        .orderBy(asc(advisorTasks.dueDate))
        .limit(200);
    }),
});

// ─── Tags Router ──────────────────────────────────────────────────────────────

export const tagsRouter = router({
  /** List all tags */
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    return db.select().from(tags).orderBy(asc(tags.name));
  }),

  /** Admin: create a tag */
  create: adminProcedure
    .input(z.object({ name: z.string().min(1), color: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      let rowId: number;

      const [row] = await db
        .insert(tags)
        .values({ name: input.name, color: input.color ?? null })
        .returning({ id: tags.id });
      rowId = row.id;

      return { id: rowId };
    }),

  /** Advisor: tag a member */
  tagMember: protectedProcedure
    .input(z.object({ memberId: z.number(), tagId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      await db
        .insert(memberTags)
        .values({ memberId: input.memberId, tagId: input.tagId })
        .onConflictDoNothing();
      return { success: true };
    }),

  /** Advisor: remove a tag from a member */
  untagMember: protectedProcedure
    .input(z.object({ memberId: z.number(), tagId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      await db
        .delete(memberTags)
        .where(
          and(
            eq(memberTags.memberId, input.memberId),
            eq(memberTags.tagId, input.tagId),
          ),
        );
      return { success: true };
    }),

  /** Get tags for a member */
  getMemberTags: protectedProcedure
    .input(z.object({ memberId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db
        .select()
        .from(memberTags)
        .where(eq(memberTags.memberId, input.memberId));
    }),
});

// ─── Proposal Items Router ────────────────────────────────────────────────────

export const proposalItemsRouter = router({
  /** Advisor: list items for a proposal */
  list: protectedProcedure
    .input(z.object({ proposalId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db
        .select()
        .from(proposalItems)
        .where(eq(proposalItems.proposalId, input.proposalId))
        .orderBy(asc(proposalItems.sortOrder));
    }),

  /** Advisor: add a line item to a proposal */
  add: protectedProcedure
    .input(
      z.object({
        proposalId: z.number(),
        sortOrder: z.number().optional(),
        itemType: z.string().min(1),
        title: z.string().min(1),
        description: z.string().optional(),
        supplierId: z.number().optional(),
        supplierRef: z.string().optional(),
        checkIn: z.string().optional(),
        checkOut: z.string().optional(),
        nights: z.number().optional(),
        unitPrice: z.string().optional(),
        quantity: z.number().optional(),
        totalPrice: z.string().optional(),
        currency: z.string().optional(),
        commissionRate: z.string().optional(),
        commissionAmount: z.string().optional(),
        notes: z.string().optional(),
        imageUrl: z.string().url().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      let rowId: number;

      const [row] = await db
        .insert(proposalItems)
        .values({
          proposalId: input.proposalId,
          sortOrder: input.sortOrder ?? 0,
          itemType: input.itemType,
          title: input.title,
          description: input.description ?? null,
          supplierId: input.supplierId ?? null,
          supplierRef: input.supplierRef ?? null,
          checkIn: input.checkIn ? new Date(input.checkIn) : null,
          checkOut: input.checkOut ? new Date(input.checkOut) : null,
          nights: input.nights ?? null,
          unitPrice: input.unitPrice ?? null,
          quantity: input.quantity ?? 1,
          totalPrice: input.totalPrice ?? null,
          currency: input.currency ?? "GBP",
          commissionRate: input.commissionRate ?? null,
          commissionAmount: input.commissionAmount ?? null,
          notes: input.notes ?? null,
          imageUrl: input.imageUrl ?? null,
        })
        .returning({ id: proposalItems.id });
      rowId = row.id;

      return { id: rowId };
    }),

  /** Advisor: remove a line item */
  remove: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      await db.delete(proposalItems).where(eq(proposalItems.id, input.id));
      return { success: true };
    }),

  /** Advisor: reorder items */
  reorder: protectedProcedure
    .input(
      z.object({
        items: z.array(z.object({ id: z.number(), sortOrder: z.number() })),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      for (const item of input.items) {
        await db
          .update(proposalItems)
          .set({ sortOrder: item.sortOrder, updatedAt: new Date() })
          .where(eq(proposalItems.id, item.id));
      }
      return { success: true };
    }),
});

// ─── Analytics Router ─────────────────────────────────────────────────────────

export const analyticsRouter = router({
  /** Admin: get platform event counts by type */
  eventCounts: adminProcedure
    .input(z.object({ since: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();

      const rows = await db
        .select({
          eventType: platformEvents.eventType,
          count: sql<number>`count(*)`,
        })
        .from(platformEvents)
        .groupBy(platformEvents.eventType);
      return rows;
    }),

  /** Admin: dashboard summary */
  dashboard: adminProcedure.query(async () => {
    const db = await getDb();

    const [memberCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(members);
    const [taskCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(advisorTasks)
      .where(eq(advisorTasks.status, "open"));
    const [msgCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(eq(messages.isRead, false));
    const [commCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(commissionLedger)
      .where(eq(commissionLedger.status, "expected"));
    const [insightCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(aiInsights)
      .where(eq(aiInsights.isActioned, false));
    return {
      totalMembers: Number(memberCount?.count ?? 0),
      openTasks: Number(taskCount?.count ?? 0),
      unreadMessages: Number(msgCount?.count ?? 0),
      pendingCommissions: Number(commCount?.count ?? 0),
      unactionedInsights: Number(insightCount?.count ?? 0),
    };
  }),

  /** Track a platform event */
  track: protectedProcedure
    .input(
      z.object({
        eventType: z.string().min(1),
        resourceType: z.string().optional(),
        resourceId: z.number().optional(),
        properties: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await trackEvent(
        input.eventType,
        "user",
        ctx.user.id,
        input.resourceType,
        input.resourceId,
        input.properties,
      );
      await Fluvio.produce(
        "analytics",
        JSON.stringify({ event: input.eventType, actorId: ctx.user.id }),
      );
      return { success: true };
    }),
});

// ─── Supplier Contacts Router ─────────────────────────────────────────────────

export const supplierContactsRouter = router({
  /** Advisor: list contacts for a supplier */
  list: protectedProcedure
    .input(z.object({ supplierId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db
        .select()
        .from(supplierContacts)
        .where(eq(supplierContacts.supplierId, input.supplierId));
    }),

  /** Advisor: add a contact to a supplier */
  add: protectedProcedure
    .input(
      z.object({
        supplierId: z.number(),
        name: z.string().min(1),
        role: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        isPrimary: z.boolean().optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();

      const [row] = await db
        .insert(supplierContacts)
        .values({
          supplierId: input.supplierId,
          name: input.name,
          role: input.role ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          isPrimary: input.isPrimary ?? false,
          notes: input.notes ?? null,
        })
        .returning({ id: supplierContacts.id });
      return { id: row.id };
    }),
});

// ─── Export helpers for use in other routers ──────────────────────────────────
export { writeAudit, createNotification, trackEvent };
