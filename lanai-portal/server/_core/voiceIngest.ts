/**
 * Voice-note transcription for the capture pipeline (SR-102).
 *
 * Called fire-and-forget AFTER the webhook delivery is durably committed, so
 * the whisper call never holds a database transaction open and a failure can
 * never lose the message: the message row exists first, transcription only
 * enriches it, and every failure path lands the message in the review queue
 * via a transcription-failed advisor task.
 */
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import {
  advisorTasks,
  chatwootConversations,
  chatwootMessages,
  members,
  users,
} from "../../drizzle/schema";
import {
  extractAudioAttachment,
  downloadAudioForTranscription,
} from "./chatwootMedia";
import { transcribeFromBuffer } from "./voiceTranscription";

type JsonRecord = Record<string, unknown>;

/** True when this payload is an inbound member message carrying attachments. */
export function isInboundVoiceCandidate(payload: JsonRecord): boolean {
  const messageType = payload.message_type;
  const inbound = messageType === "incoming" || messageType === 0;
  return inbound && Array.isArray(payload.attachments);
}

/**
 * Best-effort transcription for one inbound Chatwoot message. Never throws:
 * errors are persisted onto the message row and surfaced as a review task.
 */
export async function processVoiceTranscription(payload: JsonRecord): Promise<void> {
  const messageId = Number(payload.id);
  if (!Number.isInteger(messageId) || messageId <= 0) return;
  const chatwootMessageId = `msg_${messageId}`;

  try {
    if (!isInboundVoiceCandidate(payload)) return;

    // Only enrich messages the projection actually persisted: no mirror row,
    // no orphan download or transcription work.
    const db = await getDb();
    const [row] = await db
      .select({ id: chatwootMessages.id, attachmentUrl: chatwootMessages.attachmentUrl })
      .from(chatwootMessages)
      .where(eq(chatwootMessages.chatwootId, chatwootMessageId))
      .limit(1);
    if (!row) return;

    const attachment = extractAudioAttachment(payload);
    if (!attachment) return;

    const download = await downloadAudioForTranscription(attachment);
    if ("error" in download) {
      await flagTranscriptionFailure(chatwootMessageId, download.error);
      return;
    }

    const filename = attachment.filename.split("/").pop() || "voice-note.ogg";
    const transcription = await transcribeFromBuffer(
      download.buffer,
      attachment.filename,
      { language: "en" },
    );

    if ("error" in transcription) {
      // One retry: transient model hiccups should not lose the transcript.
      // The bytes are already in hand, so the retry is local and cheap.
      const retried = await transcribeFromBuffer(download.buffer, attachment.filename, {
        language: "en",
      });
      if ("error" in retried) {
        await flagTranscriptionFailure(chatwootMessageId, retried.error);
        return;
      }
      await persistTranscript(chatwootMessageId, retried.text ?? "");
      return;
    }

    await persistTranscript(chatwootMessageId, transcription.text ?? "");
  } catch (error) {
    // Never crash the caller: the webhook already returned 200 and the
    // message row is durable. Failures below are enrichment failures.
    console.error(
      "[voice-ingest] transcription pipeline failed messageId=",
      messageId,
      error instanceof Error ? error.message : "unknown",
    );
    await flagTranscriptionFailure(chatwootMessageId, "transcription pipeline error").catch(
      () => undefined,
    );
  }
}

async function persistTranscript(chatwootMessageId: string, transcript: string): Promise<void> {
  const db = await getDb();
  await db
    .update(chatwootMessages)
    .set({
      transcription: transcript.slice(0, 20_000),
      transcriptionStatus: "transcribed",
      transcriptionError: null,
    })
    .where(eq(chatwootMessages.chatwootId, chatwootMessageId));
}

/**
 * Persist the failure state and create (idempotently) a review task so a
 * corrupted or oversized voice note is visible to the advisor, never silent.
 */
async function flagTranscriptionFailure(
  chatwootMessageId: string,
  errorText: string,
): Promise<void> {
  const db = await getDb();
  await db
    .update(chatwootMessages)
    .set({
      transcription: null,
      transcriptionStatus: "failed",
      transcriptionError: errorText.slice(0, 2_000),
    })
    .where(eq(chatwootMessages.chatwootId, chatwootMessageId));

  const [message] = await db
    .select({ conversationId: chatwootMessages.conversationId })
    .from(chatwootMessages)
    .where(eq(chatwootMessages.chatwootId, chatwootMessageId))
    .limit(1);
  if (!message) return;

  const [conversation] = await db
    .select({ memberId: chatwootConversations.memberId })
    .from(chatwootConversations)
    .where(eq(chatwootConversations.id, message.conversationId))
    .limit(1);
  if (!conversation?.memberId) return;

  const ownerId = await resolveAdvisorForMember(conversation.memberId);
  if (!ownerId) return;

  await db
    .insert(advisorTasks)
    .values({
      assignedToUserId: ownerId,
      memberId: conversation.memberId,
      automationKey: `transcription_failed:${chatwootMessageId}`,
      title: "Review: transcription failed",
      description: `A voice note (${chatwootMessageId}) could not be transcribed: ${errorText.slice(0, 500)}. The original message is intact; review the audio and record the request manually.`,
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
  // Single-operator pilot: fall back to the platform owner (admin role).
  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"))
    .orderBy(users.id)
    .limit(1);
  return admin?.id ?? null;
}