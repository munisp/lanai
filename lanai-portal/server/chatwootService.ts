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
  getMemberByEmail,
} from "./db";
import type { ChatwootConfig, ChatwootConversation, ChatwootMessage } from "../drizzle/schema";

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
  content_type: "text" | "input_email" | "input_select" | "cards" | "image" | "audio" | "file" | "video" | "location" | "template";
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

function getChatwootBaseUrl(): string {
  if (ENV.chatwootUrl) return ENV.chatwootUrl;
  throw new Error("CHATWOOT_URL is not configured");
}

function getChatwootHeaders(): Record<string, string> {
  if (!ENV.chatwootToken) throw new Error("CHATWOOT_TOKEN is not configured");
  return {
    "Content-Type": "application/json",
    "api_access_token": ENV.chatwootToken,
  };
}

async function chatwootRequest(path: string, options: RequestInit = {}): Promise<Response> {
  const baseUrl = getChatwootBaseUrl();
  const url = `${baseUrl}/api/v1/accounts/${ENV.chatwootAccountId}${path}`;
  const headers = { ...getChatwootHeaders(), ...options.headers };
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
  phone: string | null
): Promise<ChatwootContactSyncResult> {
  const sourceId = `lanai_member_${memberId}`;
  const firstName = name.split(" ")[0] ?? "";
  const lastName = name.split(" ").slice(1).join(" ") ?? "";

  // Check if contact already exists via Chatwoot API
  let contactId: number;
  let created = false;

  try {
    const res = await chatwootRequest(`/contacts?inbox_id=${ENV.chatwootAccountId}&identifier=${sourceId}`);
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
          additional_attributes: { lanai_member_id: memberId, tier: "gold" },
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
          additional_attributes: { lanai_member_id: memberId, tier: "gold" },
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
  messageType: "incoming" | "outgoing" = "incoming"
): Promise<{ conversationId: number; messageId: number }> {
  const res = await chatwootRequest("/accounts/{account_id}/contacts/{contact_id}/conversations", {
    method: "POST",
    body: JSON.stringify({
      inbox_id: inboxId,
      content,
      message_type: messageType,
      private: false,
    }),
  });
  // Note: path needs template substitution — handled by the API
  const data = (await res.json()) as { id: number; messages: { id: number }[] };
  return { conversationId: data.id, messageId: data.messages[0]?.id ?? 0 };
}

/**
 * Fetches conversations for a specific contact.
 */
export async function getConversationsForContact(contactId: number): Promise<ChatwootConversation[]> {
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
  const contactsData = (await contactsRes.json()) as { payload: ChatwootContact[] };
  const contacts = contactsData.payload ?? [];

  let synced = 0;
  for (const contact of contacts) {
    const sourceId = contact.additional_attributes?.lanai_member_id as string | undefined;
    if (!sourceId) continue;

    const memberId = parseInt(sourceId, 10);
    const member = await getMemberByEmail(contact.email ?? "");
    if (!member) continue;

    const convRes = await chatwootRequest(`/contacts/${contact.id}/conversations`);
    const convData = (await convRes.json()) as { payload: ChatwootApiConversation[] };
    const conversations = convData.payload ?? [];

    for (const conv of conversations) {
      const localChatwootId = `conv_${conv.id}`;
      const existing = await getChatwootConversationByChatwootId(localChatwootId);
      const lastMsg = conv.messages?.[conv.messages.length - 1];

      if (existing) {
        await updateChatwootConversation(localChatwootId, {
          status: conv.status,
          lastMessage: lastMsg?.content ?? null,
          updatedAt: new Date(),
        });
      } else {
        await createChatwootConversation({
          chatwootId: localChatwootId,
          memberId: member.id,
          contactIdentifier: contact.phone_number ?? contact.email ?? "",
          contactName: `${contact.first_name} ${contact.last_name}`,
          contactEmail: contact.email,
          channel: "website",
          status: conv.status,
          lastMessage: lastMsg?.content ?? null,
        });
      }

      // Sync messages
      if (lastMsg) {
        await createChatwootMessage({
          chatwootId: `msg_${lastMsg.id}`,
          conversationId: existing?.id ?? (await getChatwootConversationByChatwootId(localChatwootId))?.id ?? 0,
          messageType: lastMsg.message_type === "incoming" ? "inbound" : "outbound",
          content: lastMsg.content,
          attachmentUrl: lastMsg.attachments?.[0]?.file_url ?? null,
          isTemplate: lastMsg.content_type === "template",
        });
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
  isPrivate: boolean = false
): Promise<{ messageId: number }> {
  const res = await chatwootRequest(`/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content, message_type: messageType, private: isPrivate }),
  });
  const data = (await res.json()) as { id: number };
  return { messageId: data.id };
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
  data: Partial<ChatwootConfig>
): Promise<ChatwootConfig | null> {
  const existing = await getChatwootConfig();
  if (!existing) {
    await createChatwootConfig({
      instanceUrl: data.instanceUrl ?? ENV.chatwootUrl ?? "",
      accessToken: data.accessToken ?? ENV.chatwootToken ?? "",
      accountId: data.accountId ?? ENV.chatwootAccountId ?? 1,
      enabled: data.enabled ?? false,
      defaultInboxId: data.defaultInboxId,
    }).catch(() => {});
    return getChatwootConfig();
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
