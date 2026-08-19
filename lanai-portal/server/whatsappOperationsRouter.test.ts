import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { auditLogs, outboxEvents, whatsappWebhookEvents } from "../drizzle/schema";
import { getDb } from "./db";
import { Permify } from "./_core/infrastructure";
import { appRouter } from "./routers";

const TEST_PROVIDER_EVENT_ID = "operations-router-test-event";
const TEST_AGGREGATE = "whatsapp-operations-test";

function caller(role: "advisor" | "admin") {
  return appRouter.createCaller({
    user: {
      id: role === "admin" ? 991 : 992,
      openId: `operations-${role}`,
      email: `${role}@example.test`,
      name: role,
      role,
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

async function seedDeadLetter() {
  const db = await getDb();
  const [outbox] = await db
    .insert(outboxEvents)
    .values({
      eventId: "operations-router-source-event",
      aggregateType: TEST_AGGREGATE,
      aggregateId: TEST_PROVIDER_EVENT_ID,
      eventType: "whatsapp.message.received",
      payload: { provider: "meta_whatsapp", providerEventId: TEST_PROVIDER_EVENT_ID },
      idempotencyKey: "operations-router-source-key",
      status: "published",
      publishedAt: new Date(),
    })
    .returning({ id: outboxEvents.id });
  const [event] = await db
    .insert(whatsappWebhookEvents)
    .values({
      provider: "meta_whatsapp",
      providerEventId: TEST_PROVIDER_EVENT_ID,
      payloadSha256: "a".repeat(64),
      payload: {
        provider: "meta_whatsapp",
        providerEventId: TEST_PROVIDER_EVENT_ID,
        sender: "+15551234567",
        messageText: "Private test message must not be returned by operations APIs.",
      },
      status: "dead_letter",
      attempts: 10,
      lastError: "OllamaInferenceError",
      outboxEventId: outbox!.id,
    })
    .returning({ id: whatsappWebhookEvents.id });
  return event!.id;
}

describe("WhatsApp dead-letter operations", () => {
  beforeEach(async () => {
    vi.spyOn(Permify, "check").mockResolvedValue(true);
    const db = await getDb();
    await db
      .delete(auditLogs)
      .where(eq(auditLogs.resourceType, "whatsapp_webhook_event"));
    await db
      .delete(whatsappWebhookEvents)
      .where(eq(whatsappWebhookEvents.providerEventId, TEST_PROVIDER_EVENT_ID));
    await db
      .delete(outboxEvents)
      .where(eq(outboxEvents.aggregateType, TEST_AGGREGATE));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists sanitized terminal metadata for senior operations without returning payloads", async () => {
    const eventId = await seedDeadLetter();
    const rows = await caller("admin").whatsappOperations.listDeadLetters({ limit: 10 });
    const event = rows.find((row) => row.id === eventId);
    expect(event).toMatchObject({
      id: eventId,
      provider: "meta_whatsapp",
      providerEventId: TEST_PROVIDER_EVENT_ID,
      attempts: 10,
      lastError: "OllamaInferenceError",
      sourceOutboxStatus: "published",
    });
    expect(JSON.stringify(event)).not.toContain("Private test message");
    expect(JSON.stringify(event)).not.toContain("+15551234567");
  });

  it("requires an admin, atomically resets one dead letter, and records a replay audit", async () => {
    const eventId = await seedDeadLetter();
    await expect(
      caller("advisor").whatsappOperations.replayDeadLetter({
        eventId,
        reason: "Restore service after reviewed Ollama timeout incident.",
        acknowledgePayloadUnchanged: true,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const result = await caller("admin").whatsappOperations.replayDeadLetter({
      eventId,
      reason: "Restore service after reviewed Ollama timeout incident.",
      acknowledgePayloadUnchanged: true,
    });
    expect(result).toMatchObject({ eventId, status: "failed", attempts: 0 });

    const db = await getDb();
    const [event] = await db
      .select({
        status: whatsappWebhookEvents.status,
        attempts: whatsappWebhookEvents.attempts,
        claimToken: whatsappWebhookEvents.claimToken,
        claimExpiresAt: whatsappWebhookEvents.claimExpiresAt,
      })
      .from(whatsappWebhookEvents)
      .where(eq(whatsappWebhookEvents.id, eventId));
    expect(event).toMatchObject({
      status: "failed",
      attempts: 0,
      claimToken: null,
      claimExpiresAt: null,
    });

    const history = await caller("admin").whatsappOperations.replayHistory({ eventId, limit: 10 });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      actorType: "user",
      actorId: 991,
      action: "update",
      metadata: expect.objectContaining({
        operation: "manual_replay",
        payloadUnchangedAcknowledged: true,
      }),
    });

    await expect(
      caller("admin").whatsappOperations.replayDeadLetter({
        eventId,
        reason: "A second replay must be rejected after state transition.",
        acknowledgePayloadUnchanged: true,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
