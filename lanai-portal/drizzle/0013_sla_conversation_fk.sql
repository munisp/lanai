ALTER TABLE "sla_timers" DROP CONSTRAINT IF EXISTS "sla_timers_conversationId_conversations_id_fk";
ALTER TABLE "sla_timers" ADD CONSTRAINT "sla_timers_conversationId_chatwoot_conversations_id_fk" FOREIGN KEY ("conversationId") REFERENCES "public"."chatwoot_conversations"("id") ON DELETE no action ON UPDATE no action;
