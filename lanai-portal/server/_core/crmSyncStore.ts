import { createHash } from "crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  crmFieldConflicts,
  crmInboundEvents,
  crmObjectLinks,
  crmSyncDeliveries,
  type CrmFieldPolicy,
  type CrmInboundStatus,
  type CrmSyncStatus,
} from "../../drizzle/schema";
import { getDb } from "../db";

export const CRM_OBJECT_TYPES = [
  "person",
  "company",
  "opportunity",
  "proposal",
  "trip",
  "supplier_inquiry",
  "invoice",
  "commission_reconciliation",
  "experience_moment",
  "note",
  "task",
] as const;
export type CrmObjectType = (typeof CRM_OBJECT_TYPES)[number];

export const CRM_FIELD_POLICIES = [
  "lanai_authoritative",
  "crm_authoritative",
  "lanai_publish_only",
  "manual_conflict",
] as const satisfies readonly CrmFieldPolicy[];
export type CrmFieldOwnershipPolicy = (typeof CRM_FIELD_POLICIES)[number];

export type CrmObjectLinkInput = {
  lanaiObjectType: string;
  lanaiObjectId: string | number;
  crmObjectType: CrmObjectType | string;
  crmObjectId: string;
  lastLanaiVersion?: number;
  lastCrmRevision?: string | null;
  lanaiProjectionHash?: string | null;
  crmProjectionHash?: string | null;
  syncState?: CrmSyncStatus;
  metadata?: Record<string, unknown> | null;
};

export type CrmDeliveryInput = {
  outboxEventId?: number | null;
  crmObjectLinkId?: number | null;
  operation: "create" | "update" | "upsert" | "delete" | "detach";
  idempotencyKey: string;
  request: Record<string, unknown>;
};

export type CrmInboundEventInput = {
  crmEventId: string;
  eventType: string;
  crmObjectType: string;
  crmObjectId: string;
  payload: Record<string, unknown>;
  signatureValid: boolean;
};

function projectionHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function hashCrmProjection(value: unknown): string {
  return projectionHash(value);
}

export async function findCrmObjectLink(
  lanaiObjectType: string,
  lanaiObjectId: string | number,
  crmObjectType: CrmObjectType | string,
) {
  const db = await getDb();
  const [link] = await db
    .select()
    .from(crmObjectLinks)
    .where(
      and(
        eq(crmObjectLinks.lanaiObjectType, lanaiObjectType),
        eq(crmObjectLinks.lanaiObjectId, String(lanaiObjectId)),
        eq(crmObjectLinks.crmObjectType, crmObjectType),
      ),
    )
    .limit(1);
  return link ?? null;
}

export async function findCrmObjectLinkByRemote(
  crmObjectType: CrmObjectType | string,
  crmObjectId: string,
) {
  const db = await getDb();
  const [link] = await db
    .select()
    .from(crmObjectLinks)
    .where(
      and(
        eq(crmObjectLinks.crmObjectType, crmObjectType),
        eq(crmObjectLinks.crmObjectId, crmObjectId),
      ),
    )
    .limit(1);
  return link ?? null;
}

/**
 * Creates or updates a stable cross-system link. Callers must use a remote ID,
 * never a mutable CRM display field, to prevent accidental link reassignment.
 */
export async function upsertCrmObjectLink(input: CrmObjectLinkInput) {
  const db = await getDb();
  const now = new Date();
  const values = {
    lanaiObjectType: input.lanaiObjectType,
    lanaiObjectId: String(input.lanaiObjectId),
    crmObjectType: input.crmObjectType,
    crmObjectId: input.crmObjectId,
    lastLanaiVersion: input.lastLanaiVersion ?? 0,
    lastCrmRevision: input.lastCrmRevision ?? null,
    lanaiProjectionHash: input.lanaiProjectionHash ?? null,
    crmProjectionHash: input.crmProjectionHash ?? null,
    syncState: input.syncState ?? "pending",
    metadata: input.metadata ?? null,
    lastSyncedAt: input.syncState === "synced" ? now : null,
    detachedAt: input.syncState === "detached" ? now : null,
    updatedAt: now,
  } as const;

  const [link] = await db
    .insert(crmObjectLinks)
    .values(values)
    .onConflictDoUpdate({
      target: [
        crmObjectLinks.lanaiObjectType,
        crmObjectLinks.lanaiObjectId,
        crmObjectLinks.crmObjectType,
      ],
      set: values,
    })
    .returning();
  if (!link) throw new Error("Failed to persist CRM object link");
  return link;
}

export async function markCrmObjectLinkState(
  linkId: number,
  syncState: CrmSyncStatus,
  options: {
    lastCrmRevision?: string | null;
    lanaiProjectionHash?: string | null;
    crmProjectionHash?: string | null;
  } = {},
) {
  const db = await getDb();
  const now = new Date();
  const [link] = await db
    .update(crmObjectLinks)
    .set({
      syncState,
      lastCrmRevision: options.lastCrmRevision,
      lanaiProjectionHash: options.lanaiProjectionHash,
      crmProjectionHash: options.crmProjectionHash,
      lastSyncedAt: syncState === "synced" ? now : undefined,
      detachedAt: syncState === "detached" ? now : undefined,
      updatedAt: now,
    })
    .where(eq(crmObjectLinks.id, linkId))
    .returning();
  if (!link) throw new Error(`CRM object link ${linkId} was not found`);
  return link;
}

/**
 * Inserts one delivery record per deterministic operation. A duplicate key
 * returns the original record so retries cannot create duplicate CRM objects.
 */
export async function beginCrmSyncDelivery(input: CrmDeliveryInput) {
  const db = await getDb();
  const requestHash = projectionHash(input.request);
  const [created] = await db
    .insert(crmSyncDeliveries)
    .values({
      outboxEventId: input.outboxEventId ?? null,
      crmObjectLinkId: input.crmObjectLinkId ?? null,
      operation: input.operation,
      idempotencyKey: input.idempotencyKey,
      requestHash,
      status: "pending",
    })
    .onConflictDoNothing({ target: crmSyncDeliveries.idempotencyKey })
    .returning();
  if (created) return { delivery: created, created: true } as const;

  const [existing] = await db
    .select()
    .from(crmSyncDeliveries)
    .where(eq(crmSyncDeliveries.idempotencyKey, input.idempotencyKey))
    .limit(1);
  if (!existing)
    throw new Error("CRM delivery lookup failed after duplicate key");
  if (existing.requestHash !== requestHash) {
    throw new Error(
      `CRM idempotency key ${input.idempotencyKey} was reused with a different payload`,
    );
  }
  return { delivery: existing, created: false } as const;
}

export async function markCrmSyncDelivery(
  deliveryId: number,
  status: CrmSyncStatus,
  options: { remoteRevision?: string | null; error?: unknown } = {},
) {
  const db = await getDb();
  const now = new Date();
  const [delivery] = await db
    .update(crmSyncDeliveries)
    .set({
      status,
      attempts: status === "pending" ? undefined : undefined,
      remoteRevision: options.remoteRevision ?? undefined,
      lastError: options.error ? String(options.error).slice(0, 4_000) : null,
      deliveredAt: status === "synced" ? now : undefined,
      updatedAt: now,
    })
    .where(eq(crmSyncDeliveries.id, deliveryId))
    .returning();
  if (!delivery) throw new Error(`CRM delivery ${deliveryId} was not found`);
  return delivery;
}

export async function recordCrmSyncAttempt(
  deliveryId: number,
  error?: unknown,
) {
  const db = await getDb();
  const [delivery] = await db
    .update(crmSyncDeliveries)
    .set({
      attempts: sql`${crmSyncDeliveries.attempts} + 1`,
      status: error ? "failed" : "pending",
      lastError: error ? String(error).slice(0, 4_000) : null,
      updatedAt: new Date(),
    })
    .where(eq(crmSyncDeliveries.id, deliveryId))
    .returning();
  if (!delivery) throw new Error(`CRM delivery ${deliveryId} was not found`);
  return delivery;
}

/** Persist an inbound payload before any projection. Duplicate webhook IDs are safe no-ops. */
export async function persistCrmInboundEvent(input: CrmInboundEventInput) {
  const db = await getDb();
  const [created] = await db
    .insert(crmInboundEvents)
    .values({
      ...input,
      status: input.signatureValid ? "received" : "failed",
      processingError: input.signatureValid
        ? null
        : "Invalid webhook signature",
    })
    .onConflictDoNothing({ target: crmInboundEvents.crmEventId })
    .returning();
  if (created) return { event: created, created: true } as const;
  const [existing] = await db
    .select()
    .from(crmInboundEvents)
    .where(eq(crmInboundEvents.crmEventId, input.crmEventId))
    .limit(1);
  if (!existing)
    throw new Error("CRM inbound event lookup failed after duplicate key");
  return { event: existing, created: false } as const;
}

export async function markCrmInboundEvent(
  inboundEventId: number,
  status: CrmInboundStatus,
  error?: unknown,
) {
  const db = await getDb();
  const [event] = await db
    .update(crmInboundEvents)
    .set({
      status,
      processingError: error ? String(error).slice(0, 4_000) : null,
      processedAt: ["processed", "ignored", "conflicted"].includes(status)
        ? new Date()
        : undefined,
      updatedAt: new Date(),
    })
    .where(eq(crmInboundEvents.id, inboundEventId))
    .returning();
  if (!event)
    throw new Error(`CRM inbound event ${inboundEventId} was not found`);
  return event;
}

export async function createCrmFieldConflict(input: {
  crmObjectLinkId: number;
  fieldName: string;
  lanaiValue: unknown;
  crmValue: unknown;
  policy: CrmFieldOwnershipPolicy;
}) {
  const db = await getDb();
  const [conflict] = await db
    .insert(crmFieldConflicts)
    .values({
      crmObjectLinkId: input.crmObjectLinkId,
      fieldName: input.fieldName,
      lanaiValue: input.lanaiValue,
      crmValue: input.crmValue,
      policy: input.policy,
      status: "open",
    })
    .returning();
  if (!conflict) throw new Error("Failed to create CRM field conflict");
  return conflict;
}

export async function listOpenCrmFieldConflicts(limit = 100) {
  const db = await getDb();
  return db
    .select()
    .from(crmFieldConflicts)
    .where(eq(crmFieldConflicts.status, "open"))
    .orderBy(desc(crmFieldConflicts.createdAt))
    .limit(limit);
}

export async function resolveCrmFieldConflict(input: {
  conflictId: number;
  resolution: "resolved_lanai" | "resolved_crm" | "ignored";
  resolvedByUserId: number;
  resolutionNote?: string;
}) {
  const db = await getDb();
  const [conflict] = await db
    .update(crmFieldConflicts)
    .set({
      status: input.resolution,
      resolvedByUserId: input.resolvedByUserId,
      resolutionNote: input.resolutionNote ?? null,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(crmFieldConflicts.id, input.conflictId))
    .returning();
  if (!conflict)
    throw new Error(`CRM field conflict ${input.conflictId} was not found`);
  return conflict;
}

export async function listCrmSyncDeliveries(
  options: {
    status?: CrmSyncStatus;
    limit?: number;
  } = {},
) {
  const db = await getDb();
  return db
    .select()
    .from(crmSyncDeliveries)
    .where(
      options.status ? eq(crmSyncDeliveries.status, options.status) : undefined,
    )
    .orderBy(desc(crmSyncDeliveries.updatedAt))
    .limit(options.limit ?? 100);
}

export async function listCrmObjectLinks(
  options: {
    state?: CrmSyncStatus;
    limit?: number;
  } = {},
) {
  const db = await getDb();
  return db
    .select()
    .from(crmObjectLinks)
    .where(
      options.state ? eq(crmObjectLinks.syncState, options.state) : undefined,
    )
    .orderBy(desc(crmObjectLinks.updatedAt))
    .limit(options.limit ?? 200);
}

export async function listRecentCrmInboundEvents(limit = 100) {
  const db = await getDb();
  return db
    .select()
    .from(crmInboundEvents)
    .orderBy(desc(crmInboundEvents.createdAt))
    .limit(limit);
}

export async function getCrmFieldConflict(conflictId: number) {
  const db = await getDb();
  const [conflict] = await db
    .select()
    .from(crmFieldConflicts)
    .where(eq(crmFieldConflicts.id, conflictId))
    .limit(1);
  return conflict ?? null;
}

export async function getCrmSyncSummary() {
  const db = await getDb();
  const [links, deliveries, conflicts, inbound] = await Promise.all([
    db
      .select({
        state: crmObjectLinks.syncState,
        count: sql<number>`count(*)::int`,
      })
      .from(crmObjectLinks)
      .groupBy(crmObjectLinks.syncState),
    db
      .select({
        state: crmSyncDeliveries.status,
        count: sql<number>`count(*)::int`,
      })
      .from(crmSyncDeliveries)
      .groupBy(crmSyncDeliveries.status),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(crmFieldConflicts)
      .where(eq(crmFieldConflicts.status, "open")),
    db
      .select({
        state: crmInboundEvents.status,
        count: sql<number>`count(*)::int`,
      })
      .from(crmInboundEvents)
      .groupBy(crmInboundEvents.status),
  ]);
  return {
    links,
    deliveries,
    openConflicts: conflicts[0]?.count ?? 0,
    inbound,
  };
}

export async function getCrmObjectLinkById(linkId: number) {
  const db = await getDb();
  const [link] = await db
    .select()
    .from(crmObjectLinks)
    .where(eq(crmObjectLinks.id, linkId))
    .limit(1);
  return link ?? null;
}
