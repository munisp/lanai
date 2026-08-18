import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  eventDeliveries,
  outboxEvents,
  type OutboxEvent,
} from "../../drizzle/schema";
import { getDb } from "../db";
import {
  Dapr,
  Fluvio,
  InfrastructureError,
  Lakehouse,
  Temporal,
} from "./infrastructure";
import { synchronizeOutboxEventToCrm } from "./crmSyncService";
import { TwentyCrmClient } from "./twentyClient";

const DELIVERY_TARGETS = ["fluvio", "dapr", "lakehouse", "crm"] as const;
type DeliveryTarget = (typeof DELIVERY_TARGETS)[number];

/**
 * A dispatcher owns a publishing row only while this lease is valid.  Completion
 * updates include the opaque claim token, so a process that is paused or loses
 * database connectivity cannot overwrite a replacement dispatcher's outcome.
 */
export const OUTBOX_CLAIM_LEASE_MS = 60_000;

export type DomainEventInput = {
  aggregateType: string;
  aggregateId: string | number;
  eventType: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
};

export type DomainEventEnvelope = DomainEventInput & {
  eventId: string;
  occurredAt: string;
  schemaVersion: number;
};

type ClaimedOutboxEvent = {
  row: OutboxEvent;
  claimToken: string;
  attempts: number;
};

function topicFor(event: DomainEventEnvelope): string {
  return `lanai.${event.aggregateType}`.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function daprTopicFor(event: DomainEventEnvelope): string {
  return `lanai.${event.aggregateType}.${event.eventType}`.replace(
    /[^a-zA-Z0-9._-]/g,
    "-",
  );
}

function retryAt(attempts: number): Date {
  const seconds = Math.min(15 * 60, 2 ** Math.min(attempts, 10));
  return new Date(Date.now() + seconds * 1000);
}

function toEnvelope(row: OutboxEvent): DomainEventEnvelope {
  return {
    eventId: row.eventId,
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId,
    eventType: row.eventType,
    payload: row.payload as Record<string, unknown>,
    idempotencyKey: row.idempotencyKey,
    schemaVersion: row.schemaVersion,
    occurredAt: row.createdAt.toISOString(),
  };
}

/**
 * Persists an event before any network operation. A uniqueness constraint on the
 * idempotency key makes a retried business mutation safe to replay.
 */
export async function enqueueDomainEvent(
  input: DomainEventInput,
): Promise<string> {
  const db = await getDb();
  const eventId = nanoid(24);
  const [row] = await db
    .insert(outboxEvents)
    .values({
      eventId,
      aggregateType: input.aggregateType,
      aggregateId: String(input.aggregateId),
      eventType: input.eventType,
      payload: input.payload,
      idempotencyKey: input.idempotencyKey,
      status: "pending",
    })
    .onConflictDoNothing({ target: outboxEvents.idempotencyKey })
    .returning({ eventId: outboxEvents.eventId });
  return row?.eventId ?? input.idempotencyKey;
}

async function markDelivery(
  eventId: number,
  target: DeliveryTarget,
  status: "delivered" | "failed",
  error?: unknown,
): Promise<void> {
  const db = await getDb();
  await db
    .insert(eventDeliveries)
    .values({
      outboxEventId: eventId,
      target,
      status,
      attempts: 1,
      lastError: error ? String(error).slice(0, 4_000) : null,
      deliveredAt: status === "delivered" ? new Date() : null,
    })
    .onConflictDoUpdate({
      target: [eventDeliveries.outboxEventId, eventDeliveries.target],
      set: {
        status,
        attempts: sql`${eventDeliveries.attempts} + 1`,
        lastError: error ? String(error).slice(0, 4_000) : null,
        deliveredAt: status === "delivered" ? new Date() : null,
        updatedAt: new Date(),
      },
    });
}

async function publish(event: OutboxEvent): Promise<void> {
  const envelope = toEnvelope(event);
  const payload = JSON.stringify(envelope);
  const deliveries: Array<{
    target: DeliveryTarget;
    operation: Promise<unknown>;
  }> = [
    {
      target: "fluvio",
      operation: Fluvio.produce(
        topicFor(envelope),
        payload,
        String(envelope.aggregateId),
      ),
    },
    {
      target: "dapr",
      operation: Dapr.publishEvent("pubsub", daprTopicFor(envelope), envelope),
    },
    {
      target: "lakehouse",
      operation: Lakehouse.insertRecord("platform_events", envelope),
    },
  ];
  // CRM is feature-gated. When disabled, it does not create a misleading
  // delivery record or block platform events; when enabled it shares the exact
  // same durable retry boundary as the other outbox targets.
  if (TwentyCrmClient.isConfigured()) {
    deliveries.push({
      target: "crm",
      operation: synchronizeOutboxEventToCrm(event),
    });
  }

  const outcomes = await Promise.allSettled(
    deliveries.map((delivery) => delivery.operation),
  );
  const failures: unknown[] = [];
  for (const [index, outcome] of outcomes.entries()) {
    const target = deliveries[index]!.target;
    if (outcome.status === "fulfilled") {
      await markDelivery(event.id, target, "delivered");
    } else {
      await markDelivery(event.id, target, "failed", outcome.reason);
      failures.push(outcome.reason);
    }
  }
  if (failures.length > 0)
    throw new InfrastructureError(
      "Outbox",
      `delivery failed for ${failures.length} target(s)`,
      failures,
    );
}

/**
 * Converts expired publishing leases into durable retries. The claim token is
 * cleared in the same update, so no dispatcher can accidentally finalize a
 * claim that has been recovered by another process.
 */
export async function recoverStaleOutboxClaims(
  now = new Date(),
): Promise<number> {
  const db = await getDb();
  const recovered = await db
    .update(outboxEvents)
    .set({
      status: "failed",
      claimToken: null,
      claimExpiresAt: null,
      lastError: "dispatcher claim lease expired before completion",
      nextAttemptAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(outboxEvents.status, "publishing"),
        or(
          lte(outboxEvents.claimExpiresAt, now),
          isNull(outboxEvents.claimExpiresAt),
        ),
      ),
    )
    .returning({ id: outboxEvents.id });
  return recovered.length;
}

async function claimOutboxEvent(
  row: OutboxEvent,
  now: Date,
): Promise<ClaimedOutboxEvent | null> {
  const db = await getDb();
  const claimToken = nanoid(32);
  const claimExpiresAt = new Date(now.getTime() + OUTBOX_CLAIM_LEASE_MS);
  const claimed = await db
    .update(outboxEvents)
    .set({
      status: "publishing",
      attempts: sql`${outboxEvents.attempts} + 1`,
      claimToken,
      claimExpiresAt,
      updatedAt: now,
    })
    .where(
      and(
        eq(outboxEvents.id, row.id),
        inArray(outboxEvents.status, ["pending", "failed"]),
      ),
    )
    .returning({ attempts: outboxEvents.attempts });
  if (claimed.length === 0) return null;
  return { row, claimToken, attempts: claimed[0]!.attempts };
}

async function finalizeClaim(
  claimed: ClaimedOutboxEvent,
  status: "published" | "failed" | "dead_letter",
  values: {
    lastError: string | null;
    nextAttemptAt?: Date;
    publishedAt?: Date;
  },
): Promise<boolean> {
  const db = await getDb();
  const updated = await db
    .update(outboxEvents)
    .set({
      status,
      claimToken: null,
      claimExpiresAt: null,
      lastError: values.lastError,
      nextAttemptAt: values.nextAttemptAt ?? new Date(),
      publishedAt: values.publishedAt,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(outboxEvents.id, claimed.row.id),
        eq(outboxEvents.status, "publishing"),
        eq(outboxEvents.claimToken, claimed.claimToken),
      ),
    )
    .returning({ id: outboxEvents.id });
  return updated.length === 1;
}

/**
 * Publishes a bounded batch. Expired publishing claims are recovered before
 * selection. Each completion is ownership-guarded, providing at-least-once
 * delivery without allowing a stale dispatcher to overwrite a newer attempt.
 */
export async function dispatchOutboxBatch(
  limit = 50,
): Promise<{ attempted: number; published: number; failed: number; recovered: number }> {
  const db = await getDb();
  const now = new Date();
  const recovered = await recoverStaleOutboxClaims(now);
  const due = await db
    .select()
    .from(outboxEvents)
    .where(
      and(
        inArray(outboxEvents.status, ["pending", "failed"]),
        lte(outboxEvents.nextAttemptAt, now),
      ),
    )
    .orderBy(outboxEvents.createdAt)
    .limit(limit);
  let published = 0;
  let failed = 0;
  for (const row of due) {
    const claimed = await claimOutboxEvent(row, now);
    if (!claimed) continue;
    try {
      await publish(row);
      const finalized = await finalizeClaim(claimed, "published", {
        lastError: null,
        publishedAt: new Date(),
      });
      if (finalized) published += 1;
    } catch (error) {
      const terminal = claimed.attempts >= 10;
      const finalized = await finalizeClaim(
        claimed,
        terminal ? "dead_letter" : "failed",
        {
          lastError: String(error).slice(0, 4_000),
          nextAttemptAt: retryAt(claimed.attempts),
        },
      );
      if (finalized) failed += 1;
    }
  }
  return { attempted: due.length, published, failed, recovered };
}

export async function enqueueAndDispatch(
  input: DomainEventInput,
): Promise<string> {
  const eventId = await enqueueDomainEvent(input);
  await dispatchOutboxBatch();
  return eventId;
}

/** Starts durable workflow processing for events that require asynchronous work. */
export async function startEventWorkflow(
  event: DomainEventInput,
): Promise<void> {
  if (
    !new Set([
      "proposal_sent",
      "booking_created",
      "morning_briefing_requested",
    ]).has(event.eventType)
  )
    return;
  await Temporal.startWorkflow("domainEventWorkflow", [event], {
    workflowId: `event-${event.idempotencyKey}`,
  });
}
