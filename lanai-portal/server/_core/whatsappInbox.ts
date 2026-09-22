/**
 * WhatsApp native inbox (portal-side)
 *
 * Provides a laptop/desktop agent inbox for WhatsApp without an external CRM:
 *   POST /api/whatsapp/messages  — bridge forwards inbound messages (+ AI triage)
 *   GET  /api/whatsapp/messages  — list conversation messages for the advisor
 *   POST /api/whatsapp/reply     — advisor sends a reply (via the AI bridge)
 *
 * Messages are persisted in the platform DB (whatsapp_messages).
 */
import type { Express, Request, Response } from "express";
import { getDb } from "../db";
import { whatsappMessages } from "../../drizzle/schema";
import { requireAnyAuth } from "./authMiddleware";

const BRIDGE_URL = process.env.WHATSAPP_BRIDGE_URL ?? "http://localhost:5555";

export async function handleWhatsappMessageInbound(req: Request, res: Response) {
  const b = req.body ?? {};
  const phone = String(b.phone ?? "");
  const body = String(b.body ?? b.message ?? "");
  if (!phone || !body) {
    return res.status(400).json({ error: "phone and body required" });
  }
  const db = await getDb();
  if (!db) return res.status(503).json({ error: "Database unavailable" });
  const [row] = await db
    .insert(whatsappMessages)
    .values({
      phone,
      direction: "inbound",
      body,
      triage: b.triage ?? null,
      contactName: b.contact_name ? String(b.contact_name) : null,
    })
    .returning({ id: whatsappMessages.id });
  console.log(`[WhatsApp Inbox] Stored inbound message #${row.id} from ${phone}`);
  return res.json({ ok: true, id: row.id });
}

export async function listWhatsappMessages(_req: Request, res: Response) {
  const db = await getDb();
  if (!db) return res.status(503).json({ error: "Database unavailable" });
  const rows = await db
    .select()
    .from(whatsappMessages)
    .orderBy(whatsappMessages.createdAt);
  // Group into conversations by phone
  const byPhone = new Map<string, any>();
  for (const r of rows) {
    if (!byPhone.has(r.phone)) byPhone.set(r.phone, []);
    byPhone.get(r.phone)!.push(r);
  }
  const conversations = [...byPhone.entries()].map(([phone, msgs]) => ({
    phone,
    contactName: (msgs.find((m: any) => m.contactName)?.contactName) ?? phone,
    messages: msgs,
    lastMessageAt: msgs[msgs.length - 1].createdAt,
    unread: msgs.filter((m: any) => m.direction === "inbound" && !m.read).length,
  }));
  conversations.sort((a, b) => String(b.lastMessageAt).localeCompare(String(a.lastMessageAt)));
  return res.json({ conversations });
}

export async function replyWhatsapp(req: Request, res: Response) {
  const b = req.body ?? {};
  const to = String(b.to ?? "");
  const message = String(b.message ?? "");
  if (!to || !message) {
    return res.status(400).json({ error: "to and message required" });
  }
  // Send via the AI bridge (which calls Meta Cloud API)
  let sendResult: any = null;
  try {
    const upstream = await fetch(`${BRIDGE_URL}/api/send-whatsapp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, message }),
    });
    sendResult = await upstream.json().catch(() => null);
  } catch (e) {
    return res.status(502).json({ error: "WhatsApp bridge unreachable", detail: String(e) });
  }

  const db = await getDb();
  if (db) {
    await db.insert(whatsappMessages).values({
      phone: to,
      direction: "outbound",
      body: message,
    });
  }
  return res.json({ ok: true, sendResult });
}

export function registerWhatsappInbox(app: Express) {
  app.post("/api/whatsapp/messages", handleWhatsappMessageInbound);
  app.get("/api/whatsapp/messages", requireAnyAuth, listWhatsappMessages);
  app.post("/api/whatsapp/reply", requireAnyAuth, replyWhatsapp);
}
