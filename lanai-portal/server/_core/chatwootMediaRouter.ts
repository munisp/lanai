/**
 * Media playback route for captured Chatwoot attachments (SR-101/SR-102).
 *
 * Advisor-authenticated only. Playback resolves a FRESH attachment URL through
 * the authenticated Chatwoot API on every request and redirects, so no
 * expiring provider URL is ever stored as the durable reference and no
 * provider token reaches the browser.
 */
import type { Express, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { chatwootConversations, chatwootMessages } from "../../drizzle/schema";
import { requireAdvisorAuth } from "./authMiddleware";
import { resolveFreshAudioUrl, parseChatwootNumericId } from "./chatwootMedia";

export function registerChatwootMediaRoutes(app: Express): void {
  app.get(
    "/api/chatwoot/media/:messageId",
    requireAdvisorAuth,
    async (req: Request, res: Response) => {
      const numericId = Number(req.params.messageId);
      if (!Number.isInteger(numericId) || numericId <= 0) {
        res.status(400).json({ error: "Invalid message id" });
        return;
      }

      try {
        const db = await getDb();
        const [row] = await db
          .select({
            messageId: chatwootMessages.chatwootId,
            conversationId: chatwootConversations.chatwootId,
          })
          .from(chatwootMessages)
          .innerJoin(
            chatwootConversations,
            eq(chatwootConversations.id, chatwootMessages.conversationId),
          )
          .where(eq(chatwootMessages.chatwootId, `msg_${numericId}`))
          .limit(1);
        if (!row) {
          res.status(404).json({ error: "Message not found" });
          return;
        }

        const conversationNumeric = parseChatwootNumericId(row.conversationId);
        if (!conversationNumeric) {
          res.status(404).json({ error: "Conversation not found" });
          return;
        }

        const attachment = await resolveFreshAudioUrl(conversationNumeric, numericId);
        if (!attachment) {
          res.status(404).json({ error: "No retrievable attachment for this message" });
          return;
        }

        // Fresh provider URL resolved per request; the browser never sees any
        // credential. The redirect keeps audio streaming provider-direct.
        res.redirect(307, attachment.url);
      } catch (error) {
        console.error(
          "[chatwoot-media] playback failed messageId=",
          numericId,
          error instanceof Error ? error.message : "unknown",
        );
        res.status(502).json({ error: "Attachment playback unavailable" });
      }
    },
  );
}