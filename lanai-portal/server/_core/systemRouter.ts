import { z } from "zod";
import { ENV } from "./env";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";

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

  // Public, non-secret runtime config the client needs before any auth check
  // (e.g. ChatwootWidget renders on the pre-login screen too).
  env: publicProcedure.query(() => ({
    chatwootEnabled: Boolean(ENV.chatwootUrl && ENV.chatwootSiteScriptId),
    chatwootSiteScriptId: ENV.chatwootSiteScriptId,
    crmEnabled: Boolean(ENV.twentyCrmUrl && ENV.twentyCrmApiToken),
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
});
