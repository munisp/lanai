-- Physical referential integrity and query-path indexes for the Lanai platform.
-- This migration follows the regenerated complete baseline.

ALTER TABLE "members"
  ADD CONSTRAINT "members_invited_by_user_fk" FOREIGN KEY ("invitedByUserId") REFERENCES "users"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "members_assigned_advisor_fk" FOREIGN KEY ("assignedAdvisorId") REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "member_sessions" ADD CONSTRAINT "member_sessions_member_fk" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE;
ALTER TABLE "member_invitations" ADD CONSTRAINT "member_invitations_invited_by_fk" FOREIGN KEY ("invitedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "travel_requests"
  ADD CONSTRAINT "travel_requests_member_fk" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "travel_requests_assignee_fk" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "proposals"
  ADD CONSTRAINT "proposals_travel_request_fk" FOREIGN KEY ("travelRequestId") REFERENCES "travel_requests"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "proposals_member_fk" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "proposals_creator_fk" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "proposals_parent_fk" FOREIGN KEY ("parentProposalId") REFERENCES "proposals"("id") ON DELETE SET NULL;
ALTER TABLE "proposal_items"
  ADD CONSTRAINT "proposal_items_proposal_fk" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "proposal_items_supplier_fk" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL;
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_proposal_fk" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "bookings_member_fk" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "bookings_supplier_fk" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "bookings_creator_fk" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "supplier_contacts" ADD CONSTRAINT "supplier_contacts_supplier_fk" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE;
ALTER TABLE "documents"
  ADD CONSTRAINT "documents_member_fk" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "documents_travel_request_fk" FOREIGN KEY ("travelRequestId") REFERENCES "travel_requests"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "documents_booking_fk" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "documents_uploader_fk" FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_member_fk" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "conversations_advisor_fk" FOREIGN KEY ("assignedAdvisorId") REFERENCES "users"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "conversations_travel_request_fk" FOREIGN KEY ("travelRequestId") REFERENCES "travel_requests"("id") ON DELETE SET NULL;
ALTER TABLE "messages"
  ADD CONSTRAINT "messages_conversation_fk" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "messages_sender_member_fk" FOREIGN KEY ("senderMemberId") REFERENCES "members"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "messages_sender_user_fk" FOREIGN KEY ("senderUserId") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "ai_insights"
  ADD CONSTRAINT "ai_insights_member_fk" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "ai_insights_travel_request_fk" FOREIGN KEY ("travelRequestId") REFERENCES "travel_requests"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "ai_insights_actioned_by_fk" FOREIGN KEY ("actionedByUserId") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "morning_briefings" ADD CONSTRAINT "morning_briefings_generator_fk" FOREIGN KEY ("generatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "commission_ledger"
  ADD CONSTRAINT "commission_ledger_booking_fk" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "commission_ledger_member_fk" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "commission_ledger_supplier_fk" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "commission_ledger_advisor_fk" FOREIGN KEY ("advisorId") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_recipient_user_fk" FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "notifications_recipient_member_fk" FOREIGN KEY ("recipientMemberId") REFERENCES "members"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "notifications_exactly_one_recipient_check" CHECK (("recipientUserId" IS NOT NULL) <> ("recipientMemberId" IS NOT NULL));
ALTER TABLE "member_preferences" ADD CONSTRAINT "member_preferences_member_fk" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE;
ALTER TABLE "advisor_tasks"
  ADD CONSTRAINT "advisor_tasks_assignee_fk" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "advisor_tasks_creator_fk" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "advisor_tasks_member_fk" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "advisor_tasks_travel_request_fk" FOREIGN KEY ("travelRequestId") REFERENCES "travel_requests"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "advisor_tasks_booking_fk" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL;
ALTER TABLE "member_tags"
  ADD CONSTRAINT "member_tags_member_fk" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "member_tags_tag_fk" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE;
ALTER TABLE "member_family_members" ADD CONSTRAINT "member_family_members_member_fk" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE;
ALTER TABLE "member_profiles" ADD CONSTRAINT "member_profiles_member_fk" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE;
ALTER TABLE "supplier_services" ADD CONSTRAINT "supplier_services_supplier_fk" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE;
ALTER TABLE "pricing_inquiries"
  ADD CONSTRAINT "pricing_inquiries_supplier_fk" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "pricing_inquiries_travel_request_fk" FOREIGN KEY ("travelRequestId") REFERENCES "travel_requests"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "pricing_inquiries_member_fk" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "pricing_inquiries_requester_fk" FOREIGN KEY ("requestedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_member_fk" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "invoices_supplier_fk" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "invoices_booking_fk" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "invoices_travel_request_fk" FOREIGN KEY ("travelRequestId") REFERENCES "travel_requests"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "invoices_creator_fk" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "invoices_recipient_check" CHECK (("memberId" IS NOT NULL) <> ("supplierId" IS NOT NULL));
ALTER TABLE "invoice_line_items"
  ADD CONSTRAINT "invoice_line_items_invoice_fk" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "invoice_line_items_supplier_fk" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "invoice_line_items_booking_fk" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL;
ALTER TABLE "celebrations"
  ADD CONSTRAINT "celebrations_member_fk" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "celebrations_family_member_fk" FOREIGN KEY ("familyMemberId") REFERENCES "member_family_members"("id") ON DELETE SET NULL;
ALTER TABLE "nps_responses"
  ADD CONSTRAINT "nps_responses_member_fk" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "nps_responses_booking_fk" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "nps_responses_travel_request_fk" FOREIGN KEY ("travelRequestId") REFERENCES "travel_requests"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "nps_responses_followup_user_fk" FOREIGN KEY ("followedUpByUserId") REFERENCES "users"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "nps_responses_score_check" CHECK ("score" BETWEEN 0 AND 10);
ALTER TABLE "communication_timeline"
  ADD CONSTRAINT "communication_timeline_member_fk" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "communication_timeline_advisor_fk" FOREIGN KEY ("advisorUserId") REFERENCES "users"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "communication_timeline_travel_request_fk" FOREIGN KEY ("travelRequestId") REFERENCES "travel_requests"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "communication_timeline_booking_fk" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL;
ALTER TABLE "trip_timeline"
  ADD CONSTRAINT "trip_timeline_member_fk" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "trip_timeline_travel_request_fk" FOREIGN KEY ("travelRequestId") REFERENCES "travel_requests"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "trip_timeline_booking_fk" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL;
ALTER TABLE "vip_amenities"
  ADD CONSTRAINT "vip_amenities_member_fk" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "vip_amenities_booking_fk" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "vip_amenities_travel_request_fk" FOREIGN KEY ("travelRequestId") REFERENCES "travel_requests"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "vip_amenities_supplier_fk" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "vip_amenities_requester_fk" FOREIGN KEY ("requestedByUserId") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "chatwoot_conversations"
  ADD CONSTRAINT "chatwoot_conversations_member_fk" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "chatwoot_conversations_advisor_fk" FOREIGN KEY ("advisorUserId") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "chatwoot_messages" ADD CONSTRAINT "chatwoot_messages_conversation_fk" FOREIGN KEY ("conversationId") REFERENCES "chatwoot_conversations"("id") ON DELETE CASCADE;

ALTER TABLE "event_deliveries" ADD CONSTRAINT "event_deliveries_outbox_fk" FOREIGN KEY ("outboxEventId") REFERENCES "outbox_events"("id") ON DELETE CASCADE;
ALTER TABLE "ledger_accounts"
  ADD CONSTRAINT "ledger_accounts_member_fk" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "ledger_accounts_supplier_fk" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "ledger_accounts_advisor_fk" FOREIGN KEY ("advisorUserId") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "ledger_transfers"
  ADD CONSTRAINT "ledger_transfers_debit_account_fk" FOREIGN KEY ("debitLedgerAccountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "ledger_transfers_credit_account_fk" FOREIGN KEY ("creditLedgerAccountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT;
ALTER TABLE "ai_inference_runs"
  ADD CONSTRAINT "ai_inference_runs_member_fk" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "ai_inference_runs_travel_request_fk" FOREIGN KEY ("travelRequestId") REFERENCES "travel_requests"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "ai_inference_runs_user_fk" FOREIGN KEY ("initiatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL;

CREATE INDEX "member_sessions_member_expiry_idx" ON "member_sessions" USING btree ("memberId", "expiresAt");
CREATE INDEX "travel_requests_assignee_status_updated_idx" ON "travel_requests" USING btree ("assignedToUserId", "status", "updatedAt" DESC);
CREATE INDEX "proposals_member_status_created_idx" ON "proposals" USING btree ("memberId", "status", "createdAt" DESC);
CREATE INDEX "bookings_member_status_created_idx" ON "bookings" USING btree ("memberId", "status", "createdAt" DESC);
CREATE INDEX "conversations_member_activity_idx" ON "conversations" USING btree ("memberId", "isResolved", "lastMessageAt" DESC);
CREATE INDEX "messages_conversation_unread_idx" ON "messages" USING btree ("conversationId", "createdAt" DESC) WHERE "isRead" = false;
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("recipientUserId", "createdAt" DESC) WHERE "isRead" = false;
CREATE INDEX "notifications_member_unread_idx" ON "notifications" USING btree ("recipientMemberId", "createdAt" DESC) WHERE "isRead" = false;
CREATE INDEX "advisor_tasks_queue_idx" ON "advisor_tasks" USING btree ("assignedToUserId", "status", "dueDate");
CREATE INDEX "commission_ledger_reconciliation_idx" ON "commission_ledger" USING btree ("status", "expectedDate", "supplierId");
CREATE UNIQUE INDEX "commission_ledger_tigerbeetle_transfer_unique" ON "commission_ledger" ("tigerBeetleTransferId") WHERE "tigerBeetleTransferId" IS NOT NULL;
