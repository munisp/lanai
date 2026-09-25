/**
 * Conversation router integration tests (SR-700).
 *
 * Uses the disposable integration database (NODE_ENV=test) and exercises the
 * unified conversation screen payload end to end.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  advisorTasks,
  chatwootConversations,
  chatwootMessages,
  members,
  slaTimers,
  users,
} from "../drizzle/schema";
import { getDb } from "./db";
import { appRouter } from "./routers";

const MEMBER_EMAIL = "conversation-router@example.test";
const CONV_CHATWOOT_ID = "conv_995777";
const MSG_INBOUND_CHATWOOT_ID = "msg_9957771";
const MSG_OUTBOUND_CHATWOOT_ID = "msg_9957772";
const NONEXISTENT_CONV_ID = "conv_000_nonexistent";

function advisorCaller() {
  return appRouter.createCaller({
    user: {
      id: 991,
      openId: "conversation-router-advisor",
      email: "conversation-router-advisor@example.test",
      name: "Advisor",
      role: "advisor",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: null,
      loginMethod: "test",
      avatarUrl: null,
      phone: null,
      bio: null,
      isActive: true,
    },
    member: null,
    req: {} as never,
    res: {} as never,
  });
}

function memberCaller() {
  return appRouter.createCaller({
    user: null,
    member: {
      id: 9991,
      email: MEMBER_EMAIL,
      name: "Member",
      tier: "gold",
      pinHash: null,
      crmPersonId: null,
      onboardingComplete: true,
      active: true,
      invitedByUserId: null,
      assignedAdvisorId: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      phone: null,
      nationality: null,
      passportNumber: null,
      passportExpiry: null,
      dateOfBirth: null,
      dietaryRequirements: null,
      accessibilityNeeds: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
      notes: null,
      lastSignedIn: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    req: {} as never,
    res: {} as never,
  });
}

describe("conversationRouter.getUnified", () => {
  let memberId = 0;
  let advisorUserId = 0;
  let conversationId = 0;

  beforeAll(async () => {
    const db = await getDb();
    const [member] = await db
      .insert(members)
      .values({
        email: MEMBER_EMAIL,
        name: "Conversation Router Member",
        tier: "gold",
        nationality: "GB",
        dietaryRequirements: "halal",
        accessibilityNeeds: "wheelchair",
        notes: "Prefers morning calls",
      })
      .onConflictDoUpdate({
        target: members.email,
        set: {
          name: "Conversation Router Member",
          tier: "gold",
          nationality: "GB",
          dietaryRequirements: "halal",
          accessibilityNeeds: "wheelchair",
          notes: "Prefers morning calls",
        },
      })
      .returning({ id: members.id });
    memberId = member.id;

    const [admin] = await db
      .insert(users)
      .values({
        openId: "conversation-router-advisor",
        email: "conversation-router-advisor@example.test",
        name: "Advisor",
        role: "advisor",
      })
      .onConflictDoUpdate({
        target: users.openId,
        set: { email: "conversation-router-advisor@example.test", name: "Advisor", role: "advisor" },
      })
      .returning({ id: users.id });
    advisorUserId = admin.id;

    const [conversation] = await db
      .insert(chatwootConversations)
      .values({
        chatwootId: CONV_CHATWOOT_ID,
        memberId,
        contactIdentifier: "+1555000995",
        contactName: "Router Member",
        contactEmail: MEMBER_EMAIL,
        channel: "whatsapp",
        status: "open",
        lastMessage: "Please book the villa",
      })
      .onConflictDoUpdate({
        target: chatwootConversations.chatwootId,
        set: {
          memberId,
          contactName: "Router Member",
          contactEmail: MEMBER_EMAIL,
          channel: "whatsapp",
          status: "open",
        },
      })
      .returning({ id: chatwootConversations.id });
    conversationId = conversation.id;

    await db
      .delete(chatwootMessages)
      .where(eq(chatwootMessages.conversationId, conversationId));
    await db.insert(chatwootMessages).values([
      {
        chatwootId: MSG_INBOUND_CHATWOOT_ID,
        conversationId,
        messageType: "inbound",
        content: "Please book the villa",
        transcription: "Transcript of the voice note",
        transcriptionStatus: "transcribed",
        attachmentUrl: "https://cdn.example.test/voice1.ogg",
      },
      {
        chatwootId: MSG_OUTBOUND_CHATWOOT_ID,
        conversationId,
        messageType: "outbound",
        content: "On it, will confirm shortly.",
      },
    ]);

    await db
      .delete(slaTimers)
      .where(eq(slaTimers.conversationId, conversationId));
    await db.insert(slaTimers).values({
      conversationId,
      urgency: "urgent",
      openedAt: new Date("2026-09-24T09:00:00Z"),
    });

    await db
      .delete(advisorTasks)
      .where(eq(advisorTasks.memberId, memberId));
    await db.insert(advisorTasks).values({
      assignedToUserId: advisorUserId,
      memberId,
      title: "Confirm villa booking",
      status: "open",
      priority: "high",
      automationKey: "sla_breach:msg_9957771",
      dueDate: new Date("2026-09-25T09:00:00Z"),
    });
  });

  afterAll(async () => {
    const db = await getDb();
    await db.delete(advisorTasks).where(eq(advisorTasks.memberId, memberId));
    await db.delete(slaTimers).where(eq(slaTimers.conversationId, conversationId));
    await db
      .delete(chatwootMessages)
      .where(eq(chatwootMessages.conversationId, conversationId));
    await db
      .delete(chatwootConversations)
      .where(eq(chatwootConversations.chatwootId, CONV_CHATWOOT_ID));
    await db.delete(members).where(eq(members.email, MEMBER_EMAIL));
    await db.delete(users).where(eq(users.openId, "conversation-router-advisor"));
  });

  it("returns the conversation with messages in order, transcript present, tasks included", async () => {
    const result = await advisorCaller().conversations.getUnified({
      chatwootConversationId: CONV_CHATWOOT_ID,
    });
    expect(result).not.toBeNull();
    expect(result!.conversation.chatwootId).toBe(CONV_CHATWOOT_ID);
    expect(result!.conversation.channel).toBe("whatsapp");
    expect(result!.conversation.status).toBe("open");
    expect(result!.conversation.contactName).toBe("Router Member");

    expect(result!.member).not.toBeNull();
    expect(result!.member!.id).toBe(memberId);
    expect(result!.member!.tier).toBe("gold");
    expect(result!.member!.dietaryRequirements).toBe("halal");
    expect(result!.member!.accessibilityNeeds).toBe("wheelchair");

    expect(result!.messages).toHaveLength(2);
    // ordered createdAt asc
    expect(result!.messages[0].chatwootId).toBe(MSG_INBOUND_CHATWOOT_ID);
    expect(result!.messages[0].messageType).toBe("inbound");
    expect(result!.messages[0].transcription).toBe("Transcript of the voice note");
    expect(result!.messages[0].transcriptionStatus).toBe("transcribed");
    expect(result!.messages[0].attachmentUrl).toBe("https://cdn.example.test/voice1.ogg");
    expect(result!.messages[1].chatwootId).toBe(MSG_OUTBOUND_CHATWOOT_ID);
    expect(result!.messages[1].messageType).toBe("outbound");

    expect(result!.tasks).toHaveLength(1);
    expect(result!.tasks[0].title).toBe("Confirm villa booking");
    expect(result!.tasks[0].status).toBe("open");
    expect(result!.tasks[0].priority).toBe("high");
    expect(result!.tasks[0].slaFlag).toBe(true);
  });

  it("returns null for a foreign / nonexistent chatwoot conversation id", async () => {
    const result = await advisorCaller().conversations.getUnified({
      chatwootConversationId: NONEXISTENT_CONV_ID,
    });
    expect(result).toBeNull();
  });

  it("surfaces SLA timer fields for the open timer", async () => {
    const result = await advisorCaller().conversations.getUnified({
      chatwootConversationId: CONV_CHATWOOT_ID,
    });
    expect(result).not.toBeNull();
    expect(result!.sla).not.toBeNull();
    expect(result!.sla!.urgency).toBe("urgent");
    expect(result!.sla!.openedAt).toEqual(new Date("2026-09-24T09:00:00Z"));
    expect(result!.sla!.firstResponseAt).toBeNull();
    expect(result!.sla!.breachWarnedAt).toBeNull();
  });

  it("a member-authenticated context cannot reach this router (advisor-gated)", async () => {
    // protectedProcedure rejects member sessions: invoking the procedure must
    // throw before any data is returned, proving the IDOR guard holds even
    // when a member holds a valid session of their own.
    await expect(
      memberCaller().conversations.getUnified({
        chatwootConversationId: CONV_CHATWOOT_ID,
      }),
    ).rejects.toThrow();
  });
});
