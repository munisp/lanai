/**
 * Voice ingest pipeline tests (SR-101/SR-102).
 *
 * Uses the disposable integration database like chatwootWebhook.test.ts:
 * requires DATABASE_URL pointing at a schema-migrated test database.
 * Transcription is mocked at the client boundary so no STT service is needed.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import {
  advisorTasks,
  chatwootConversations,
  chatwootMessages,
  members,
  users,
} from "../../drizzle/schema";
import { getDb } from "../db";

const transcribeFromBuffer = vi.fn();
const downloadAudioForTranscription = vi.fn();

vi.mock("./voiceTranscription", () => ({
  transcribeFromBuffer: (...args: unknown[]) => transcribeFromBuffer(...args),
}));

vi.mock("./chatwootMedia", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./chatwootMedia")>()),
  downloadAudioForTranscription: (...args: unknown[]) => downloadAudioForTranscription(...args),
}));

type Payload = Record<string, unknown>;

function voicePayload(
  messageId: number,
  overrides: Partial<Payload> = {},
): Payload {
  return {
    id: messageId,
    event: "message_created",
    message_type: 0,
    content: "",
    attachments: [
      {
        id: 7,
        file_url: "https://chatwoot.example.test/rails/active_storage/voice.ogg",
        file_type: "audio",
        content_type: "audio/ogg",
        filename: "voice-note.ogg",
      },
    ],
    conversation: { id: 992777 },
    contact: {
      id: 992888,
      additional_attributes: { lanai_member_id: 992101 },
    },
    ...overrides,
  };
}

describe("voice ingest pipeline", () => {
  const MEMBER_EMAIL = "voice-ingest@example.test";
  let memberId = 0;
  let adminUserId = 0;

  beforeAll(async () => {
    const db = await getDb();
    const [member] = await db
      .insert(members)
      .values({ email: MEMBER_EMAIL, name: "Voice Ingest" })
      .returning({ id: members.id });
    memberId = member.id;
    const [admin] = await db
      .insert(users)
      .values({
        openId: "voice-ingest-admin",
        email: "voice-ingest-admin@example.test",
        name: "Owner",
        role: "admin",
      })
      .onConflictDoNothing()
      .returning({ id: users.id });
    if (admin) {
      adminUserId = admin.id;
    } else {
      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.openId, "voice-ingest-admin"))
        .limit(1);
      adminUserId = existing.id;
    }
  });

  beforeEach(async () => {
    transcribeFromBuffer.mockReset();
    downloadAudioForTranscription.mockReset();
    downloadAudioForTranscription.mockResolvedValue({
      buffer: Buffer.from("ogg-fixture-bytes"),
      contentType: "audio/ogg",
    });
    const db = await getDb();
    await db.delete(advisorTasks).where(like(advisorTasks.automationKey, "transcription_failed:msg_992%"));
    await db.delete(chatwootMessages).where(like(chatwootMessages.chatwootId, "msg_992%"));
    await db.delete(chatwootConversations).where(like(chatwootConversations.chatwootId, "conv_992%"));
  });

  afterAll(async () => {
    const db = await getDb();
    await db.delete(advisorTasks).where(like(advisorTasks.automationKey, "transcription_failed:msg_992%"));
    await db.delete(chatwootMessages).where(like(chatwootMessages.chatwootId, "msg_992%"));
    await db.delete(chatwootConversations).where(like(chatwootConversations.chatwootId, "conv_992%"));
    await db.delete(members).where(eq(members.email, MEMBER_EMAIL));
    await db.delete(users).where(eq(users.openId, "voice-ingest-admin"));
  });

  async function seedProjectedMessage(messageId: number) {
    const db = await getDb();
    const [conversation] = await db
      .insert(chatwootConversations)
      .values({
        chatwootId: `conv_992777`,
        memberId,
        contactIdentifier: "+1555000992",
        status: "open",
        lastMessage: "",
      })
      .returning({ id: chatwootConversations.id });
    await db.insert(chatwootMessages).values({
      chatwootId: `msg_${messageId}`,
      conversationId: conversation.id,
      messageType: "inbound",
      content: "",
      attachmentUrl: "https://chatwoot.chat/voice.ogg",
    });
    return conversation.id;
  }

  it("transcribes an inbound voice note and persists the transcript with the message", async () => {
    const conversationDbId = await seedProjectedMessage(992001);
    transcribeFromBuffer.mockResolvedValue({
      task: "transcribe",
      language: "en",
      duration: 3.4,
      text: "Please rebook my Bali trip",
      segments: [],
    });

    const { processVoiceTranscription } = await import("./voiceIngest");
    await processVoiceTranscription(voicePayload(992001));

    const db = await getDb();
    const [row] = await db
      .select()
      .from(chatwootMessages)
      .where(eq(chatwootMessages.chatwootId, "msg_992001"))
      .limit(1);
    expect(row.transcriptionStatus).toBe("transcribed");
    expect(row.transcription).toBe("Please rebook my Bali trip");
    expect(row.transcriptionError).toBeNull();
    expect(row.conversationId).toBe(conversationDbId);
    expect(transcribeFromBuffer).toHaveBeenCalledTimes(1);
  });

  it("flags a corrupted voice note as failed and creates exactly one review task", async () => {
    await seedProjectedMessage(992002);
    transcribeFromBuffer.mockResolvedValue({
      error: "transcription service request failed",
      code: "TRANSCRIPTION_FAILED",
    });

    const { processVoiceTranscription } = await import("./voiceIngest");
    await processVoiceTranscription(voicePayload(992002));
    await processVoiceTranscription(voicePayload(992002));

    const db = await getDb();
    const [row] = await db
      .select()
      .from(chatwootMessages)
      .where(eq(chatwootMessages.chatwootId, "msg_992002"))
      .limit(1);
    expect(row.transcriptionStatus).toBe("failed");
    expect(row.transcriptionError).toContain("transcription service request failed");

    const tasks = await db
      .select()
      .from(advisorTasks)
      .where(like(advisorTasks.automationKey, "transcription_failed:msg_992002"));
    expect(tasks).toHaveLength(1);
    expect(tasks[0].assignedToUserId).toBe(adminUserId);
    expect(tasks[0].status).toBe("open");
  });

  it("ignores outbound and text-only messages", async () => {
    await seedProjectedMessage(992003);
    const { processVoiceTranscription } = await import("./voiceIngest");
    await processVoiceTranscription(
      voicePayload(992003, { message_type: 1, attachments: undefined }),
    );
    await processVoiceTranscription(
      voicePayload(992004, {
        attachments: [
          { id: 8, file_url: "https://chatwoot.chat/doc.pdf", file_type: "pdf", content_type: "application/pdf" },
        ],
      }),
    );
    expect(transcribeFromBuffer).not.toHaveBeenCalled();

    const db = await getDb();
    const [row] = await db
      .select()
      .from(chatwootMessages)
      .where(eq(chatwootMessages.chatwootId, "msg_992003"))
      .limit(1);
    expect(row.transcriptionStatus).toBe("none");
  });

  it("silently skips messages without a persisted mirror row", async () => {
    transcribeFromBuffer.mockResolvedValue({
      task: "transcribe", language: "en", duration: 1, text: "orphan", segments: [],
    });
    const { processVoiceTranscription } = await import("./voiceIngest");
    await expect(processVoiceTranscription(voicePayload(992009))).resolves.toBeUndefined();
    expect(transcribeFromBuffer).not.toHaveBeenCalled();
  });
});