/**
 * SLA timer tests (SR-501). Disposable integration database required.
 * Time travel is done by backdating openedAt in the database rather than
 * mocking timers, so the real scheduler code path is exercised.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import {
  advisorTasks,
  chatwootConversations,
  members,
  slaTimers,
  users,
} from "../../drizzle/schema";
import { getDb } from "../db";

describe("SLA timers", () => {
  const MEMBER_EMAIL = "sla@example.test";
  const CONV_CHATWOOT_ID = "conv_994777";
  let memberId = 0;
  let adminUserId = 0;
  let ownerUserId = 0;
  let conversationDbId = 0;

  beforeAll(async () => {
    const db = await getDb();
    const [member] = await db
      .insert(members)
      .values({ email: MEMBER_EMAIL, name: "SLA Member" })
      .returning({ id: members.id });
    memberId = member.id;
    const [admin] = await db
      .insert(users)
      .values({
        openId: "sla-admin",
        email: "sla-admin@example.test",
        name: "Owner",
        role: "admin",
      })
      .onConflictDoNothing()
      .returning({ id: users.id });
    adminUserId = admin
      ? admin.id
      : (await db.select({ id: users.id }).from(users).where(eq(users.openId, "sla-admin")).limit(1))[0].id;
    // The resolver falls back to the FIRST admin by id, which may predate this
    // fixture on the shared test database; assert against that instead.
    const firstAdmin = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, "admin"))
      .orderBy(users.id)
      .limit(1);
    ownerUserId = firstAdmin[0].id;
  });

  beforeEach(async () => {
    const db = await getDb();
    await db.delete(advisorTasks).where(like(advisorTasks.automationKey, "sla_breach:%"));
    await db.delete(slaTimers).where(eq(slaTimers.conversationId, conversationDbId || -1));
    await db.delete(chatwootConversations).where(eq(chatwootConversations.chatwootId, CONV_CHATWOOT_ID));
    const [conv] = await db
      .insert(chatwootConversations)
      .values({
        chatwootId: CONV_CHATWOOT_ID,
        memberId,
        contactIdentifier: "+1555000994",
        status: "open",
        lastMessage: "",
      })
      .returning({ id: chatwootConversations.id });
    conversationDbId = conv.id;
  });

  afterAll(async () => {
    const db = await getDb();
    await db.delete(advisorTasks).where(like(advisorTasks.automationKey, "sla_breach:%"));
    await db.delete(slaTimers);
    await db.delete(chatwootConversations).where(eq(chatwootConversations.chatwootId, CONV_CHATWOOT_ID));
    await db.delete(members).where(eq(members.email, MEMBER_EMAIL));
    await db.delete(users).where(eq(users.openId, "sla-admin"));
  });

  it("opens one idempotent timer per conversation and stamps a single warn", async () => {
    const { openSlaTimer, tickSlaTimers } = await import("./slaService");
    await openSlaTimer(conversationDbId, "urgent");
    await openSlaTimer(conversationDbId, "urgent");

    const db = await getDb();
    let timers = await db.select().from(slaTimers).where(eq(slaTimers.conversationId, conversationDbId));
    expect(timers).toHaveLength(1);

    // Backdate into the warn window but before breach.
    await db
      .update(slaTimers)
      .set({ openedAt: new Date(Date.now() - 25 * 60_000) })
      .where(eq(slaTimers.id, timers[0].id));
    const tick = await tickSlaTimers();
    expect(tick.warned).toBe(1);
    expect(tick.breached).toBe(0);

    timers = await db.select().from(slaTimers).where(eq(slaTimers.conversationId, conversationDbId));
    expect(timers[0].breachWarnedAt).not.toBeNull();

    // A second tick does not re-stamp or create a breach task yet.
    const again = await tickSlaTimers();
    expect(again.warned).toBe(0);
    expect(again.breached).toBe(0);
  });

  it("creates exactly one deduped breach task after the window and closes on first response", async () => {
    const { openSlaTimer, recordFirstResponse, tickSlaTimers } = await import("./slaService");
    await openSlaTimer(conversationDbId, "ordinary");
    const db = await getDb();
    const [timer] = await db.select().from(slaTimers).where(eq(slaTimers.conversationId, conversationDbId));
    // Backdate past the 6h ordinary window.
    await db
      .update(slaTimers)
      .set({ openedAt: new Date(Date.now() - 7 * 60 * 60_000) })
      .where(eq(slaTimers.id, timer.id));

    const tick = await tickSlaTimers();
    expect(tick.breached).toBeGreaterThanOrEqual(1);

    const tasks = await db
      .select()
      .from(advisorTasks)
      .where(eq(advisorTasks.automationKey, `sla_breach:timer_${timer.id}`));
    expect(tasks).toHaveLength(1);
    expect(tasks[0].assignedToUserId).toBe(ownerUserId);

    // Advisor reply closes the timer; further ticks are inert.
    await recordFirstResponse(conversationDbId);
    const [closed] = await db.select().from(slaTimers).where(eq(slaTimers.id, timer.id));
    expect(closed.firstResponseAt).not.toBeNull();
    const inert = await tickSlaTimers();
    expect(inert.breached).toBe(0);
  });
});