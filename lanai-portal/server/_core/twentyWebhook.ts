import { createHmac, timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { advisorTasks, members } from "../../drizzle/schema";
import { getDb } from "../db";
import { allowedInboundFields, CRM_FIELD_OWNERSHIP } from "./crmProjection";
import {
  createCrmFieldConflict,
  findCrmObjectLinkByRemote,
  markCrmInboundEvent,
  markCrmObjectLinkState,
  persistCrmInboundEvent,
  type CrmObjectType,
} from "./crmSyncStore";
import { ENV } from "./env";

type JsonRecord = Record<string, unknown>;

type ParsedWebhook = {
  eventId: string;
  eventType: string;
  crmObjectType: CrmObjectType | null;
  crmObjectId: string | null;
  record: JsonRecord;
  revision: string | null;
};

const OBJECT_TYPE_ALIASES: Record<string, CrmObjectType> = {
  person: "person",
  people: "person",
  company: "company",
  companies: "company",
  opportunity: "opportunity",
  opportunities: "opportunity",
  proposal: "proposal",
  proposals: "proposal",
  trip: "trip",
  trips: "trip",
  supplierinquiry: "supplier_inquiry",
  supplier_inquiry: "supplier_inquiry",
  supplierinquiries: "supplier_inquiry",
  invoice: "invoice",
  invoices: "invoice",
  commissionreconciliation: "commission_reconciliation",
  commission_reconciliation: "commission_reconciliation",
  experiencemoment: "experience_moment",
  experience_moment: "experience_moment",
  experiencemoments: "experience_moment",
  note: "note",
  notes: "note",
  task: "task",
  tasks: "task",
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function remoteObjectType(value: unknown): CrmObjectType | null {
  const normalized = text(value)
    ?.replace(/[^a-zA-Z_]/g, "")
    .toLowerCase();
  return normalized ? (OBJECT_TYPE_ALIASES[normalized] ?? null) : null;
}

function extractParsedWebhook(payload: JsonRecord): ParsedWebhook {
  const data = asRecord(payload.data);
  const record = asRecord(
    data.record ??
      data.after ??
      data.object ??
      payload.record ??
      payload.object,
  );
  const objectCandidate =
    text(payload.objectType) ??
    text(payload.object) ??
    text(data.objectType) ??
    text(data.objectName) ??
    text(payload.objectName);
  const eventType = text(payload.type) ?? text(payload.eventType) ?? "unknown";
  const eventId =
    text(payload.id) ??
    text(payload.eventId) ??
    text(data.id) ??
    createHmac("sha256", "lanai-webhook-fallback")
      .update(JSON.stringify(payload))
      .digest("hex");
  const crmObjectId =
    text(record.id) ?? text(data.objectId) ?? text(payload.objectId) ?? null;
  return {
    eventId,
    eventType,
    crmObjectType: remoteObjectType(objectCandidate),
    crmObjectId,
    record,
    revision:
      text(record.updatedAt) ??
      text(data.updatedAt) ??
      text(payload.timestamp) ??
      null,
  };
}

export function verifyTwentyWebhookSignature(
  rawBody: Buffer,
  signature: string | undefined,
  secret = ENV.twentyCrmWebhookSecret,
): boolean {
  if (!secret || !signature) return false;
  const supplied = signature.replace(/^sha256=/i, "").trim();
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const suppliedBuffer = Buffer.from(supplied, "utf8");
  return (
    expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}

function supportedInboundField(
  objectType: CrmObjectType,
  field: string,
): boolean {
  return allowedInboundFields(objectType).includes(field);
}

function primaryEmail(record: JsonRecord): string | undefined {
  const emails = asRecord(record.emails);
  return text(emails.primaryEmail) ?? text(record.email);
}

function primaryPhone(record: JsonRecord): string | undefined {
  const phones = asRecord(record.phones);
  return text(phones.primaryPhoneNumber) ?? text(record.phone);
}

async function applyPersonInbound(
  link: Awaited<ReturnType<typeof findCrmObjectLinkByRemote>>,
  record: JsonRecord,
) {
  if (!link || link.lanaiObjectType !== "member")
    return { applied: 0, conflicts: 0 };
  const memberId = Number(link.lanaiObjectId);
  if (!Number.isInteger(memberId))
    throw new Error("CRM person link has invalid Lanai member id");
  const db = await getDb();
  const [member] = await db
    .select()
    .from(members)
    .where(eq(members.id, memberId))
    .limit(1);
  if (!member)
    throw new Error(`CRM person link references missing member ${memberId}`);

  const updates: Partial<typeof members.$inferInsert> = {};
  const candidates: Array<[string, unknown, unknown]> = [
    ["name", record.name, member.name],
    ["emails", primaryEmail(record), member.email],
    ["phones", primaryPhone(record), member.phone],
  ];
  let conflicts = 0;
  for (const [field, incoming, current] of candidates) {
    if (incoming === undefined || !supportedInboundField("person", field))
      continue;
    if (incoming === current) continue;
    const policy = CRM_FIELD_OWNERSHIP.person[field]!;
    if (policy === "crm_authoritative") {
      if (field === "name") updates.name = String(incoming).slice(0, 255);
      if (field === "emails")
        updates.email = String(incoming).toLowerCase().slice(0, 320);
      if (field === "phones") updates.phone = String(incoming).slice(0, 64);
    } else if (policy === "manual_conflict") {
      await createCrmFieldConflict({
        crmObjectLinkId: link.id,
        fieldName: field,
        lanaiValue: current,
        crmValue: incoming,
        policy,
      });
      conflicts += 1;
    }
  }
  if (Object.keys(updates).length > 0) {
    await db
      .update(members)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(members.id, memberId));
  }
  return { applied: Object.keys(updates).length, conflicts };
}

async function applyTaskInbound(
  link: Awaited<ReturnType<typeof findCrmObjectLinkByRemote>>,
  record: JsonRecord,
) {
  if (!link || link.lanaiObjectType !== "advisor_task")
    return { applied: 0, conflicts: 0 };
  const taskId = Number(link.lanaiObjectId);
  if (!Number.isInteger(taskId))
    throw new Error("CRM task link has invalid Lanai task id");
  const db = await getDb();
  const [task] = await db
    .select()
    .from(advisorTasks)
    .where(eq(advisorTasks.id, taskId))
    .limit(1);
  if (!task)
    throw new Error(`CRM task link references missing advisor task ${taskId}`);
  const updates: Partial<typeof advisorTasks.$inferInsert> = {};
  let conflicts = 0;
  for (const field of allowedInboundFields("task")) {
    const incoming = record[field];
    if (incoming === undefined) continue;
    const policy = CRM_FIELD_OWNERSHIP.task[field]!;
    if (policy === "crm_authoritative") {
      if (field === "title" && text(incoming))
        updates.title = text(incoming)!.slice(0, 255);
      if (
        field === "status" &&
        ["open", "in_progress", "done", "cancelled"].includes(String(incoming))
      ) {
        updates.status = String(
          incoming,
        ) as typeof advisorTasks.$inferInsert.status;
      }
      if (field === "dueAt" && text(incoming)) {
        const dueAt = new Date(String(incoming));
        if (!Number.isNaN(dueAt.valueOf())) updates.dueDate = dueAt;
      }
    } else if (policy === "manual_conflict") {
      await createCrmFieldConflict({
        crmObjectLinkId: link.id,
        fieldName: field,
        lanaiValue: (task as unknown as JsonRecord)[field] ?? null,
        crmValue: incoming,
        policy,
      });
      conflicts += 1;
    }
  }
  if (Object.keys(updates).length > 0) {
    await db
      .update(advisorTasks)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(advisorTasks.id, taskId));
  }
  return { applied: Object.keys(updates).length, conflicts };
}

async function applyInboundRecord(
  objectType: CrmObjectType,
  link: NonNullable<Awaited<ReturnType<typeof findCrmObjectLinkByRemote>>>,
  record: JsonRecord,
) {
  switch (objectType) {
    case "person":
      return applyPersonInbound(link, record);
    case "task":
      return applyTaskInbound(link, record);
    default:
      // All other currently projected CRM objects are Lanai authoritative or
      // publish-only. Keeping this explicit prevents an upstream custom field
      // from silently mutating travel, finance, or sensitive concierge data.
      return { applied: 0, conflicts: 0 };
  }
}

export async function processTwentyWebhook(
  rawBody: Buffer,
  signature: string | undefined,
): Promise<{
  status: "processed" | "ignored" | "conflicted" | "rejected";
  eventId?: string;
}> {
  let payload: JsonRecord;
  try {
    payload = asRecord(JSON.parse(rawBody.toString("utf8")));
  } catch {
    throw new Error("Twenty webhook body is not valid JSON");
  }
  const parsed = extractParsedWebhook(payload);
  const signatureValid = verifyTwentyWebhookSignature(rawBody, signature);
  const persisted = await persistCrmInboundEvent({
    crmEventId: parsed.eventId,
    eventType: parsed.eventType,
    crmObjectType: parsed.crmObjectType ?? "unknown",
    crmObjectId: parsed.crmObjectId ?? "unknown",
    payload,
    signatureValid,
  });
  if (!signatureValid) return { status: "rejected", eventId: parsed.eventId };
  if (!persisted.created) return { status: "ignored", eventId: parsed.eventId };
  if (!parsed.crmObjectType || !parsed.crmObjectId) {
    await markCrmInboundEvent(
      persisted.event.id,
      "ignored",
      "Unsupported or incomplete Twenty webhook object",
    );
    return { status: "ignored", eventId: parsed.eventId };
  }
  try {
    const link = await findCrmObjectLinkByRemote(
      parsed.crmObjectType,
      parsed.crmObjectId,
    );
    if (!link || link.syncState === "detached") {
      await markCrmInboundEvent(
        persisted.event.id,
        "ignored",
        "No active Lanai CRM object link",
      );
      return { status: "ignored", eventId: parsed.eventId };
    }
    const result = await applyInboundRecord(
      parsed.crmObjectType,
      link,
      parsed.record,
    );
    await markCrmObjectLinkState(
      link.id,
      result.conflicts > 0 ? "conflicted" : "synced",
      {
        lastCrmRevision: parsed.revision,
      },
    );
    const status = result.conflicts > 0 ? "conflicted" : "processed";
    await markCrmInboundEvent(persisted.event.id, status);
    return { status, eventId: parsed.eventId };
  } catch (error) {
    await markCrmInboundEvent(persisted.event.id, "failed", error);
    throw error;
  }
}

export function registerTwentyWebhook(app: Express) {
  app.post("/api/crm/twenty/webhook", async (req: Request, res: Response) => {
    if (!ENV.twentyCrmSyncEnabled) {
      res.status(404).json({ error: "CRM synchronization is disabled" });
      return;
    }
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(JSON.stringify(req.body ?? {}));
    const signature =
      req.header("x-twenty-signature") ??
      req.header("x-twenty-webhook-signature") ??
      undefined;
    try {
      const result = await processTwentyWebhook(rawBody, signature);
      if (result.status === "rejected") {
        res.status(401).json({ error: "Invalid webhook signature" });
        return;
      }
      res.status(202).json(result);
    } catch (error) {
      console.error("[Twenty webhook] Processing failed", error);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });
}
