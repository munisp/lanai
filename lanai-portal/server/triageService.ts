/**
 * AI triage for inbound captured messages (SR-300/SR-301).
 *
 * Runs fire-and-forget AFTER the webhook delivery is durably committed, the
 * same way voice transcription does: the message row always exists first, so
 * a triage failure can never lose a message. Every triage is recorded as an
 * ai_inference_runs row with the deterministic requestId "triage:msg_<id>",
 * which doubles as the idempotency key (SR-1002). Bounded retry, then a
 * deduped advisor task so the advisor sees the failure instead of silence.
 * Grounding rules (SR-304) and calibration examples (SR-303) live in the
 * prompt; the model may only use supplied content and member facts.
 */
import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import {
  advisorTasks,
  aiInferenceRuns,
  chatwootConversations,
  chatwootMessages,
  members,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { invokeLocalAi } from "./_core/localAi";

type JsonRecord = Record<string, unknown>;

export type TriageUrgency = "urgent" | "ordinary";
export type TriageSentiment = "positive" | "neutral" | "negative" | "complaint";

export type TriageResult = {
  intent: string;
  urgency: TriageUrgency;
  sentiment: TriageSentiment;
  summary: string;
  tags: string[];
  draft_reply: string;
};

const TRIAGE_TIMEOUT_MS = 55_000;
const MAX_TAGS = 8;

export function triageRequestId(chatwootMessageId: string): string {
  return `triage:${chatwootMessageId}`.slice(0, 64);
}

/** True when this payload is an inbound member message worth triaging. */
export function isInboundTriageCandidate(payload: JsonRecord): boolean {
  const messageType = payload.message_type;
  return messageType === "incoming" || messageType === 0;
}

/** Coerce raw model output into a valid TriageResult, or null. */
export function parseTriage(raw: unknown): TriageResult | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, max: number) =>
    typeof v === "string" && v.trim().length > 0 ? v.trim().slice(0, max) : null;
  const intent = str(r.intent, 200);
  const summary = str(r.summary, 2_000);
  const draftReply = str(r.draft_reply, 4_000);
  if (!intent || !summary || !draftReply) return null;
  const urgency: TriageUrgency = r.urgency === "urgent" ? "urgent" : "ordinary";
  const sentiment: TriageSentiment =
    r.sentiment === "positive" ||
    r.sentiment === "neutral" ||
    r.sentiment === "negative" ||
    r.sentiment === "complaint"
      ? r.sentiment
      : "neutral";
  const tags = Array.isArray(r.tags)
    ? r.tags
        .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
        .map((t) => t.trim().slice(0, 32))
        .slice(0, MAX_TAGS)
    : [];
  return { intent, urgency, sentiment, summary, tags, draft_reply: draftReply };
}

function triageSystemPrompt(): string {
  return [
    "You are the concierge triage assistant for Lanai Lifestyle. Triage an inbound member message.",
    "GROUNDING RULES: Use only the supplied message content and member facts. Do not fabricate bookings, dates, prices, or promises. If something is unstated, leave it out rather than guessing.",
    'Return ONLY JSON: {"intent":string,"urgency":"urgent"|"ordinary","sentiment":"positive"|"neutral"|"negative"|"complaint","summary":string,"tags":[string],"draft_reply":string}.',
    "URGENT means the member is stranded, something is happening today or imminently, or an existing plan is collapsing (cancellation, no reservation found, missed connection). Routine planning requests are ordinary.",
    "sentiment is complaint when the member expresses dissatisfaction with service received, not merely an urgent problem.",
    "draft_reply is a warm, professional holding-style reply an advisor could send; never promise a specific outcome, refund, or booking.",
    "Calibration examples:",
    '1. "My flight home was cancelled and the hotel says they cannot find my reservation either." -> urgency urgent, sentiment negative, intent travel_disruption.',
    '2. "Can you book us a table for four tonight?" -> urgency urgent (same-day), sentiment neutral, intent dining_reservation.',
    '3. "We want tickets for the gala this weekend if any are left." -> urgency ordinary, sentiment neutral, intent event_tickets.',
    '4. "The hotel cannot find our group booking and check-in is in two hours." -> urgency urgent, sentiment complaint, intent group_booking_issue.',
    '5. "Thank you for the wonderful itinerary, we loved the chef experience." -> urgency ordinary, sentiment positive, intent feedback.',
  ].join("\n");
}

/**
 * Best-effort triage for one inbound Chatwoot message. Never throws.
 * Idempotent per chatwoot message via the deterministic run requestId.
 */
export async function processTriage(payload: JsonRecord): Promise<void> {
  const messageId = Number(payload.id);
  if (!Number.isInteger(messageId) || messageId <= 0) return;
  if (!isInboundTriageCandidate(payload)) return;
  const chatwootMessageId = `msg_${messageId}`;

  try {
    const db = await getDb();
    const [row] = await db
      .select({
        id: chatwootMessages.id,
        content: chatwootMessages.content,
        transcription: chatwootMessages.transcription,
        conversationId: chatwootMessages.conversationId,
      })
      .from(chatwootMessages)
      .where(eq(chatwootMessages.chatwootId, chatwootMessageId))
      .limit(1);
    // Row-first: no mirror row means the projection skipped this delivery.
    if (!row) return;

    const [conversation] = await db
      .select({ memberId: chatwootConversations.memberId })
      .from(chatwootConversations)
      .where(eq(chatwootConversations.id, row.conversationId))
      .limit(1);
    if (!conversation?.memberId) return;

    const content = (row.transcription?.trim() || row.content || "").trim();
    if (!content) return;

    // Idempotency gate: claim the deterministic run row. If it already
    // exists, this message has been (or is being) triaged.
    const requestId = triageRequestId(chatwootMessageId);
    const [claim] = await db
      .insert(aiInferenceRuns)
      .values({
        requestId,
        capability: "intelligence",
        provider: "ollama",
        model: ENV.aiModel,
        memberId: conversation.memberId,
        inputDigest: sha256(content),
        inputMetadata: { feature: "message_triage", chatwootMessageId },
        status: "running",
      })
      .onConflictDoNothing({ target: aiInferenceRuns.requestId })
      .returning({ id: aiInferenceRuns.id });
    if (!claim) return;

    const facts = await buildMemberFacts(conversation.memberId);
    const startedAt = Date.now();
    let triage: TriageResult | null = null;
    let lastError: string | null = null;
    for (let attempt = 0; attempt < 2 && !triage; attempt += 1) {
      try {
        const result = await withTimeout(
          invokeLocalAi({
            capability: "intelligence",
            responseFormat: "json",
            system: triageSystemPrompt(),
            prompt: JSON.stringify({ member_facts: facts, message: content.slice(0, 8_000) }),
            temperature: 0.1,
            maxTokens: 900,
            metadata: { feature: "message_triage", chatwootMessageId, attempt },
          }),
          TRIAGE_TIMEOUT_MS,
        );
        triage = parseTriage(result.structured ?? null);
        if (!triage) lastError = "triage output failed schema validation";
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }

    if (!triage) {
      await db
        .update(aiInferenceRuns)
        .set({
          status: "failed",
          error: (lastError ?? "triage failed").slice(0, 2_000),
          latencyMs: Date.now() - startedAt,
          completedAt: new Date(),
        })
        .where(eq(aiInferenceRuns.id, claim.id));
      await flagTriageFailure(conversation.memberId, chatwootMessageId, lastError ?? "unknown");
      return;
    }

    await db
      .update(aiInferenceRuns)
      .set({
        status: "succeeded",
        latencyMs: Date.now() - startedAt,
        outputMetadata: { triage },
        completedAt: new Date(),
      })
      .where(eq(aiInferenceRuns.id, claim.id));

    if (triage.urgency === "urgent" || triage.sentiment === "complaint") {
      await createTriageAlertTask(conversation.memberId, chatwootMessageId, triage);
    }
  } catch (error) {
    console.error(
      "[triage] pipeline failed for",
      `msg_${messageId}`,
      error instanceof Error ? error.message : "unknown",
    );
  }
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`triage timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Small grounded facts bundle (SR-304). Deliberately excludes any sensitive
 * identity or payment data (SR-204). */
async function buildMemberFacts(memberId: number): Promise<Record<string, unknown>> {
  const db = await getDb();
  const [member] = await db
    .select({
      name: members.name,
      tier: members.tier,
      nationality: members.nationality,
      dietaryRequirements: members.dietaryRequirements,
      accessibilityNeeds: members.accessibilityNeeds,
      notes: members.notes,
    })
    .from(members)
    .where(eq(members.id, memberId))
    .limit(1);
  return member ?? {};
}

async function createTriageAlertTask(
  memberId: number,
  chatwootMessageId: string,
  triage: TriageResult,
): Promise<void> {
  const ownerId = await resolveAdvisorForMember(memberId);
  if (!ownerId) return;
  const key =
    triage.urgency === "urgent"
      ? `triage_urgent:${chatwootMessageId}`
      : `triage_complaint:${chatwootMessageId}`;
  const db = await getDb();
  await db
    .insert(advisorTasks)
    .values({
      assignedToUserId: ownerId,
      memberId,
      automationKey: key,
      title:
        triage.urgency === "urgent"
          ? `URGENT: ${triage.summary.slice(0, 180)}`
          : `Complaint: ${triage.summary.slice(0, 180)}`,
      description: `AI triage flagged message ${chatwootMessageId} (intent: ${triage.intent}, sentiment: ${triage.sentiment}). Review in the triage inbox and respond; sending is human-only.`,
      status: "open",
      priority: triage.urgency === "urgent" ? "high" : "medium",
    })
    .onConflictDoNothing({ target: advisorTasks.automationKey });
}

async function flagTriageFailure(
  memberId: number,
  chatwootMessageId: string,
  errorText: string,
): Promise<void> {
  const ownerId = await resolveAdvisorForMember(memberId);
  if (!ownerId) return;
  const db = await getDb();
  await db
    .insert(advisorTasks)
    .values({
      assignedToUserId: ownerId,
      memberId,
      automationKey: `triage_failed:${chatwootMessageId}`,
      title: "Review: AI triage failed",
      description: `AI triage could not process message ${chatwootMessageId}: ${errorText.slice(0, 500)}. The original message is intact; triage it manually from the triage inbox.`,
      status: "open",
      priority: "high",
    })
    .onConflictDoNothing({ target: advisorTasks.automationKey });
}

async function resolveAdvisorForMember(memberId: number): Promise<number | null> {
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
    .where(and(eq(users.role, "admin")))
    .orderBy(users.id)
    .limit(1);
  return admin?.id ?? null;
}