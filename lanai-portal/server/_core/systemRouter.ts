import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";
import { ENV } from "./env";
import { getDb } from "../db";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  // Public, non-secret runtime config consumed by the client (e.g. Chatwoot widget).
  env: publicProcedure.query(() => ({
    chatwootEnabled: Boolean(ENV.chatwootUrl && ENV.chatwootSiteScriptId),
    chatwootSiteScriptId: ENV.chatwootSiteScriptId ?? "",
    chatwootUrl: ENV.chatwootUrl ?? "",
  })),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),

  /**
   * Daily reminder job — safe for an external cron / scheduler to call.
   * Secured by CRON_TOKEN (set in env). Runs celebration + NPS detractor
   * reminders and returns a summary. Advisors see the resulting notifications
   * in their dashboard.
   */
  runDailyReminders: publicProcedure
    .input(
      z.object({
        token: z.string().optional(),
        dryRun: z.boolean().default(false),
      })
    )
    .mutation(async ({ input }) => {
      const expected = process.env.CRON_TOKEN;
      if (expected && input.token !== expected) {
        throw new Error("Unauthorized: invalid cron token");
      }
      const db = await getDb();
      if (!db) return { celebrations: { sent: 0, skipped: 0 }, nps: { sent: 0, skipped: 0 } };
      // Re-run the reminder logic via the shared runner.
      const { runCelebrationReminders, runNpsFollowUps } = await import("../reminderRunner");
      const celebrations = await runCelebrationReminders(input.dryRun);
      const nps = await runNpsFollowUps(input.dryRun);
      return { celebrations, nps };
    }),
});
