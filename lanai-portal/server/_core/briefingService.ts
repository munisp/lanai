/**
 * Morning briefing generator (SR-600 companion to the advisor dashboard).
 *
 * The scheduler calls tickBriefing() every 60 seconds. The brief is only
 * (re)generated during the configured BRIEFING_HOUR (default 6am local),
 * which keeps the advisor's morning view fresh without churning the table
 * all day. The date-keyed upsert makes the brief idempotent: re-running the
 * same hour overwrites the same row with the latest content, never creates
 * duplicates, and never throws on the scheduler thread.
 *
 * All source rows are read straight from PostgreSQL projections that are
 * already durable (chatwoot_messages, communication_timeline, advisor_tasks,
 * members). A failure to compute any single section degrades to an empty
 * section rather than aborting the whole brief, so a transient schema gap
 * can never blank the advisor's morning view.
 */
import { and, eq, gt, gte, isNotNull, lt, lte, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  advisorTasks,
  chatwootConversations,
  chatwootMessages,
  communicationTimeline,
  members,
  morningBriefings,
  slaTimers,
  users,
} from "../../drizzle/schema";

const BODY_MAX = 20_000;
const OVERNIGHT_WINDOW_HOURS = 20;
const FOLLOW_UP_HORIZON_HOURS = 48;
const STALLED_TASK_DAYS = 3;
const SECTION_CAP = 10;

type UrgentItem = {
  kind: "overnight_message";
  chatwootId: string;
  memberName: string | null;
  preview: string;
  createdAt: string;
};

type OvernightMessage = {
  chatwootId: string;
  conversationId: number;
  memberName: string | null;
  preview: string;
  createdAt: Date;
};

type FollowUp = {
  id: number;
  memberName: string | null;
  subject: string | null;
  dueAt: Date | null;
};

type Birthday = {
  id: number;
  name: string;
};

type StalledTask = {
  id: number;
  title: string;
  daysStalled: number;
};

export interface BriefingItems {
  headline: string;
  body: string;
  urgentItems: UrgentItem[];
}

/** Configured generation hour (0-23). Invalid input falls back to 6. */
export function briefingHour(): number {
  const parsed = Number(process.env.BRIEFING_HOUR ?? "6");
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 23) return 6;
  return parsed;
}

/** True when the given timestamp is inside the configured briefing hour. */
export function isBriefingTime(now: Date): boolean {
  return now.getHours() === briefingHour();
}

/** Compute the briefing sections from durable projections. Never throws. */
export async function buildBriefingItems(
  now: Date = new Date(),
): Promise<BriefingItems> {
  const since = new Date(now.getTime() - OVERNIGHT_WINDOW_HOURS * 60 * 60 * 1000);
  const followUpHorizon = new Date(
    now.getTime() + FOLLOW_UP_HORIZON_HOURS * 60 * 60 * 1000,
  );
  const stalledBefore = new Date(
    now.getTime() - STALLED_TASK_DAYS * 24 * 60 * 60 * 1000,
  );

  const [overnight, followUps, birthdays, stalled, urgentConversationIds] =
    await Promise.all([
      fetchOvernightMessages(since, now).catch((err) => {
        console.error(
          "[briefing] overnight messages failed:",
          err instanceof Error ? err.message : String(err),
        );
        return [] as OvernightMessage[];
      }),
      fetchFollowUps(now, followUpHorizon).catch((err) => {
        console.error(
          "[briefing] follow-ups failed:",
          err instanceof Error ? err.message : String(err),
        );
        return [] as FollowUp[];
      }),
      fetchBirthdays(now).catch((err) => {
        console.error(
          "[briefing] birthdays failed:",
          err instanceof Error ? err.message : String(err),
        );
        return [] as Birthday[];
      }),
      fetchStalledTasks(stalledBefore).catch((err) => {
        console.error(
          "[briefing] stalled tasks failed:",
          err instanceof Error ? err.message : String(err),
        );
        return [] as StalledTask[];
      }),
      fetchUrgentConversationIds().catch((err) => {
        console.error(
          "[briefing] urgent SLA lookup failed:",
          err instanceof Error ? err.message : String(err),
        );
        return new Set<number>();
      }),
    ]);

  const urgentSet = urgentConversationIds;
  const urgentItems: UrgentItem[] = [];
  const bodyOvernight: OvernightMessage[] = [];
  for (const msg of overnight) {
    const item: UrgentItem = {
      kind: "overnight_message",
      chatwootId: msg.chatwootId,
      memberName: msg.memberName,
      preview: msg.preview,
      createdAt: msg.createdAt.toISOString(),
    };
    // A message is urgent when its conversation has an open SLA timer flagged
    // urgent. We do not store urgency on the message itself, so the SLA timer
    // is the single source of truth.
    if (urgentSet.has(extractConversationId(msg))) {
      urgentItems.push(item);
    } else {
      bodyOvernight.push(msg);
    }
  }

  const headline = composeHeadline({
    overnightCount: overnight.length,
    followUpCount: followUps.length,
    birthdayCount: birthdays.length,
    stalledCount: stalled.length,
    urgentCount: urgentItems.length,
    now,
  });

  const body = composeBody({
    urgentItems,
    overnight: bodyOvernight,
    followUps,
    birthdays,
    stalled,
    now,
  });

  return { headline, body: body.slice(0, BODY_MAX), urgentItems };
}

/**
 * Scheduler entry point. Called every 60s. Returns created/skipped so the
 * scheduler can surface what happened. Never throws: every error is logged
 * under "[briefing] tick failed" and reported as skipped so the scheduler
 * loop keeps running.
 */
export async function tickBriefing(): Promise<{
  created: boolean;
  skipped: boolean;
}> {
  try {
    const now = new Date();
    if (!isBriefingTime(now)) return { created: false, skipped: true };

    const items = await buildBriefingItems(now);
    const todayKey = now.toISOString().slice(0, 10);
    const generatedByUserId = await resolveAdminUserId().catch(() => null);

    const db = await getDb();
    await db
      .insert(morningBriefings)
      .values({
        date: todayKey,
        generatedByUserId,
        headline: items.headline.slice(0, 512),
        body: items.body,
        urgentItems: items.urgentItems,
        opportunities: [],
        model: null,
      })
      .onConflictDoUpdate({
        target: morningBriefings.date,
        set: {
          generatedByUserId,
          headline: items.headline.slice(0, 512),
          body: items.body,
          urgentItems: items.urgentItems,
          opportunities: [],
          model: null,
          createdAt: new Date(),
        },
      });

    return { created: true, skipped: false };
  } catch (error) {
    console.error(
      "[briefing] tick failed:",
      error instanceof Error ? error.message : String(error),
    );
    return { created: false, skipped: true };
  }
}

// ─── Section fetchers ─────────────────────────────────────────────────────────

async function fetchOvernightMessages(
  since: Date,
  now: Date,
): Promise<OvernightMessage[]> {
  const db = await getDb();
  const rows = await db
    .select({
      chatwootId: chatwootMessages.chatwootId,
      content: chatwootMessages.content,
      transcription: chatwootMessages.transcription,
      createdAt: chatwootMessages.createdAt,
      conversationId: chatwootMessages.conversationId,
      memberName: members.name,
      contactName: chatwootConversations.contactName,
    })
    .from(chatwootMessages)
    .innerJoin(
      chatwootConversations,
      eq(chatwootMessages.conversationId, chatwootConversations.id),
    )
    .leftJoin(members, eq(chatwootConversations.memberId, members.id))
    .where(
      and(
        eq(chatwootMessages.messageType, "inbound"),
        gte(chatwootMessages.createdAt, since),
        lt(chatwootMessages.createdAt, now),
      ),
    )
    .orderBy(chatwootMessages.createdAt)
    .limit(50);

  return rows.map((r) => ({
    chatwootId: r.chatwootId,
    conversationId: r.conversationId,
    memberName: r.memberName ?? r.contactName ?? null,
    preview: (r.transcription || r.content || "").slice(0, 280),
    createdAt: r.createdAt,
  }));
}

async function fetchFollowUps(
  now: Date,
  horizon: Date,
): Promise<FollowUp[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: communicationTimeline.id,
      memberId: communicationTimeline.memberId,
      subject: communicationTimeline.subject,
      followUpDueAt: communicationTimeline.followUpDueAt,
      memberName: members.name,
    })
    .from(communicationTimeline)
    .leftJoin(members, eq(communicationTimeline.memberId, members.id))
    .where(
      and(
        eq(communicationTimeline.followUpRequired, true),
        lte(communicationTimeline.followUpDueAt, horizon),
        // Only due items, including ones already past due.
        gt(communicationTimeline.followUpDueAt, new Date(0)),
      ),
    )
    .orderBy(communicationTimeline.followUpDueAt)
    .limit(SECTION_CAP);

  return rows.map((r) => ({
    id: r.id,
    memberName: r.memberName ?? null,
    subject: r.subject ?? null,
    dueAt: r.followUpDueAt ?? null,
  }));
}

async function fetchBirthdays(now: Date): Promise<Birthday[]> {
  const db = await getDb();
  // Fetch all members with a date of birth, then filter month/day in JS. The
  // pilot member count is small, so a full scan is cheaper than adding a
  // functional index for a once-per-day query.
  const rows = await db
    .select({ id: members.id, name: members.name, dateOfBirth: members.dateOfBirth })
    .from(members)
    .where(isNotNull(members.dateOfBirth));

  const month = now.getMonth() + 1;
  const day = now.getDate();
  const matches: Birthday[] = [];
  for (const r of rows) {
    if (!r.dateOfBirth) continue;
    if (r.dateOfBirth.getMonth() + 1 === month && r.dateOfBirth.getDate() === day) {
      matches.push({ id: r.id, name: r.name });
    }
  }
  return matches.slice(0, SECTION_CAP);
}

async function fetchStalledTasks(stalledBefore: Date): Promise<StalledTask[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: advisorTasks.id,
      title: advisorTasks.title,
      updatedAt: advisorTasks.updatedAt,
    })
    .from(advisorTasks)
    .where(
      and(
        eq(advisorTasks.status, "open"),
        lt(advisorTasks.updatedAt, stalledBefore),
      ),
    )
    .orderBy(advisorTasks.updatedAt)
    .limit(SECTION_CAP);

  const now = Date.now();
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    daysStalled: Math.max(
      1,
      Math.floor((now - r.updatedAt.getTime()) / (24 * 60 * 60 * 1000)),
    ),
  }));
}

async function fetchUrgentConversationIds(): Promise<Set<number>> {
  const db = await getDb();
  const rows = await db
    .select({ conversationId: slaTimers.conversationId })
    .from(slaTimers)
    .where(
      and(
        eq(slaTimers.urgency, "urgent"),
        // Open timer: no first response yet.
        sql`${slaTimers.firstResponseAt} IS NULL`,
      ),
    );
  return new Set(rows.map((r) => r.conversationId).filter((id): id is number => id != null));
}

async function resolveAdminUserId(): Promise<number | null> {
  const db = await getDb();
  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"))
    .orderBy(users.id)
    .limit(1);
  return admin?.id ?? null;
}

// ─── Composition helpers ──────────────────────────────────────────────────────

function extractConversationId(msg: OvernightMessage): number {
  return msg.conversationId;
}

function composeHeadline(input: {
  overnightCount: number;
  followUpCount: number;
  birthdayCount: number;
  stalledCount: number;
  urgentCount: number;
  now: Date;
}): string {
  const dateLabel = input.now.toISOString().slice(0, 10);
  const parts: string[] = [];
  if (input.urgentCount > 0) {
    parts.push(`${input.urgentCount} urgent`);
  }
  if (input.overnightCount > 0) {
    parts.push(`${input.overnightCount} overnight messages`);
  }
  if (input.followUpCount > 0) {
    parts.push(`${input.followUpCount} follow-ups due`);
  }
  if (input.birthdayCount > 0) {
    parts.push(`${input.birthdayCount} birthdays`);
  }
  if (input.stalledCount > 0) {
    parts.push(`${input.stalledCount} stalled tasks`);
  }
  const summary = parts.length > 0 ? parts.join(", ") : "no actionable items";
  return `Morning brief for ${dateLabel}: ${summary}`.slice(0, 512);
}

function composeBody(input: {
  urgentItems: UrgentItem[];
  overnight: OvernightMessage[];
  followUps: FollowUp[];
  birthdays: Birthday[];
  stalled: StalledTask[];
  now: Date;
}): string {
  const lines: string[] = [];
  const dateLabel = input.now.toISOString().slice(0, 10);
  lines.push(`Morning brief - ${dateLabel}`);
  lines.push("");

  lines.push("URGENT");
  if (input.urgentItems.length === 0) {
    lines.push("  None.");
  } else {
    for (const u of input.urgentItems.slice(0, SECTION_CAP)) {
      const who = u.memberName ?? "Unknown member";
      lines.push(`  - [${u.chatwootId}] ${who}: ${u.preview}`);
    }
  }
  lines.push("");

  lines.push("OVERNIGHT INBOUND MESSAGES");
  if (input.overnight.length === 0) {
    lines.push("  None in the last 20 hours.");
  } else {
    for (const m of input.overnight.slice(0, SECTION_CAP)) {
      const who = m.memberName ?? "Unknown member";
      const when = m.createdAt.toISOString();
      lines.push(`  - [${m.chatwootId}] ${who} (${when}): ${m.preview}`);
    }
  }
  lines.push("");

  lines.push("FOLLOW-UPS DUE (next 48h)");
  if (input.followUps.length === 0) {
    lines.push("  None due.");
  } else {
    for (const f of input.followUps.slice(0, SECTION_CAP)) {
      const who = f.memberName ?? "Unknown member";
      const when = f.dueAt ? f.dueAt.toISOString() : "no due date";
      const subject = f.subject ?? "(no subject)";
      lines.push(`  - #${f.id} ${who} due ${when}: ${subject}`);
    }
  }
  lines.push("");

  lines.push("BIRTHDAYS TODAY");
  if (input.birthdays.length === 0) {
    lines.push("  None today.");
  } else {
    for (const b of input.birthdays.slice(0, SECTION_CAP)) {
      lines.push(`  - ${b.name}`);
    }
  }
  lines.push("");

  lines.push("STALLED OPEN TASKS (>3 days)");
  if (input.stalled.length === 0) {
    lines.push("  None stalled.");
  } else {
    for (const s of input.stalled.slice(0, SECTION_CAP)) {
      lines.push(`  - #${s.id} (${s.daysStalled}d): ${s.title}`);
    }
  }

  return lines.join("\n");
}
