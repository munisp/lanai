/**
 * AI triage pipeline tests (SR-300/SR-301).
 *
 * Uses the disposable integration database; invokeLocalAi is mocked at the
 * client boundary so no local AI gateway is needed.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import {
  advisorTasks,
  aiInferenceRuns,
  chatwootConversations,
  chatwootMessages,
  members,
  users,
} from "../drizzle/schema";
import { getDb } from "./db";

const invokeLocalAi = vi.fn();

vi.mock("./_core/localAi", () => ({
  invokeLocalAi: (...args: unknown[]) => invokeLocalAi(...args),
}));

type Payload = Record<string, unknown>;

function inboundPayload(messageId: number, overrides: Partial<Payload> = {}): Payload {
  return {
    id: messageId,
    event: "message_created",
    message_type: 0,
    content: "Please rebook my Bali trip, the hotel cancelled.",
    conversation: { id: 993777 },
    ...overrides,
  };
}

function goodTriage(overrides: Record<string, unknown> = {}) {
  return {
    output: "{}",
    structured: {
      intent: "travel_disruption",
      urgency: "urgent",
      sentiment: "negative",
      summary: "Flight/hotel disruption in Bali; member requests rebooking.",
      tags: ["travel", "disruption"],
      draft_reply: "Thank you for your message. The concierge team has received it and will respond shortly.",
      ...overrides,
    },
  };
}

describe("AI triage pipeline", () => {
  const MEMBER_EMAIL = "triage@example.test";
  let memberId = 0;
  let adminUserId = 0;

  beforeAll(async () => {
    const db = await getDb();
    const [member] = await db
      .insert(members)
      .values({ email: MEMBER_EMAIL, name: "Triage Member" })
      .returning({ id: members.id });
    memberId = member.id;
    const [admin] = await db
      .insert(users)
      .values({
        openId: "triage-admin",
        email: "triage-admin@example.test",
        name: "Owner",
        role: "admin",
      })
      .onConflictDoNothing()
      .returning({ id: users.id });
    if (admin) {
      adminUserId = admin.id;
    } else {
      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.openId, "triage-admin"))
        .limit(1);
      adminUserId = existing.id;
    }
  });

  beforeEach(async () => {
    invokeLocalAi.mockReset();
    const db = await getDb();
    await db.delete(advisorTasks).where(eq(advisorTasks.memberId, memberId));
    await db.delete(aiInferenceRuns).where(eq(aiInferenceRuns.memberId, memberId));
    await db.delete(chatwootMessages).where(like(chatwootMessages.chatwootId, "msg_993%"));
    await db.delete(chatwootConversations).where(eq(chatwootConversations.chatwootId, "conv_993777"));
  });

  afterAll(async () => {
    const db = await getDb();
    await db.delete(advisorTasks).where(eq(advisorTasks.memberId, memberId));
    await db.delete(aiInferenceRuns).where(eq(aiInferenceRuns.memberId, memberId));
    await db.delete(chatwootMessages).where(like(chatwootMessages.chatwootId, "msg_993%"));
    await db.delete(chatwootConversations).where(eq(chatwootConversations.chatwootId, "conv_993777"));
    await db.delete(members).where(eq(members.email, MEMBER_EMAIL));
    await db.delete(users).where(eq(users.openId, "triage-admin"));
  });

  async function seedProjectedMessage(messageId: number, content: string) {
    const db = await getDb();
    const [conversation] = await db
      .insert(chatwootConversations)
      .values({
        chatwootId: "conv_993777",
        memberId,
        contactIdentifier: "+1555000993",
        status: "open",
        lastMessage: content,
      })
      .onConflictDoUpdate({
        target: chatwootConversations.chatwootId,
        set: { lastMessage: content },
      })
      .returning({ id: chatwootConversations.id });
    await db.insert(chatwootMessages).values({
      chatwootId: `msg_${messageId}`,
      conversationId: conversation.id,
      messageType: "inbound",
      content,
    });
  }

  it("triages an inbound message and records a successful run", async () => {
    await seedProjectedMessage(993001, "Please rebook my Bali trip.");
    invokeLocalAi.mockResolvedValue(goodTriage({ urgency: "ordinary", sentiment: "neutral" }));

    const { processTriage } = await import("./triageService");
    await processTriage(inboundPayload(993001));

    const db = await getDb();
    const [run] = await db
      .select()
      .from(aiInferenceRuns)
      .where(eq(aiInferenceRuns.requestId, "triage:msg_993001"))
      .limit(1);
    expect(run.status).toBe("succeeded");
    expect(run.outputMetadata).toMatchObject({
      triage: { intent: "travel_disruption", urgency: "ordinary" },
    });
    // Ordinary + neutral: no alert task.
    const tasks = await db.select().from(advisorTasks).where(eq(advisorTasks.memberId, memberId));
    expect(tasks).toHaveLength(0);
  });

  it("is idempotent: a second pass does not re-run or duplicate the run", async () => {
    await seedProjectedMessage(993002, "Second message.");
    invokeLocalAi.mockResolvedValue(goodTriage());

    const { processTriage } = await import("./triageService");
    await processTriage(inboundPayload(993002));
    await processTriage(inboundPayload(993002));

    expect(invokeLocalAi).toHaveBeenCalledTimes(1);
    const db = await getDb();
    const runs = await db
      .select()
      .from(aiInferenceRuns)
      .where(eq(aiInferenceRuns.requestId, "triage:msg_993002"));
    expect(runs).toHaveLength(1);
  });

  it("creates exactly one urgent task for an urgent classification, deduped", async () => {
    await seedProjectedMessage(993003, "Flight cancelled, need help now.");
    invokeLocalAi.mockResolvedValue(goodTriage({ urgency: "urgent", sentiment: "negative" }));

    const { processTriage } = await import("./triageService");
    await processTriage(inboundPayload(993003));
    await processTriage(inboundPayload(993003));

    const db = await getDb();
    const tasks = await db
      .select()
      .from(advisorTasks)
      .where(eq(advisorTasks.automationKey, "triage_urgent:msg_993003"));
    expect(tasks).toHaveLength(1);
    expect(tasks[0].assignedToUserId).toBe(adminUserId);
    expect(tasks[0].priority).toBe("high");
  });

  it("keeps the message intact and creates a review task when the AI fails twice", async () => {
    await seedProjectedMessage(993004, "AI down message.");
    invokeLocalAi.mockRejectedValue(new Error("Local AI inference failed (503)"));

    const { processTriage } = await import("./triageService");
    await processTriage(inboundPayload(993004));

    const db = await getDb();
    const [message] = await db
      .select()
      .from(chatwootMessages)
      .where(eq(chatwootMessages.chatwootId, "msg_993004"))
      .limit(1);
    expect(message.content).toBe("AI down message.");

    const [run] = await db
      .select()
      .from(aiInferenceRuns)
      .where(eq(aiInferenceRuns.requestId, "triage:msg_993004"))
      .limit(1);
    expect(run.status).toBe("failed");
    expect(run.error).toContain("Local AI inference failed");

    const tasks = await db
      .select()
      .from(advisorTasks)
      .where(eq(advisorTasks.automationKey, "triage_failed:msg_993004"));
    expect(tasks).toHaveLength(1);
    expect(tasks[0].priority).toBe("high");
  });

  it("ignores outbound messages and messages without a mirror row", async () => {
    await seedProjectedMessage(993005, "outbound ignored");
    const { processTriage } = await import("./triageService");
    await processTriage(inboundPayload(993005, { message_type: 1 }));
    await processTriage(inboundPayload(993099));
    expect(invokeLocalAi).not.toHaveBeenCalled();
  });
});