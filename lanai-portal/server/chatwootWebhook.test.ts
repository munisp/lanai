import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import {
  chatwootConversations,
  chatwootMessages,
  chatwootWebhookEvents,
  members,
} from "../drizzle/schema";
import { getDb } from "./db";

const WEBHOOK_SECRET = "test-chatwoot-webhook-secret";
let registerChatwootWebhook: typeof import("./chatwootWebhook").registerChatwootWebhook;

function signedHeaders(payload: unknown, overrides: Record<string, string> = {}) {
  const timestamp = overrides["X-Chatwoot-Timestamp"] ?? String(Math.floor(Date.now() / 1_000));
  const rawBody = JSON.stringify(payload);
  const signature = `sha256=${crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest("hex")}`;
  return {
    "Content-Type": "application/json",
    "X-Chatwoot-Timestamp": timestamp,
    "X-Chatwoot-Signature": overrides["X-Chatwoot-Signature"] ?? signature,
    "X-Chatwoot-Delivery": overrides["X-Chatwoot-Delivery"] ?? "delivery-webhook-test-1",
  };
}

async function postWebhook(payload: unknown, headers: Record<string, string>) {
  const app = express();
  registerChatwootWebhook(app);
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const port = (server.address() as AddressInfo).port;
  try {
    return await fetch(`http://127.0.0.1:${port}/api/chatwoot/webhook`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

describe("signed Chatwoot webhook", () => {
  beforeAll(async () => {
    process.env.CHATWOOT_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.CHATWOOT_WEBHOOK_MAX_AGE_SECONDS = "300";
    vi.resetModules();
    ({ registerChatwootWebhook } = await import("./chatwootWebhook"));
  });

  beforeEach(async () => {
    const db = await getDb();
    await db.delete(chatwootWebhookEvents).where(like(chatwootWebhookEvents.deliveryId, "delivery-webhook-test%"));
    await db.delete(chatwootMessages).where(like(chatwootMessages.chatwootId, "msg_991%"));
    await db.delete(chatwootConversations).where(like(chatwootConversations.chatwootId, "conv_881%"));
    await db.delete(members).where(eq(members.email, "chatwoot-webhook@example.test"));
  });

  afterAll(() => {
    delete process.env.CHATWOOT_WEBHOOK_SECRET;
    delete process.env.CHATWOOT_WEBHOOK_MAX_AGE_SECONDS;
  });

  it("authenticates raw bytes, projects one member-linked message, and deduplicates exact replay", async () => {
    const db = await getDb();
    const [member] = await db
      .insert(members)
      .values({ email: "chatwoot-webhook@example.test", name: "Webhook Member", tier: "gold" })
      .returning({ id: members.id });
    const payload = {
      event: "message_created",
      id: 991001,
      content: "Please arrange airport fast track.",
      message_type: "incoming",
      content_type: "text",
      conversation: { id: 881001, status: "open" },
      contact: {
        first_name: "Webhook",
        last_name: "Member",
        email: "chatwoot-webhook@example.test",
        phone_number: "+15551234567",
        additional_attributes: { lanai_member_id: String(member!.id) },
      },
      inbox: { channel_type: "whatsapp" },
    };
    const headers = signedHeaders(payload);

    const first = await postWebhook(payload, headers);
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toEqual({ accepted: 1, duplicates: 0 });
    const second = await postWebhook(payload, headers);
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toEqual({ accepted: 0, duplicates: 1 });

    const events = await db.select().from(chatwootWebhookEvents);
    const conversations = await db.select().from(chatwootConversations).where(eq(chatwootConversations.chatwootId, "conv_881001"));
    const messages = await db.select().from(chatwootMessages).where(eq(chatwootMessages.chatwootId, "msg_991001"));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ status: "processed", eventType: "message_created" });
    expect(conversations).toHaveLength(1);
    expect(conversations[0]).toMatchObject({ memberId: member!.id, channel: "whatsapp", status: "open" });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ messageType: "inbound", content: "Please arrange airport fast track." });
  });

  it("rejects invalid signatures and stale timestamps before database persistence", async () => {
    const payload = { event: "message_created", id: 991002, content: "must not persist" };
    const invalid = await postWebhook(payload, signedHeaders(payload, { "X-Chatwoot-Signature": "sha256=" + "0".repeat(64), "X-Chatwoot-Delivery": "delivery-webhook-test-invalid" }));
    expect(invalid.status).toBe(401);

    const staleTimestamp = String(Math.floor(Date.now() / 1_000) - 301);
    const stale = await postWebhook(payload, signedHeaders(payload, { "X-Chatwoot-Timestamp": staleTimestamp, "X-Chatwoot-Delivery": "delivery-webhook-test-stale" }));
    expect(stale.status).toBe(401);

    const db = await getDb();
    const persisted = await db.select().from(chatwootWebhookEvents).where(like(chatwootWebhookEvents.deliveryId, "delivery-webhook-test-%"));
    expect(persisted).toHaveLength(0);
  });
});
