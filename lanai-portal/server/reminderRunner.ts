/**
 * Shared reminder-sender logic for celebrations and NPS detractors.
 * Used by both the tRPC procedures (advisor-triggered) and the cron
 * endpoint (system.runDailyReminders). Creates in-app notifications for
 * the member's assigned advisor (falling back to any admin) and marks the
 * reminder as sent so each is delivered only once.
 */
import { eq, and, isNull } from "drizzle-orm";
import { getDb } from "./db";
import { celebrations, npsResponses, members, users, notifications } from "../drizzle/schema";

async function resolveAdvisor(memberId: number): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const [member] = await db
    .select({ assignedAdvisorId: members.assignedAdvisorId })
    .from(members)
    .where(eq(members.id, memberId));
  if (member?.assignedAdvisorId) return member.assignedAdvisorId;
  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"))
    .limit(1);
  return admin?.id ?? null;
}

export async function runCelebrationReminders(dryRun = false): Promise<{ sent: number; skipped: number }> {
  const db = await getDb();
  if (!db) return { sent: 0, skipped: 0 };
  const now = new Date();
  const rows = await db.select().from(celebrations);
  let sent = 0;
  let skipped = 0;
  for (const c of rows) {
    const daysBefore = c.reminderDaysBefore ?? 30;
    const remindAt = new Date(c.celebrationDate);
    remindAt.setDate(remindAt.getDate() - daysBefore);
    const alreadySent =
      c.lastReminderSentAt != null &&
      c.lastReminderSentAt.getTime() > remindAt.getTime() - 24 * 3600 * 1000;
    if (now >= remindAt && now <= c.celebrationDate && !alreadySent) {
      if (dryRun) { sent++; continue; }
      const advisorId = await resolveAdvisor(c.memberId);
      const [member] = await db
        .select({ name: members.name })
        .from(members)
        .where(eq(members.id, c.memberId));
      await db.insert(notifications).values({
        recipientType: "user",
        recipientUserId: advisorId,
        type: "system",
        title: `Celebration reminder: ${c.title}`,
        body: `${member?.name ?? "A member"}'s ${c.celebrationType} "${c.title}" is on ${c.celebrationDate.toISOString().slice(0, 10)}. Plan a thoughtful gesture.`,
        resourceType: "celebration",
        resourceId: c.id,
        actionUrl: `/members/${c.memberId}`,
        isRead: false,
      });
      await db
        .update(celebrations)
        .set({ lastReminderSentAt: new Date(), updatedAt: new Date() })
        .where(eq(celebrations.id, c.id));
      sent++;
    } else {
      skipped++;
    }
  }
  return { sent, skipped };
}

export async function runNpsFollowUps(dryRun = false): Promise<{ sent: number; skipped: number }> {
  const db = await getDb();
  if (!db) return { sent: 0, skipped: 0 };
  const due = await db
    .select()
    .from(npsResponses)
    .where(and(eq(npsResponses.followUpRequired, true), isNull(npsResponses.followedUpAt)));
  let sent = 0;
  let skipped = 0;
  for (const r of due) {
    if (dryRun) { sent++; continue; }
    const advisorId = await resolveAdvisor(r.memberId);
    const [member] = await db
      .select({ name: members.name })
      .from(members)
      .where(eq(members.id, r.memberId));
    await db.insert(notifications).values({
      recipientType: "user",
      recipientUserId: advisorId,
      type: "system",
      title: `NPS follow-up needed: ${member?.name ?? "A member"}`,
      body: `Detractor score ${r.score}/10.${r.feedback ? ` Feedback: "${r.feedback}"` : ""} Please reach out personally.`,
      resourceType: "nps",
      resourceId: r.id,
      actionUrl: `/members/${r.memberId}`,
      isRead: false,
    });
    await db
      .update(npsResponses)
      .set({ followedUpAt: new Date(), followedUpByUserId: advisorId ?? undefined })
      .where(eq(npsResponses.id, r.id));
    sent++;
  }
  return { sent, skipped };
}
