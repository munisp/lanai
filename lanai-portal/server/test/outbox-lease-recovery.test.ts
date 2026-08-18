import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { outboxEvents } from "../../drizzle/schema";
import { closeDatabase, getDb } from "../db";
import { recoverStaleOutboxClaims } from "../_core/outbox";

const TEST_AGGREGATE = "outbox-lease-regression";

async function insertPublishingEvent(
  eventId: string,
  claimExpiresAt: Date | null,
): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .insert(outboxEvents)
    .values({
      eventId,
      aggregateType: TEST_AGGREGATE,
      aggregateId: eventId,
      eventType: "lease.recovery.test",
      payload: { eventId },
      idempotencyKey: `lease-test:${eventId}`,
      status: "publishing",
      attempts: 1,
      claimToken: `claim-${eventId}`,
      claimExpiresAt,
    })
    .returning({ id: outboxEvents.id });
  return row!.id;
}

describe("outbox publishing claim leases", () => {
  beforeEach(async () => {
    const db = await getDb();
    await db
      .delete(outboxEvents)
      .where(eq(outboxEvents.aggregateType, TEST_AGGREGATE));
  });

  afterAll(async () => {
    const db = await getDb();
    await db
      .delete(outboxEvents)
      .where(eq(outboxEvents.aggregateType, TEST_AGGREGATE));
    await closeDatabase();
  });

  it("recovers only expired publishing leases and clears their ownership token", async () => {
    const now = new Date();
    const staleId = await insertPublishingEvent(
      "outbox-lease-stale",
      new Date(now.getTime() - 1_000),
    );
    const activeId = await insertPublishingEvent(
      "outbox-lease-active",
      new Date(now.getTime() + 60_000),
    );

    expect(await recoverStaleOutboxClaims(now)).toBe(1);

    const db = await getDb();
    const rows = await db
      .select({
        id: outboxEvents.id,
        status: outboxEvents.status,
        claimToken: outboxEvents.claimToken,
        claimExpiresAt: outboxEvents.claimExpiresAt,
        lastError: outboxEvents.lastError,
        nextAttemptAt: outboxEvents.nextAttemptAt,
      })
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.aggregateType, TEST_AGGREGATE),
        ),
      );
    const stale = rows.find((row) => row.id === staleId)!;
    const active = rows.find((row) => row.id === activeId)!;

    expect(stale).toMatchObject({
      status: "failed",
      claimToken: null,
      claimExpiresAt: null,
      lastError: "dispatcher claim lease expired before completion",
    });
    expect(stale.nextAttemptAt.getTime()).toBe(now.getTime());
    expect(active).toMatchObject({
      status: "publishing",
      claimToken: "claim-outbox-lease-active",
    });
    expect(active.claimExpiresAt!.getTime()).toBeGreaterThan(now.getTime());
  });

  it("also recovers legacy publishing rows that have no claim expiry", async () => {
    await insertPublishingEvent("outbox-lease-legacy", null);
    expect(await recoverStaleOutboxClaims(new Date())).toBe(1);

    const db = await getDb();
    const [row] = await db
      .select({ status: outboxEvents.status, claimToken: outboxEvents.claimToken })
      .from(outboxEvents)
      .where(eq(outboxEvents.idempotencyKey, "lease-test:outbox-lease-legacy"));
    expect(row).toEqual({ status: "failed", claimToken: null });
  });
});
