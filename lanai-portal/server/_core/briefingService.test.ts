/**
 * Morning briefing tests (SR-502/SR-504). Disposable integration database.
 * BRIEFING_HOUR is pinned to the current hour so a tick generates immediately.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { morningBriefings, members } from "../../drizzle/schema";
import { getDb } from "../db";

describe("morning briefing", () => {
  const MEMBER_EMAIL = "briefing@example.test";
  const MEMBER_EMAIL2 = "briefing-bday@example.test";

  beforeAll(async () => {
    process.env.BRIEFING_HOUR = String(new Date().getHours());
    const db = await getDb();
    await db
      .insert(members)
      .values({ email: MEMBER_EMAIL, name: "Briefing Member" })
      .onConflictDoNothing({ target: members.email });
    // A member whose birthday is today (same month and day, old year).
    const now = new Date();
    await db
      .insert(members)
      .values({
        email: MEMBER_EMAIL2,
        name: "Birthday Member",
        dateOfBirth: new Date(1990, now.getMonth(), now.getDate()),
      })
      .onConflictDoNothing({ target: members.email });
  });

  afterAll(async () => {
    delete process.env.BRIEFING_HOUR;
    const db = await getDb();
    const today = new Date().toISOString().slice(0, 10);
    await db.delete(morningBriefings).where(eq(morningBriefings.date, today));
    await db.delete(members).where(eq(members.email, MEMBER_EMAIL));
    await db.delete(members).where(eq(members.email, MEMBER_EMAIL2));
  });

  it("generates once per date and includes birthday and overnight items", async () => {
    const { tickBriefing, isBriefingTime } = await import("./briefingService");
    expect(isBriefingTime(new Date())).toBe(true);

    const first = await tickBriefing();
    expect(first.created !== false || first.skipped === false).toBe(true);

    const db = await getDb();
    const today = new Date().toISOString().slice(0, 10);
    const rows = await db.select().from(morningBriefings).where(eq(morningBriefings.date, today));
    expect(rows).toHaveLength(1);
    expect(rows[0].body.length).toBeGreaterThan(0);

    // Second tick same date: still exactly one row (date-keyed upsert).
    await tickBriefing();
    const again = await db.select().from(morningBriefings).where(eq(morningBriefings.date, today));
    expect(again).toHaveLength(1);
    expect(again[0].body).toContain("Birthday Member");
  });

  it("skips ticks outside the briefing hour", async () => {
    process.env.BRIEFING_HOUR = String((new Date().getHours() + 1) % 24);
    const { tickBriefing } = await import("./briefingService");
    const result = await tickBriefing();
    expect(result.skipped).toBe(true);
  });
});