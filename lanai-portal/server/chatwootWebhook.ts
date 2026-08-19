import crypto from "node:crypto";
import express from "express";
import { and, eq } from "drizzle-orm";
import {
  chatwootConversations,
  chatwootMessages,
  chatwootWebhookEvents,
  members,
} from "../drizzle/schema";
import { getDb } from "./db";
import { ENV } from "./_core/env";

type JsonRecord = Record<string, unknown>;
type ProjectionTransaction = Pick<
  Awaited<ReturnType<typeof getDb>>,
  "select" | "insert" | "update"
>;

const MAX_BODY_BYTES = 512 * 1024;
const SIGNATURE_PREFIX = "sha256=";

class ChatwootWebhookConflictError extends Error {}

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function stringValue(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length <= max ? value : null;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function hmacDigest(rawBody: Buffer, timestamp: string): string {
  return `${SIGNATURE_PREFIX}${crypto
    .createHmac("sha256", ENV.chatwootWebhookSecret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest("hex")}`;
}

function isValidSignature(rawBody: Buffer, timestamp: string, signature: string): boolean {
  if (!ENV.chatwootWebhookSecret || !/^\d{1,12}$/.test(timestamp)) return false;
  if (!signature.startsWith(SIGNATURE_PREFIX)) return false;
  const supplied = signature.slice(SIGNATURE_PREFIX.length).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(supplied)) return false;
  const expected = hmacDigest(rawBody, timestamp);
  return crypto.timingSafeEqual(Buffer.from(`${SIGNATURE_PREFIX}${supplied}`), Buffer.from(expected));
}

function isFreshTimestamp(timestamp: string): boolean {
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds)) return false;
  const skew = Math.abs(Date.now() - seconds * 1_000);
  return skew <= ENV.chatwootWebhookMaxAgeSeconds * 1_000;
}

function deliveryFingerprint(rawBody: Buffer, timestamp: string): string {
  return crypto
    .createHash("sha256")
    .update("chatwoot:")
    .update(timestamp)
    .update(":")
    .update(rawBody)
    .digest("hex");
}

function eventStatus(payload: JsonRecord): "processed" | "ignored" {
  return payload.event === "message_created" || payload.event === "message_updated"
    ? "processed"
    : "ignored";
}

/**
 * Registers the inbound Chatwoot webhook before JSON middleware. Incoming
 * deliveries are authenticated over the exact raw bytes, freshness-bounded, and
 * durably deduplicated before they update the local communication mirror.
 */
export function registerChatwootWebhook(app: express.Express): void {
  app.post(
    "/api/chatwoot/webhook",
    express.raw({ type: "application/json", limit: `${MAX_BODY_BYTES}b` }),
    async (req, res) => {
      if (!ENV.chatwootWebhookSecret) {
        res.status(503).json({ error: "Chatwoot webhook is not configured" });
        return;
      }
      const rawBody = req.body;
      if (!Buffer.isBuffer(rawBody) || rawBody.length === 0 || rawBody.length > MAX_BODY_BYTES) {
        res.status(400).json({ error: "Invalid Chatwoot webhook body" });
        return;
      }
      const timestamp = req.header("X-Chatwoot-Timestamp") ?? "";
      const signature = req.header("X-Chatwoot-Signature") ?? "";
      if (!isFreshTimestamp(timestamp) || !isValidSignature(rawBody, timestamp, signature)) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      let payload: JsonRecord;
      try {
        payload = asRecord(JSON.parse(rawBody.toString("utf8"))) ?? (() => { throw new Error("invalid"); })();
      } catch {
        res.status(400).json({ error: "Invalid Chatwoot webhook payload" });
        return;
      }
      const eventType = stringValue(payload.event, 128);
      if (!eventType) {
        res.status(400).json({ error: "Chatwoot event type is required" });
        return;
      }
      const deliveryId = stringValue(req.header("X-Chatwoot-Delivery"), 128) ?? deliveryFingerprint(rawBody, timestamp);
      const payloadSha256 = crypto.createHash("sha256").update(rawBody).digest("hex");
      const now = new Date();

      try {
        const accepted = await persistDelivery({ deliveryId, eventType, payloadSha256, payload, now });
        res.status(200).json({ accepted: accepted ? 1 : 0, duplicates: accepted ? 0 : 1 });
      } catch (error) {
        if (error instanceof ChatwootWebhookConflictError) {
          res.status(409).json({ error: "Conflicting Chatwoot webhook delivery" });
          return;
        }
        console.error("[Chatwoot webhook] durable intake failed type=", error instanceof Error ? error.name : "Unknown");
        res.status(503).json({ error: "Chatwoot webhook persistence unavailable" });
      }
    },
  );
}

async function persistDelivery(input: {
  deliveryId: string;
  eventType: string;
  payloadSha256: string;
  payload: JsonRecord;
  now: Date;
}): Promise<boolean> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [delivery] = await tx
      .insert(chatwootWebhookEvents)
      .values({
        deliveryId: input.deliveryId,
        eventType: input.eventType,
        payloadSha256: input.payloadSha256,
        payload: input.payload,
        status: "received",
      })
      .onConflictDoNothing({ target: chatwootWebhookEvents.deliveryId })
      .returning({ id: chatwootWebhookEvents.id });
    if (!delivery) {
      const [existing] = await tx
        .select({ payloadSha256: chatwootWebhookEvents.payloadSha256 })
        .from(chatwootWebhookEvents)
        .where(eq(chatwootWebhookEvents.deliveryId, input.deliveryId))
        .limit(1);
      if (!existing) throw new Error("Chatwoot webhook delivery conflict lookup failed");
      if (!crypto.timingSafeEqual(Buffer.from(existing.payloadSha256), Buffer.from(input.payloadSha256))) {
        throw new ChatwootWebhookConflictError("Chatwoot delivery payload differs from its original delivery");
      }
      return false;
    }

    if (eventStatus(input.payload) === "processed") {
      await projectMessage(tx, input.payload, input.now);
    }
    await tx
      .update(chatwootWebhookEvents)
      .set({ status: eventStatus(input.payload), processedAt: input.now, updatedAt: input.now })
      .where(eq(chatwootWebhookEvents.id, delivery.id));
    return true;
  });
}

async function projectMessage(
  tx: ProjectionTransaction,
  payload: JsonRecord,
  now: Date,
): Promise<void> {
  const conversation = asRecord(payload.conversation);
  const contact = asRecord(payload.contact);
  const inbox = asRecord(payload.inbox);
  const messageId = positiveInteger(payload.id);
  const conversationId = positiveInteger(conversation?.id);
  const contactAttributes = asRecord(contact?.additional_attributes);
  const memberId = Number(contactAttributes?.lanai_member_id);
  if (!messageId || !conversationId || !Number.isInteger(memberId) || memberId <= 0) return;

  const [member] = await tx
    .select({ id: members.id })
    .from(members)
    .where(eq(members.id, memberId))
    .limit(1);
  if (!member) return;

  const contactName = [stringValue(contact?.first_name, 128), stringValue(contact?.last_name, 128)]
    .filter(Boolean)
    .join(" ")
    .slice(0, 255);
  const contactEmail = stringValue(contact?.email, 320);
  const contactIdentifier = stringValue(contact?.phone_number, 512) ?? contactEmail;
  const channel = stringValue(inbox?.channel_type, 64) ?? "chatwoot";
  const content = (stringValue(payload.content, 16_000) ?? "").slice(0, 16_000);
  const rawMessageType = payload.message_type;
  const messageType = rawMessageType === "incoming" || rawMessageType === 0 ? "inbound" : "outbound";
  const status = stringValue(conversation?.status, 32) ?? "open";
  const localConversationId = `conv_${conversationId}`;

  const [upserted] = await tx
    .insert(chatwootConversations)
    .values({
      chatwootId: localConversationId,
      memberId: member.id,
      contactIdentifier,
      contactName: contactName || null,
      contactEmail,
      channel,
      status,
      lastMessage: content,
      advisorResponded: messageType === "outbound",
      memberSeen: messageType === "inbound",
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: chatwootConversations.chatwootId,
      set: {
        status,
        lastMessage: content,
        channel,
        updatedAt: now,
        advisorResponded: messageType === "outbound",
        memberSeen: messageType === "inbound",
      },
    })
    .returning({ id: chatwootConversations.id });
  if (!upserted) throw new Error("Chatwoot conversation projection failed");

  await tx
    .insert(chatwootMessages)
    .values({
      chatwootId: `msg_${messageId}`,
      conversationId: upserted.id,
      messageType,
      content,
      attachmentUrl: null,
      isTemplate: payload.content_type === "template",
    })
    .onConflictDoNothing({ target: chatwootMessages.chatwootId });
}
