/**
 * Chatwoot media handling for the capture pipeline (SR-101/SR-102).
 *
 * Attachments are never re-fetched from expiring public URLs at playback
 * time: ingest downloads the audio bytes once for transcription, stores the
 * provider reference, and playback resolves a FRESH attachment URL through
 * the authenticated Chatwoot API on every request, then redirects.
 */
import { ENV } from "./env";
import { getChatwootConfigService } from "../chatwootService";

export type AudioAttachment = {
  /** Provider attachment URL as delivered in the webhook (reference only). */
  url: string;
  contentType: string;
  filename: string;
};

type RawAttachment = {
  file_url?: string;
  data_url?: string;
  file_type?: string;
  content_type?: string;
  filename?: string;
};

const MAX_AUDIO_BYTES = 16 * 1024 * 1024;

function audioAttachmentFrom(raw: unknown): AudioAttachment | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as RawAttachment;
  const url = a.file_url || a.data_url || "";
  const contentType = a.content_type || a.file_type || "";
  if (!url) return null;
  if (!contentType.startsWith("audio/") && a.file_type !== "audio" && a.file_type !== "voice") {
    return null;
  }
  return {
    url,
    contentType: contentType || "audio/ogg",
    filename: a.filename || "voice-note.ogg",
  };
}

/**
 * Pull the first audio attachment from a Chatwoot webhook message payload.
 */
export function extractAudioAttachment(payload: Record<string, unknown>): AudioAttachment | null {
  const attachments = payload.attachments;
  if (!Array.isArray(attachments)) return null;
  for (const raw of attachments) {
    const found = audioAttachmentFrom(raw);
    if (found) return found;
  }
  return null;
}

/**
 * Resolve a fresh, authenticated attachment URL for a Chatwoot message by
 * asking the Chatwoot API for the conversation's messages at playback time.
 */
export async function resolveFreshAudioUrl(
  chatwootConversationId: number,
  chatwootMessageId: number,
): Promise<AudioAttachment | null> {
  const config = await getChatwootConfigService();
  const instanceUrl = ((config?.instanceUrl ?? ENV.chatwootUrl) || "").replace(/\/$/, "");
  const accessToken = config?.accessToken || ENV.chatwootToken;
  const accountId = config?.accountId ?? ENV.chatwootAccountId;
  if (!instanceUrl || !accessToken || !Number.isInteger(accountId)) return null;

  const url = new URL(
    `api/v1/accounts/${accountId}/conversations/${chatwootConversationId}/messages`,
    instanceUrl,
  );
  const response = await fetch(url, {
    headers: { api_access_token: accessToken, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) return null;

  const body = (await response.json().catch(() => null)) as
    | { payload?: Array<Record<string, unknown>> }
    | null;
  if (!body?.payload) return null;

  const message = body.payload.find(
    (m) => Number(m.id) === chatwootMessageId,
  );
  if (!message) return null;
  return extractAudioAttachment(message);
}

/**
 * Download audio bytes for transcription. In-memory only: the pilot does not
 * duplicate provider media into local storage; the provider URL plus a fresh
 * API resolution at playback is the durable reference (SR-102).
 */
export async function downloadAudioForTranscription(
  attachment: AudioAttachment,
): Promise<{ buffer: Buffer; contentType: string } | { error: string }> {
  try {
    const response = await fetch(attachment.url, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      return { error: `attachment download failed: HTTP ${response.status}` };
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_AUDIO_BYTES) {
      return { error: "attachment exceeds 16MB transcription cap" };
    }
    return { buffer, contentType: response.headers.get("content-type") || attachment.contentType };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "attachment download failed" };
  }
}

/** Numeric Chatwoot ids stored in local mirror ids (conv_* / msg_*). */
export function parseChatwootNumericId(localId: string): number | null {
  const match = /^(?:conv|msg)_(\d+)$/.exec(localId);
  return match ? Number(match[1]) : null;
}