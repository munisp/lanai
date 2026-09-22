/**
 * WhatsApp Inbound Connector
 *
 * The WhatsApp AI bridge (lanai_ai/pillars/whatsapp) receives inbound messages
 * from Meta, runs AI triage, then forwards the structured result here so it is
 * persisted in the platform's own database as an advisor task (and, when a
 * member is matched, linked to them). This replaces the legacy dependency on an
 * external Twenty CRM for inbound WhatsApp handling.
 *
 * The raw Meta webhook (verify + inbound POST) is proxied from the public
 * tunnel (/webhook/whatsapp) to the bridge on :5555 by registerAiProxy-style
 * routing in index.ts.
 */
import type { Express, Request, Response } from "express";
import { getDb } from "../db";
import { advisorTasks } from "../../drizzle/schema";

function priorityFromUrgency(urgency?: string): "low" | "medium" | "high" | "urgent" {
  switch ((urgency ?? "").toUpperCase()) {
    case "HIGH":
    case "URGENT":
      return "high";
    case "LOW":
      return "low";
    default:
      return "medium";
  }
}

/**
 * Persist an inbound WhatsApp triage as an advisor task.
 * Body (from the bridge):
 *   {
 *     phone, client_name, intent, urgency, sentiment, summary,
 *     suggested_action, draft_reply, tags, estimated_value, message, is_new
 *   }
 */
export async function handleWhatsappInbound(req: Request, res: Response) {
  const b = req.body ?? {};
  const phone = String(b.phone ?? "");
  const clientName = String(b.client_name ?? "WhatsApp Contact");
  const intent = String(b.intent ?? "GENERAL_ENQUIRY");
  const urgency = String(b.urgency ?? "MEDIUM");
  const summary = String(b.summary ?? "");
  const message = String(b.message ?? "");
  const suggested = String(b.suggested_action ?? "Review and respond");
  const draft = String(b.draft_reply ?? "");

  const priority = priorityFromUrgency(urgency);
  const title = `${urgency === "HIGH" ? "🚨 URGENT " : "📱 "}WhatsApp — ${clientName} (${intent})`;
  const description = [
    `Inbound WhatsApp from ${phone}`,
    message ? `Message: ${message}` : "",
    summary ? `AI summary: ${summary}` : "",
    `Suggested action: ${suggested}`,
    draft ? `Draft reply ready:\n${draft}` : "",
  ].filter(Boolean).join("\n\n");

  const db = await getDb();
  if (!db) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  const [row] = await db
    .insert(advisorTasks)
    .values({
      assignedToUserId: 1, // dev-admin / default advisor
      createdByUserId: 1,
      title,
      description,
      status: "open",
      priority,
    })
    .returning({ id: advisorTasks.id });

  console.log(`[WhatsApp Inbound] Created advisor task #${row.id} for ${clientName}`);
  return res.json({ ok: true, taskId: row.id });
}

export function registerWhatsappInbound(app: Express) {
  // The bridge (on :5555) calls this to persist triage results.
  app.post("/api/whatsapp/inbound", handleWhatsappInbound);
}
