/**
 * SLA timers for member conversations (SR-501).
 *
 * A timer opens when triage classifies an inbound member message (urgent or
 * ordinary), runs per conversation, and closes when an advisor sends the
 * first outbound reply. The scheduler tick warns at mid-window (stamping
 * breachWarnedAt once), and at window end raises a deduped advisor alert
 * task. Sending stays human-only; the SLA engine never sends anything.
 */
import { and, eq, isNull, asc } from "drizzle-orm";
import { getDb } from "../db";
import {
  advisorTasks,
  chatwootConversations,
  members,
  users,
  slaTimers,
} from "../../drizzle/schema";
import type { TriageUrgency } from "../triageService";

/** Urgent: 40 minute response window, warn at 20 minutes. */
const URGENT_WINDOW_MIN = 40;
const URGENT_WARN_MIN = 20;
/** Ordinary: 6 hour response window, warn at 3 hours. */
const ORDINARY_WINDOW_MIN = 360;
const ORDINARY_WARN_MIN = 180;

export type SlaWindows = { windowMs: number; warnMs: number };

/**
 * Resolve the warn and breach windows for a given urgency. Unknown urgency
 * is treated as ordinary so a bad value can never silently shorten a timer.
 */
export function slaWindowsFor(urgency: string): SlaWindows {
  if (urgency === "urgent") {
    return {
      windowMs: URGENT_WINDOW_MIN * 60_000,
      warnMs: URGENT_WARN_MIN * 60_000,
    };
  }
  return {
    windowMs: ORDINARY_WINDOW_MIN * 60_000,
    warnMs: ORDINARY_WARN_MIN * 60_000,
  };
}

/**
 * Open an SLA timer for a conversation. Idempotent: if an open timer already
 * exists for this conversation (firstResponseAt IS NULL) the call is a no-op.
 * Never throws; any failure is logged and swallowed so a triage pipeline
 * can never be blocked by the SLA side-effect.
 */
export async function openSlaTimer(
  conversationId: number,
  urgency: TriageUrgency,
): Promise<void> {
  try {
    const db = await getDb();
    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: slaTimers.id })
        .from(slaTimers)
        .where(
          and(
            eq(slaTimers.conversationId, conversationId),
            isNull(slaTimers.firstResponseAt),
          ),
        )
        .limit(1);
      if (existing) return;
      await tx.insert(slaTimers).values({
        conversationId,
        urgency,
        openedAt: new Date(),
      });
    });
  } catch (error) {
    console.error(
      "[sla] openSlaTimer failed",
      conversationId,
      error instanceof Error ? error.message : "unknown",
    );
  }
}

/**
 * Stamp firstResponseAt on the open timer for a conversation. Idempotent: only
 * sets it when null. Never throws so a reply path can never break on SLA.
 */
export async function recordFirstResponse(
  conversationId: number,
): Promise<void> {
  try {
    const db = await getDb();
    await db
      .update(slaTimers)
      .set({ firstResponseAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(slaTimers.conversationId, conversationId),
          isNull(slaTimers.firstResponseAt),
        ),
      );
  } catch (error) {
    console.error(
      "[sla] recordFirstResponse failed",
      conversationId,
      error instanceof Error ? error.message : "unknown",
    );
  }
}

/**
 * Sweep open timers, stamp breachWarnedAt once at the warn threshold, and
 * raise a deduped advisor task for any timer that has breached its window.
 * Returns counts of warnings and breaches processed in this tick.
 */
export async function tickSlaTimers(): Promise<{
  warned: number;
  breached: number;
}> {
  let warned = 0;
  let breached = 0;
  try {
    const db = await getDb();
    const openTimers = await db
      .select()
      .from(slaTimers)
      .where(isNull(slaTimers.firstResponseAt))
      .orderBy(asc(slaTimers.openedAt));
    const now = Date.now();
    for (const timer of openTimers) {
      const windows = slaWindowsFor(timer.urgency);
      const openedMs = timer.openedAt.getTime();
      const elapsed = now - openedMs;
      if (elapsed >= windows.warnMs && timer.breachWarnedAt === null) {
        try {
          await db
            .update(slaTimers)
            .set({ breachWarnedAt: new Date(), updatedAt: new Date() })
            .where(
              and(
                eq(slaTimers.id, timer.id),
                isNull(slaTimers.breachWarnedAt),
              ),
            );
          warned += 1;
        } catch (error) {
          console.error(
            "[sla] tick warn stamp failed",
            timer.id,
            error instanceof Error ? error.message : "unknown",
          );
        }
      }
      if (elapsed >= windows.windowMs) {
        const created = await createBreachTask(timer);
        if (created) breached += 1;
      }
    }
  } catch (error) {
    console.error(
      "[sla] tickSlaTimers failed",
      error instanceof Error ? error.message : "unknown",
    );
  }
  return { warned, breached };
}

/**
 * Raise a deduped advisor task for a breached timer. Dedupe is via
 * automationKey `sla_breach:timer_<id>` with onConflictDoNothing, so a
 * repeated tick never creates a second task for the same timer.
 */
async function createBreachTask(timer: {
  id: number;
  conversationId: number | null;
  urgency: "ordinary" | "urgent";
  openedAt: Date;
}): Promise<boolean> {
  try {
    const db = await getDb();
    if (!timer.conversationId) {
      console.error(
        "[sla] createBreachTask skipped, no conversation",
        timer.id,
      );
      return false;
    }
    const [conv] = await db
      .select({ memberId: chatwootConversations.memberId })
      .from(chatwootConversations)
      .where(eq(chatwootConversations.id, timer.conversationId))
      .limit(1);
    const memberId = conv?.memberId ?? null;
    const ownerId = memberId ? await resolveAdvisorForMember(memberId) : null;
    if (!ownerId) {
      console.error(
        "[sla] createBreachTask skipped, no owner resolved",
        timer.id,
      );
      return false;
    }
    const memberName = await resolveMemberName(memberId);
    const description =
      `SLA breach for member ${memberName} (id ${memberId ?? "unknown"}), ` +
      `conversation ${timer.conversationId}, urgency ${timer.urgency}, ` +
      `opened at ${timer.openedAt.toISOString()}. ` +
      `Advisor first response is overdue; review and reply.`;
    await db
      .insert(advisorTasks)
      .values({
        assignedToUserId: ownerId,
        memberId: memberId ?? undefined,
        automationKey: `sla_breach:timer_${timer.id}`,
        title: "SLA breach: member response overdue",
        description,
        status: "open",
        priority: "high",
      })
      .onConflictDoNothing({ target: advisorTasks.automationKey });
    return true;
  } catch (error) {
    console.error(
      "[sla] createBreachTask failed",
      timer.id,
      error instanceof Error ? error.message : "unknown",
    );
    return false;
  }
}

async function resolveMemberName(memberId: number | null): Promise<string> {
  if (!memberId) return "unknown";
  try {
    const db = await getDb();
    const [member] = await db
      .select({ name: members.name })
      .from(members)
      .where(eq(members.id, memberId))
      .limit(1);
    return member?.name ?? "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Resolve the advisor who owns a member: the member's assignedAdvisorId, with
 * a fallback to the first admin user. Mirrors server/triageService.ts so SLA
 * breach routing matches triage alert routing.
 */
async function resolveAdvisorForMember(
  memberId: number,
): Promise<number | null> {
  const db = await getDb();
  const [member] = await db
    .select({ assignedAdvisorId: members.assignedAdvisorId })
    .from(members)
    .where(eq(members.id, memberId))
    .limit(1);
  if (member?.assignedAdvisorId) return member.assignedAdvisorId;
  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"))
    .orderBy(asc(users.id))
    .limit(1);
  return admin?.id ?? null;
}
