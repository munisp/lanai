/**
 * Chatwoot integration service — unified client wrapper for the Chatwoot REST API.
 *
 * Handles contact sync, conversation management, messaging, and local mirror
 * synchronization with the Lanai database.
 */
import { ENV } from "./_core/env";
import {
  createChatwootConfig,
  getChatwootConfig,
  updateChatwootConfig,
  createChatwootConversation,
  getChatwootConversationByChatwootId,
  updateChatwootConversation,
  listChatwootConversations,
  createChatwootMessage,
  listChatwootMessages,
  getChatwootMessageByChatwootId,
  getMemberById,
} from "./db";
import type {
  ChatwootConfig,
  ChatwootConversation,
  ChatwootMessage,
} from "../drizzle/schema";

// ── Chatwoot API types ──────────────────────────────────────────────────────

interface ChatwootContact {
  id: number;
  inbox_id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone_number: string | null;
  additional_attributes: Record<string, unknown> | null;
  created_at: string;
  last_activity_at: string;
}

interface ChatwootApiConversation {
  id: number;
  inbox_id: number;
  messages: ChatwootApiMessage[];
  status: "open" | "resolved" | "pending";
  contact_inbox: { source_id: string };
  contact: ChatwootContact;
  assignee: { id: number; avatar_url: string } | null;
  created_at: string;
  last_activity_at: string;
  custom_attributes: Record<string, unknown> | null;
}

interface ChatwootApiMessage {
  id: number;
  content: string;
  message_type: "incoming" | "outgoing";
  content_type:
    | "text"
    | "input_email"
    | "input_select"
    | "cards"
    | "image"
    | "audio"
    | "file"
    | "video"
    | "location"
    | "template";
  content_attributes: Record<string, unknown> | null;
  attachments: { id: number; attachment_type: string; file_url: string }[];
  created_at: string;
  sender: { id: number; name: string } | null;
}

interface ChatwootInbox {
  id: number;
  name: string;
  channel: { type: string; webhook_url: string } | null;
}

// ── Local service types ─────────────────────────────────────────────────────

export interface ChatwootContactSyncResult {
  contactId: number;
  chatwootId: string;
  created: boolean;
}

export interface ChatwootConversationSummary {
  id: number;
  chatwootId: string;
  contactName: string;
  contactEmail: string;
  channel: string;
  status: string;
  lastMessage: string;
  advisorResponded: boolean;
  memberSeen: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatwootThreadMessage {
  id: number;
  chatwootId: string;
  messageType: "inbound" | "outbound";
  content: string;
  attachmentUrl: string | null;
  isTemplate: boolean;
  createdAt: Date;
}

// ── Private helpers ─────────────────────────────────────────────────────────

type ResolvedChatwootConfig = {
  instanceUrl: string;
  accessToken: string;
  accountId: number;
};

/**
 * Resolve one authoritative runtime configuration. The persisted integration
 * configuration takes precedence over bootstrap environment values so an admin
 * change is either used by every API call or explicitly rejected.
 */
async function resolveChatwootConfig(): Promise<ResolvedChatwootConfig> {
  const persisted = await getChatwootConfig();
  if (persisted && !persisted.enabled) {
    throw new Error("Chatwoot integration is disabled");
  }

  const instanceUrl = (persisted?.instanceUrl || ENV.chatwootUrl).replace(
    /\/$/,
    "",
  );
  const accessToken = persisted?.accessToken || ENV.chatwootToken;
  const accountId = persisted?.accountId ?? ENV.chatwootAccountId;

  if (!instanceUrl) throw new Error("CHATWOOT_URL is not configured");
  if (!accessToken) throw new Error("CHATWOOT_TOKEN is not configured");
  if (!Number.isInteger(accountId) || accountId <= 0) {
    throw new Error("CHATWOOT_ACCOUNT_ID must be a positive integer");
  }

  const url = new URL(instanceUrl);
  if (ENV.isProduction && url.protocol !== "https:") {
    throw new Error("Chatwoot requires an HTTPS instance URL in production");
  }

  return { instanceUrl, accessToken, accountId };
}

async function chatwootRequest(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const config = await resolveChatwootConfig();
  const url = `${config.instanceUrl}/api/v1/accounts/${config.accountId}${path}`;
  const headers = {
    "Content-Type": "application/json",
    api_access_token: config.accessToken,
    ...options.headers,
  };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Chatwoot API ${res.status}: ${text}`);
  }
  return res;
}

// ── Contact management ──────────────────────────────────────────────────────

/**
 * Creates or updates a Chatwoot contact for a given member.
 * Returns the contact ID and Chatwoot identifier.
 */
export async function syncContactForMember(
  memberId: number,
  name: string,
  email: string | null,
  phone: string | null,
  tier?: string,
): Promise<ChatwootContactSyncResult> {
  const sourceId = `lanai_member_${memberId}`;
  const firstName = name.split(" ")[0] ?? "";
  const lastName = name.split(" ").slice(1).join(" ") ?? "";

  // Check if contact already exists via Chatwoot API
  let contactId: number;
  let created = false;

  try {
    const config = await resolveChatwootConfig();
    const res = await chatwootRequest(
      `/contacts?inbox_id=${config.accountId}&identifier=${sourceId}`,
    );
    const data = (await res.json()) as { payload: ChatwootContact[] };
    if (data.payload.length > 0) {
      // Contact exists — update it
      contactId = data.payload[0].id;
      await chatwootRequest(`/contacts/${contactId}`, {
        method: "PUT",
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email,
          phone_number: phone,
          additional_attributes: {
            lanai_member_id: String(memberId),
            tier: tier ?? "unspecified",
          },
        }),
      });
    } else {
      // Create new contact
      const createRes = await chatwootRequest("/contacts", {
        method: "POST",
        body: JSON.stringify({
          inbox_id: ENV.chatwootAccountId,
          first_name: firstName,
          last_name: lastName,
          email,
          phone_number: phone,
          additional_attributes: {
            lanai_member_id: String(memberId),
            tier: tier ?? "unspecified",
          },
          source_id: sourceId,
        }),
      });
      const createData = (await createRes.json()) as { id: number };
      contactId = createData.id;
      created = true;
    }
  } catch (err) {
    console.error("[Chatwoot] Contact sync failed:", err);
    throw err;
  }

  return { contactId, chatwootId: sourceId, created };
}

// ── Inbox management ────────────────────────────────────────────────────────

/**
 * Lists all inboxes in the Chatwoot account.
 */
export async function listInboxes(): Promise<ChatwootInbox[]> {
  const res = await chatwootRequest("/inboxes");
  const data = (await res.json()) as { payload: ChatwootInbox[] };
  return data.payload ?? [];
}

// ── Conversation management ─────────────────────────────────────────────────

/**
 * Creates a new conversation for a contact.
 */
export async function createConversation(
  contactId: number,
  inboxId: number,
  content: string,
  messageType: "incoming" | "outgoing" = "incoming",
): Promise<{ conversationId: number; messageId: number }> {
  const res = await chatwootRequest(`/contacts/${contactId}/conversations`, {
    method: "POST",
    body: JSON.stringify({
      inbox_id: inboxId,
      content,
      message_type: messageType,
      private: false,
    }),
  });
  const data = (await res.json()) as {
    id?: unknown;
    messages?: Array<{ id?: unknown }>;
  };
  const conversationId =
    typeof data.id === "number" && Number.isInteger(data.id) && data.id > 0
      ? data.id
      : null;
  const messageId =
    typeof data.messages?.[0]?.id === "number" &&
    Number.isInteger(data.messages[0].id) &&
    data.messages[0].id > 0
      ? data.messages[0].id
      : null;
  if (!conversationId || !messageId) {
    throw new Error(
      "Chatwoot conversation creation did not return conversation and message identifiers",
    );
  }
  return { conversationId, messageId };
}

/**
 * Fetches conversations for a specific contact.
 */
export async function getConversationsForContact(
  contactId: number,
): Promise<ChatwootConversation[]> {
  const res = await chatwootRequest(`/contacts/${contactId}/conversations`);
  const data = (await res.json()) as { payload: ChatwootConversation[] };
  return data.payload ?? [];
}

/**
 * Syncs local conversation mirror from Chatwoot API.
 */
export async function syncConversations(): Promise<number> {
  // Fetch all contacts first
  const contactsRes = await chatwootRequest("/contacts");
  const contactsData = (await contactsRes.json()) as {
    payload: ChatwootContact[];
  };
  const contacts = contactsData.payload ?? [];

  let synced = 0;
  for (const contact of contacts) {
    const sourceId = contact.additional_attributes?.lanai_member_id as
      | string
      | undefined;
    if (!sourceId) continue;

    const memberId = Number.parseInt(sourceId, 10);
    if (!Number.isInteger(memberId) || memberId <= 0) {
      throw new Error(
        `Chatwoot contact ${contact.id} has an invalid lanai_member_id`,
      );
    }
    const member = await getMemberById(memberId);
    if (!member) {
      throw new Error(
        `Chatwoot contact ${contact.id} references missing Lanai member ${memberId}`,
      );
    }

    const convRes = await chatwootRequest(
      `/contacts/${contact.id}/conversations`,
    );
    const convData = (await convRes.json()) as {
      payload: ChatwootApiConversation[];
    };
    const conversations = convData.payload ?? [];

    for (const conv of conversations) {
      const localChatwootId = `conv_${conv.id}`;
      const existing =
        await getChatwootConversationByChatwootId(localChatwootId);
      const lastMsg = conv.messages?.[conv.messages.length - 1];

      const localConversation = existing
        ? await updateChatwootConversation(localChatwootId, {
            status: conv.status,
            lastMessage: lastMsg?.content ?? null,
            updatedAt: new Date(),
          })
        : await createChatwootConversation({
            chatwootId: localChatwootId,
            memberId: member.id,
            contactIdentifier: contact.phone_number ?? contact.email ?? "",
            contactName: `${contact.first_name} ${contact.last_name}`,
            contactEmail: contact.email,
            channel: "website",
            status: conv.status,
            lastMessage: lastMsg?.content ?? null,
          }).then(async (id) =>
            getChatwootConversationByChatwootId(localChatwootId),
          );
      if (!localConversation) {
        throw new Error(
          `Chatwoot mirror did not persist conversation ${localChatwootId}`,
        );
      }

      // Persist only a remote message that has not already been mirrored.
      if (lastMsg) {
        const localMessageId = `msg_${lastMsg.id}`;
        const mirrored = await getChatwootMessageByChatwootId(localMessageId);
        if (!mirrored) {
          await createChatwootMessage({
            chatwootId: localMessageId,
            conversationId: localConversation.id,
            messageType:
              lastMsg.message_type === "incoming" ? "inbound" : "outbound",
            content: lastMsg.content,
            attachmentUrl: lastMsg.attachments?.[0]?.file_url ?? null,
            isTemplate: lastMsg.content_type === "template",
          });
        }
      }

      synced++;
    }
  }

  return synced;
}

// ── Messaging ───────────────────────────────────────────────────────────────

/**
 * Sends a message on an existing conversation.
 */
export async function sendMessage(
  conversationId: number,
  content: string,
  messageType: "outgoing" | "incoming" = "outgoing",
  isPrivate: boolean = false,
): Promise<{ messageId: number }> {
  const res = await chatwootRequest(
    `/conversations/${conversationId}/messages`,
    {
      method: "POST",
      body: JSON.stringify({
        content,
        message_type: messageType,
        private: isPrivate,
      }),
    },
  );
  const data = (await res.json()) as { id?: unknown };
  const messageId =
    typeof data.id === "number" && Number.isInteger(data.id) && data.id > 0
      ? data.id
      : null;
  if (!messageId)
    throw new Error("Chatwoot message send did not return a message identifier");
  return { messageId };
}

// ── Configuration ───────────────────────────────────────────────────────────

/**
 * Initializes Chatwoot configuration in the local database from environment.
 */
export async function initializeChatwootConfig(): Promise<void> {
  if (!ENV.chatwootUrl || !ENV.chatwootToken) return;

  const existing = await getChatwootConfig();
  if (existing) return;

  await createChatwootConfig({
    instanceUrl: ENV.chatwootUrl,
    accessToken: ENV.chatwootToken,
    accountId: ENV.chatwootAccountId,
    enabled: true,
  });
}

/**
 * Gets the current Chatwoot configuration.
 */
export async function getChatwootConfigService(): Promise<ChatwootConfig | null> {
  return getChatwootConfig();
}

/**
 * Updates Chatwoot configuration.
 */
export async function updateChatwootConfigService(
  data: Partial<ChatwootConfig>,
): Promise<ChatwootConfig | null> {
  const existing = await getChatwootConfig();
  if (!existing) {
    const id = await createChatwootConfig({
      instanceUrl: data.instanceUrl ?? ENV.chatwootUrl ?? "",
      accessToken: data.accessToken ?? ENV.chatwootToken ?? "",
      accountId: data.accountId ?? ENV.chatwootAccountId ?? 1,
      enabled: data.enabled ?? false,
      defaultInboxId: data.defaultInboxId,
    });
    const created = await getChatwootConfig();
    if (!created || created.id !== id) {
      throw new Error("Chatwoot configuration was not persisted");
    }
    return created;
  }
  return updateChatwootConfig(existing.id, data);
}

/**
 * Tests the Chatwoot connection.
 */
export async function testChatwootConnection(): Promise<{
  success: boolean;
  message: string;
  inboxCount?: number;
}> {
  try {
    const inboxes = await listInboxes();
    return {
      success: true,
      message: `Connected to Chatwoot. Found ${inboxes.length} inbox(es).`,
      inboxCount: inboxes.length,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, message: `Connection failed: ${message}` };
  }
}
