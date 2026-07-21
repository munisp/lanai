CREATE TYPE "public"."audit_action" AS ENUM('create', 'update', 'delete', 'login', 'logout', 'invite', 'approve', 'reject');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('pending', 'confirmed', 'paid', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."celebration_type" AS ENUM('birthday', 'anniversary', 'graduation', 'honeymoon', 'retirement', 'promotion', 'other');--> statement-breakpoint
CREATE TYPE "public"."chatwoot_message_type" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."commission_status" AS ENUM('expected', 'invoiced', 'received', 'disputed', 'written_off');--> statement-breakpoint
CREATE TYPE "public"."communication_type" AS ENUM('email', 'whatsapp', 'phone_call', 'portal_message', 'internal_note', 'sms');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('pending', 'delivered', 'failed', 'dead_letter');--> statement-breakpoint
CREATE TYPE "public"."inference_run_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."insight_type" AS ENUM('churn_risk', 'upsell_opportunity', 'preference_detected', 'anniversary', 'morning_briefing', 'proposal_suggestion');--> statement-breakpoint
CREATE TYPE "public"."invoice_line_item_type" AS ENUM('hotel', 'flight', 'villa', 'apartment', 'yacht', 'jet', 'transfer', 'restaurant', 'event', 'experience', 'membership_fee', 'ancillary', 'other');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'sent', 'paid', 'overdue', 'voided', 'disputed');--> statement-breakpoint
CREATE TYPE "public"."invoice_type" AS ENUM('client_service', 'commission');--> statement-breakpoint
CREATE TYPE "public"."message_channel" AS ENUM('whatsapp', 'email', 'portal', 'sms');--> statement-breakpoint
CREATE TYPE "public"."message_sender" AS ENUM('member', 'advisor', 'ai');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('travel_request', 'proposal', 'booking', 'message', 'payment', 'system', 'ai_insight');--> statement-breakpoint
CREATE TYPE "public"."nps_response" AS ENUM('promoter', 'passive', 'detractor');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'publishing', 'published', 'failed', 'dead_letter');--> statement-breakpoint
CREATE TYPE "public"."pricing_inquiry_status" AS ENUM('pending', 'responded', 'accepted', 'declined', 'expired');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('draft', 'sent', 'approved', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('advisor', 'senior_advisor', 'admin');--> statement-breakpoint
CREATE TYPE "public"."sentiment" AS ENUM('positive', 'neutral', 'negative', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('open', 'in_progress', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."task_template_type" AS ENUM('airport_fast_track', 'villa_provisioning', 'yacht_charter', 'restaurant_reservation', 'celebration_planning', 'visa_check', 'welcome_gift', 'vip_amenity', 'jet_charter', 'transfer_arrangement', 'custom');--> statement-breakpoint
CREATE TYPE "public"."tier" AS ENUM('platinum', 'gold', 'silver');--> statement-breakpoint
CREATE TYPE "public"."travel_request_status" AS ENUM('new', 'in_progress', 'proposal_sent', 'booked', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "advisor_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"assignedToUserId" integer NOT NULL,
	"createdByUserId" integer,
	"memberId" integer,
	"travelRequestId" integer,
	"bookingId" integer,
	"title" varchar(255) NOT NULL,
	"description" text,
	"status" "task_status" DEFAULT 'open' NOT NULL,
	"priority" "task_priority" DEFAULT 'medium' NOT NULL,
	"dueDate" timestamp,
	"completedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_inference_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"requestId" varchar(64) NOT NULL,
	"capability" varchar(128) NOT NULL,
	"provider" varchar(64) NOT NULL,
	"model" varchar(128) NOT NULL,
	"memberId" integer,
	"travelRequestId" integer,
	"initiatedByUserId" integer,
	"inputDigest" varchar(64) NOT NULL,
	"inputMetadata" jsonb,
	"outputMetadata" jsonb,
	"status" "inference_run_status" DEFAULT 'queued' NOT NULL,
	"latencyMs" integer,
	"error" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"completedAt" timestamp,
	CONSTRAINT "ai_inference_runs_requestId_unique" UNIQUE("requestId")
);
--> statement-breakpoint
CREATE TABLE "ai_insights" (
	"id" serial PRIMARY KEY NOT NULL,
	"memberId" integer,
	"travelRequestId" integer,
	"insightType" "insight_type" NOT NULL,
	"title" varchar(255) NOT NULL,
	"body" text NOT NULL,
	"confidence" numeric(5, 4),
	"model" varchar(64),
	"metadata" jsonb,
	"isActioned" boolean DEFAULT false NOT NULL,
	"actionedByUserId" integer,
	"actionedAt" timestamp,
	"expiresAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_idempotency_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"scope" varchar(128) NOT NULL,
	"key" varchar(128) NOT NULL,
	"requestDigest" varchar(64) NOT NULL,
	"response" jsonb,
	"statusCode" integer,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"actorType" varchar(32) NOT NULL,
	"actorId" integer,
	"action" "audit_action" NOT NULL,
	"resourceType" varchar(64) NOT NULL,
	"resourceId" integer,
	"before" jsonb,
	"after" jsonb,
	"ipAddress" varchar(64),
	"userAgent" varchar(512),
	"metadata" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "authorization_sync_state" (
	"id" serial PRIMARY KEY NOT NULL,
	"subjectType" varchar(64) NOT NULL,
	"subjectId" varchar(128) NOT NULL,
	"resourceType" varchar(64) NOT NULL,
	"resourceId" varchar(128) NOT NULL,
	"relation" varchar(64) NOT NULL,
	"schemaVersion" varchar(128),
	"syncedAt" timestamp DEFAULT now() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"proposalId" integer NOT NULL,
	"memberId" integer NOT NULL,
	"supplierId" integer,
	"createdByUserId" integer,
	"referenceNumber" varchar(128),
	"supplierConfirmationRef" varchar(128),
	"status" "booking_status" DEFAULT 'pending' NOT NULL,
	"totalAmount" numeric(12, 2),
	"currency" varchar(8) DEFAULT 'GBP',
	"commissionExpected" numeric(12, 2),
	"commissionReceived" boolean DEFAULT false NOT NULL,
	"commissionReceivedAt" timestamp,
	"commissionAmount" numeric(12, 2),
	"checkIn" timestamp,
	"checkOut" timestamp,
	"pax" integer,
	"notes" text,
	"cancellationPolicy" text,
	"confirmedAt" timestamp,
	"cancelledAt" timestamp,
	"cancellationReason" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "celebrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"memberId" integer NOT NULL,
	"celebrationType" "celebration_type" NOT NULL,
	"title" varchar(255) NOT NULL,
	"celebrationDate" timestamp NOT NULL,
	"isRecurring" boolean DEFAULT true NOT NULL,
	"familyMemberId" integer,
	"reminderDaysBefore" integer DEFAULT 30,
	"lastReminderSentAt" timestamp,
	"notes" text,
	"giftSuggestions" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chatwoot_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"instanceUrl" varchar(512) NOT NULL,
	"accessToken" varchar(256) NOT NULL,
	"accountId" integer DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"defaultInboxId" integer DEFAULT 1,
	"lastSyncAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chatwoot_conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"chatwootId" varchar(64) NOT NULL,
	"memberId" integer,
	"advisorUserId" integer,
	"contactIdentifier" varchar(512),
	"contactName" varchar(255),
	"contactEmail" varchar(320),
	"channel" varchar(64) DEFAULT 'website',
	"status" varchar(32) DEFAULT 'open' NOT NULL,
	"lastMessage" text,
	"memberSeen" boolean DEFAULT false NOT NULL,
	"advisorResponded" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chatwoot_conversations_chatwootId_unique" UNIQUE("chatwootId")
);
--> statement-breakpoint
CREATE TABLE "chatwoot_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"chatwootId" varchar(64) NOT NULL,
	"conversationId" integer NOT NULL,
	"messageType" "chatwoot_message_type" NOT NULL,
	"content" text NOT NULL,
	"attachmentUrl" varchar(1024),
	"isTemplate" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"bookingId" integer NOT NULL,
	"memberId" integer NOT NULL,
	"supplierId" integer,
	"advisorId" integer,
	"status" "commission_status" DEFAULT 'expected' NOT NULL,
	"expectedAmount" numeric(12, 2) NOT NULL,
	"receivedAmount" numeric(12, 2),
	"currency" varchar(8) DEFAULT 'GBP',
	"expectedDate" timestamp,
	"receivedDate" timestamp,
	"invoiceRef" varchar(128),
	"notes" text,
	"tigerBeetleTransferId" varchar(128),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_timeline" (
	"id" serial PRIMARY KEY NOT NULL,
	"memberId" integer NOT NULL,
	"advisorUserId" integer,
	"communicationType" "communication_type" NOT NULL,
	"channel" "message_channel",
	"direction" varchar(16) NOT NULL,
	"subject" varchar(512),
	"body" text,
	"summary" text,
	"transcription" text,
	"sentiment" "sentiment",
	"sentimentScore" numeric(4, 3),
	"durationSeconds" integer,
	"attachmentUrls" jsonb,
	"externalId" varchar(255),
	"travelRequestId" integer,
	"bookingId" integer,
	"followUpRequired" boolean DEFAULT false NOT NULL,
	"followUpDueAt" timestamp,
	"followUpCompletedAt" timestamp,
	"responseTimeMinutes" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"memberId" integer NOT NULL,
	"assignedAdvisorId" integer,
	"channel" "message_channel" DEFAULT 'portal' NOT NULL,
	"subject" varchar(255),
	"isResolved" boolean DEFAULT false NOT NULL,
	"lastMessageAt" timestamp,
	"travelRequestId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"memberId" integer NOT NULL,
	"travelRequestId" integer,
	"bookingId" integer,
	"title" varchar(255) NOT NULL,
	"fileUrl" varchar(1024) NOT NULL,
	"fileSize" integer,
	"mimeType" varchar(128),
	"documentType" varchar(64),
	"uploadedByUserId" integer,
	"isVisibleToMember" boolean DEFAULT true NOT NULL,
	"expiresAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"outboxEventId" integer NOT NULL,
	"target" varchar(64) NOT NULL,
	"status" "delivery_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lastError" text,
	"deliveredAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_line_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoiceId" integer NOT NULL,
	"itemType" "invoice_line_item_type" NOT NULL,
	"description" varchar(512) NOT NULL,
	"quantity" numeric(8, 2) DEFAULT '1',
	"unitPrice" numeric(10, 2) NOT NULL,
	"totalPrice" numeric(10, 2) NOT NULL,
	"commissionRate" numeric(5, 2),
	"commissionAmount" numeric(10, 2),
	"supplierId" integer,
	"bookingId" integer,
	"sortOrder" integer DEFAULT 0,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoiceNumber" varchar(64) NOT NULL,
	"invoiceType" "invoice_type" NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"memberId" integer,
	"supplierId" integer,
	"bookingId" integer,
	"travelRequestId" integer,
	"subtotal" numeric(12, 2) NOT NULL,
	"taxAmount" numeric(12, 2) DEFAULT '0',
	"discountAmount" numeric(12, 2) DEFAULT '0',
	"totalAmount" numeric(12, 2) NOT NULL,
	"currency" varchar(8) DEFAULT 'GBP',
	"commissionRate" numeric(5, 2),
	"issuedAt" timestamp,
	"dueDate" timestamp,
	"paidAt" timestamp,
	"notes" text,
	"pdfUrl" varchar(1024),
	"brandedLogoUrl" varchar(1024),
	"createdByUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_invoiceNumber_unique" UNIQUE("invoiceNumber")
);
--> statement-breakpoint
CREATE TABLE "lakehouse_checkpoints" (
	"id" serial PRIMARY KEY NOT NULL,
	"consumerName" varchar(128) NOT NULL,
	"topic" varchar(128) NOT NULL,
	"partition" integer DEFAULT 0 NOT NULL,
	"offset" varchar(64),
	"lastEventId" varchar(64),
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lakehouse_checkpoints_consumerName_unique" UNIQUE("consumerName")
);
--> statement-breakpoint
CREATE TABLE "ledger_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"accountKey" varchar(128) NOT NULL,
	"tigerBeetleAccountId" varchar(39) NOT NULL,
	"ledger" integer NOT NULL,
	"code" integer NOT NULL,
	"memberId" integer,
	"supplierId" integer,
	"advisorUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_accounts_accountKey_unique" UNIQUE("accountKey"),
	CONSTRAINT "ledger_accounts_tigerBeetleAccountId_unique" UNIQUE("tigerBeetleAccountId")
);
--> statement-breakpoint
CREATE TABLE "ledger_transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"transferKey" varchar(128) NOT NULL,
	"tigerBeetleTransferId" varchar(39) NOT NULL,
	"debitLedgerAccountId" integer NOT NULL,
	"creditLedgerAccountId" integer NOT NULL,
	"amountMinor" numeric(20, 0) NOT NULL,
	"currency" varchar(8) NOT NULL,
	"status" varchar(32) DEFAULT 'posted' NOT NULL,
	"referenceType" varchar(64),
	"referenceId" varchar(64),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_transfers_transferKey_unique" UNIQUE("transferKey"),
	CONSTRAINT "ledger_transfers_tigerBeetleTransferId_unique" UNIQUE("tigerBeetleTransferId")
);
--> statement-breakpoint
CREATE TABLE "member_family_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"memberId" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"relationship" varchar(64) NOT NULL,
	"dateOfBirth" timestamp,
	"passportNumber" varchar(64),
	"passportExpiry" timestamp,
	"nationality" varchar(128),
	"dietaryRequirements" text,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_invitations" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" varchar(128) NOT NULL,
	"email" varchar(320) NOT NULL,
	"name" varchar(255) NOT NULL,
	"tier" "tier" DEFAULT 'gold' NOT NULL,
	"crmPersonId" varchar(64),
	"invitedByUserId" integer NOT NULL,
	"accepted" boolean DEFAULT false NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "member_invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "member_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"memberId" integer NOT NULL,
	"preferredAirlines" jsonb,
	"preferredHotelChains" jsonb,
	"preferredCabinClass" varchar(64),
	"preferredRoomType" varchar(128),
	"frequentFlyerNumbers" jsonb,
	"hotelLoyaltyNumbers" jsonb,
	"seatPreference" varchar(64),
	"mealPreference" varchar(128),
	"travelStyle" varchar(128),
	"favouriteDestinations" jsonb,
	"bucketListDestinations" jsonb,
	"avoidedDestinations" jsonb,
	"communicationPreference" varchar(64) DEFAULT 'email',
	"notifyOnProposal" boolean DEFAULT true NOT NULL,
	"notifyOnBooking" boolean DEFAULT true NOT NULL,
	"notifyOnMessage" boolean DEFAULT true NOT NULL,
	"customPreferences" jsonb,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "member_preferences_memberId_unique" UNIQUE("memberId")
);
--> statement-breakpoint
CREATE TABLE "member_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"memberId" integer NOT NULL,
	"frequentFlyerNumbers" jsonb,
	"hotelLoyaltyNumbers" jsonb,
	"visaExpiry" jsonb,
	"globalEntryNumber" varchar(64),
	"knownTravellerNumber" varchar(64),
	"preferredPaymentMethod" varchar(128),
	"preferredCurrency" varchar(8) DEFAULT 'GBP',
	"preferredHotelBrands" jsonb,
	"roomPreferences" jsonb,
	"seatPreference" varchar(64),
	"cabinClass" varchar(32) DEFAULT 'business',
	"dietaryRequirements" jsonb,
	"allergies" text,
	"favouriteDestinations" jsonb,
	"bucketListDestinations" jsonb,
	"travelStyle" jsonb,
	"amenityPreferences" jsonb,
	"anniversaryDate" timestamp,
	"weddingAnniversaryDate" timestamp,
	"personalAssistantName" varchar(255),
	"personalAssistantEmail" varchar(320),
	"personalAssistantPhone" varchar(64),
	"familyOfficeContactName" varchar(255),
	"familyOfficeContactEmail" varchar(320),
	"familyOfficeContactPhone" varchar(64),
	"securityLevel" varchar(32) DEFAULT 'standard',
	"privacyNotes" text,
	"nda" boolean DEFAULT false NOT NULL,
	"lifetimeRevenue" numeric(12, 2) DEFAULT '0',
	"annualRevenue" numeric(12, 2) DEFAULT '0',
	"membershipFeesPaid" numeric(12, 2) DEFAULT '0',
	"satisfactionScore" numeric(3, 1),
	"lastNpsScore" integer,
	"conciergeNotes" text,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "member_profiles_memberId_unique" UNIQUE("memberId")
);
--> statement-breakpoint
CREATE TABLE "member_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" varchar(128) NOT NULL,
	"memberId" integer NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "member_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "member_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"memberId" integer NOT NULL,
	"tagId" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"name" varchar(255) NOT NULL,
	"pinHash" varchar(255),
	"tier" "tier" DEFAULT 'gold' NOT NULL,
	"crmPersonId" varchar(64),
	"onboardingComplete" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"invitedByUserId" integer,
	"assignedAdvisorId" integer,
	"stripeCustomerId" varchar(64),
	"stripeSubscriptionId" varchar(64),
	"phone" varchar(64),
	"nationality" varchar(128),
	"passportNumber" varchar(64),
	"passportExpiry" timestamp,
	"dateOfBirth" timestamp,
	"dietaryRequirements" text,
	"accessibilityNeeds" text,
	"emergencyContactName" varchar(255),
	"emergencyContactPhone" varchar(64),
	"notes" text,
	"lastSignedIn" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "members_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversationId" integer NOT NULL,
	"senderType" "message_sender" NOT NULL,
	"senderMemberId" integer,
	"senderUserId" integer,
	"body" text NOT NULL,
	"attachmentUrl" varchar(1024),
	"isRead" boolean DEFAULT false NOT NULL,
	"readAt" timestamp,
	"aiDraftReply" text,
	"externalMessageId" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "morning_briefings" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" varchar(16) NOT NULL,
	"generatedByUserId" integer,
	"headline" varchar(512),
	"body" text NOT NULL,
	"urgentItems" jsonb,
	"opportunities" jsonb,
	"model" varchar(64),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "morning_briefings_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipientType" varchar(32) NOT NULL,
	"recipientUserId" integer,
	"recipientMemberId" integer,
	"type" "notification_type" NOT NULL,
	"title" varchar(255) NOT NULL,
	"body" text,
	"resourceType" varchar(64),
	"resourceId" integer,
	"isRead" boolean DEFAULT false NOT NULL,
	"readAt" timestamp,
	"actionUrl" varchar(512),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nps_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"memberId" integer NOT NULL,
	"bookingId" integer,
	"travelRequestId" integer,
	"score" integer NOT NULL,
	"category" "nps_response" NOT NULL,
	"feedback" text,
	"followUpRequired" boolean DEFAULT false NOT NULL,
	"followedUpAt" timestamp,
	"followedUpByUserId" integer,
	"channel" varchar(32) DEFAULT 'portal',
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"eventId" varchar(64) NOT NULL,
	"aggregateType" varchar(64) NOT NULL,
	"aggregateId" varchar(64) NOT NULL,
	"eventType" varchar(128) NOT NULL,
	"schemaVersion" integer DEFAULT 1 NOT NULL,
	"payload" jsonb NOT NULL,
	"idempotencyKey" varchar(128) NOT NULL,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"nextAttemptAt" timestamp DEFAULT now() NOT NULL,
	"lastError" text,
	"publishedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_events_eventId_unique" UNIQUE("eventId"),
	CONSTRAINT "outbox_events_idempotencyKey_unique" UNIQUE("idempotencyKey")
);
--> statement-breakpoint
CREATE TABLE "platform_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"eventType" varchar(128) NOT NULL,
	"actorType" varchar(32),
	"actorId" integer,
	"resourceType" varchar(64),
	"resourceId" integer,
	"properties" jsonb,
	"sessionId" varchar(128),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_inquiries" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplierId" integer NOT NULL,
	"travelRequestId" integer,
	"memberId" integer,
	"requestedByUserId" integer NOT NULL,
	"serviceType" varchar(128) NOT NULL,
	"requestDetails" text NOT NULL,
	"checkInDate" timestamp,
	"checkOutDate" timestamp,
	"guestCount" integer,
	"budget" numeric(10, 2),
	"currency" varchar(8) DEFAULT 'GBP',
	"status" "pricing_inquiry_status" DEFAULT 'pending' NOT NULL,
	"responseDetails" text,
	"quotedPrice" numeric(10, 2),
	"respondedAt" timestamp,
	"expiresAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposal_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"proposalId" integer NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"itemType" varchar(64) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"supplierId" integer,
	"supplierRef" varchar(128),
	"checkIn" timestamp,
	"checkOut" timestamp,
	"nights" integer,
	"unitPrice" numeric(12, 2),
	"quantity" integer DEFAULT 1,
	"totalPrice" numeric(12, 2),
	"currency" varchar(8) DEFAULT 'GBP',
	"commissionRate" numeric(5, 2),
	"commissionAmount" numeric(12, 2),
	"notes" text,
	"imageUrl" varchar(1024),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" serial PRIMARY KEY NOT NULL,
	"travelRequestId" integer NOT NULL,
	"memberId" integer NOT NULL,
	"createdByUserId" integer,
	"title" varchar(255) NOT NULL,
	"description" text,
	"aiGenerated" boolean DEFAULT false NOT NULL,
	"aiModel" varchar(64),
	"status" "proposal_status" DEFAULT 'draft' NOT NULL,
	"totalPrice" numeric(12, 2),
	"currency" varchar(8) DEFAULT 'GBP',
	"validUntil" timestamp,
	"sentAt" timestamp,
	"approvedAt" timestamp,
	"rejectedAt" timestamp,
	"rejectionReason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"parentProposalId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revenue_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"snapshotDate" varchar(16) NOT NULL,
	"totalDailyRevenue" numeric(12, 2) DEFAULT '0',
	"averageBookingValue" numeric(10, 2) DEFAULT '0',
	"membershipFeesCollected" numeric(12, 2) DEFAULT '0',
	"revenueByCategory" jsonb,
	"bookingsCount" integer DEFAULT 0,
	"newMembersCount" integer DEFAULT 0,
	"activeRequestsCount" integer DEFAULT 0,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "revenue_snapshots_snapshotDate_unique" UNIQUE("snapshotDate")
);
--> statement-breakpoint
CREATE TABLE "supplier_contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplierId" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"role" varchar(128),
	"email" varchar(320),
	"phone" varchar(64),
	"isPrimary" boolean DEFAULT false NOT NULL,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_services" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplierId" integer NOT NULL,
	"serviceType" varchar(128) NOT NULL,
	"description" text,
	"basePrice" numeric(10, 2),
	"currency" varchar(8) DEFAULT 'GBP',
	"commissionRate" numeric(5, 2),
	"availability" varchar(255),
	"isActive" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"category" varchar(128),
	"subCategory" varchar(128),
	"country" varchar(128),
	"city" varchar(128),
	"rating" integer,
	"preferredStatus" boolean DEFAULT false NOT NULL,
	"contactEmail" varchar(320),
	"contactPhone" varchar(64),
	"website" varchar(512),
	"defaultCommissionRate" numeric(5, 2),
	"notes" text,
	"logoUrl" varchar(1024),
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(64) NOT NULL,
	"color" varchar(16),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tags_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "task_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"templateType" "task_template_type" NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"defaultPriority" "task_priority" DEFAULT 'medium' NOT NULL,
	"defaultDueDaysFromTrigger" integer DEFAULT 1,
	"checklistItems" jsonb,
	"triggerOnBookingStatus" varchar(64),
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "travel_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"memberId" integer NOT NULL,
	"destination" varchar(255) NOT NULL,
	"originCity" varchar(255),
	"dates" varchar(255) NOT NULL,
	"departureDate" timestamp,
	"returnDate" timestamp,
	"pax" integer NOT NULL,
	"adults" integer DEFAULT 1,
	"children" integer DEFAULT 0,
	"infants" integer DEFAULT 0,
	"budget" varchar(64),
	"budgetCurrency" varchar(8) DEFAULT 'GBP',
	"accommodationType" varchar(128),
	"flightClass" varchar(64),
	"specialRequests" text,
	"notes" text,
	"status" "travel_request_status" DEFAULT 'new' NOT NULL,
	"assignedToUserId" integer,
	"priority" "task_priority" DEFAULT 'medium' NOT NULL,
	"crmOpportunityId" varchar(64),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_timeline" (
	"id" serial PRIMARY KEY NOT NULL,
	"memberId" integer NOT NULL,
	"travelRequestId" integer,
	"bookingId" integer,
	"title" varchar(255) NOT NULL,
	"destination" varchar(255),
	"departureDate" timestamp,
	"returnDate" timestamp,
	"totalSpend" numeric(12, 2),
	"currency" varchar(8) DEFAULT 'GBP',
	"satisfactionScore" integer,
	"highlights" jsonb,
	"suppliersUsed" jsonb,
	"aiRecommendations" jsonb,
	"memberFeedback" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(255),
	"email" varchar(320) NOT NULL,
	"name" varchar(255),
	"loginMethod" varchar(64),
	"role" "role" DEFAULT 'advisor' NOT NULL,
	"avatarUrl" varchar(1024),
	"phone" varchar(64),
	"bio" text,
	"isActive" boolean DEFAULT true NOT NULL,
	"lastSignedIn" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vip_amenities" (
	"id" serial PRIMARY KEY NOT NULL,
	"memberId" integer NOT NULL,
	"bookingId" integer,
	"travelRequestId" integer,
	"amenityType" varchar(128) NOT NULL,
	"description" text,
	"supplierId" integer,
	"requestedByUserId" integer,
	"confirmedAt" timestamp,
	"deliveredAt" timestamp,
	"cost" numeric(8, 2),
	"currency" varchar(8) DEFAULT 'GBP',
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_executions" (
	"id" serial PRIMARY KEY NOT NULL,
	"workflowId" varchar(128) NOT NULL,
	"runId" varchar(128),
	"workflowType" varchar(128) NOT NULL,
	"taskQueue" varchar(128) NOT NULL,
	"aggregateType" varchar(64),
	"aggregateId" varchar(64),
	"status" varchar(32) DEFAULT 'running' NOT NULL,
	"input" jsonb NOT NULL,
	"result" jsonb,
	"error" text,
	"startedAt" timestamp DEFAULT now() NOT NULL,
	"completedAt" timestamp,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_executions_workflowId_unique" UNIQUE("workflowId")
);
--> statement-breakpoint
CREATE INDEX "advisor_tasks_assignedTo_idx" ON "advisor_tasks" USING btree ("assignedToUserId");--> statement-breakpoint
CREATE INDEX "advisor_tasks_memberId_idx" ON "advisor_tasks" USING btree ("memberId");--> statement-breakpoint
CREATE INDEX "advisor_tasks_status_idx" ON "advisor_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "advisor_tasks_dueDate_idx" ON "advisor_tasks" USING btree ("dueDate");--> statement-breakpoint
CREATE INDEX "ai_inference_runs_status_created_idx" ON "ai_inference_runs" USING btree ("status","createdAt");--> statement-breakpoint
CREATE INDEX "ai_inference_runs_member_created_idx" ON "ai_inference_runs" USING btree ("memberId","createdAt");--> statement-breakpoint
CREATE INDEX "ai_inference_runs_request_created_idx" ON "ai_inference_runs" USING btree ("travelRequestId","createdAt");--> statement-breakpoint
CREATE INDEX "ai_insights_memberId_idx" ON "ai_insights" USING btree ("memberId");--> statement-breakpoint
CREATE INDEX "ai_insights_type_idx" ON "ai_insights" USING btree ("insightType");--> statement-breakpoint
CREATE INDEX "ai_insights_createdAt_idx" ON "ai_insights" USING btree ("createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "api_idempotency_keys_scope_key_unique" ON "api_idempotency_keys" USING btree ("scope","key");--> statement-breakpoint
CREATE INDEX "api_idempotency_keys_expiry_idx" ON "api_idempotency_keys" USING btree ("expiresAt");--> statement-breakpoint
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs" USING btree ("actorId");--> statement-breakpoint
CREATE INDEX "audit_logs_resourceType_idx" ON "audit_logs" USING btree ("resourceType");--> statement-breakpoint
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs" USING btree ("createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "authorization_sync_state_relation_unique" ON "authorization_sync_state" USING btree ("subjectType","subjectId","resourceType","resourceId","relation");--> statement-breakpoint
CREATE INDEX "authorization_sync_state_resource_idx" ON "authorization_sync_state" USING btree ("resourceType","resourceId");--> statement-breakpoint
CREATE INDEX "bookings_memberId_idx" ON "bookings" USING btree ("memberId");--> statement-breakpoint
CREATE INDEX "bookings_proposalId_idx" ON "bookings" USING btree ("proposalId");--> statement-breakpoint
CREATE INDEX "bookings_status_idx" ON "bookings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bookings_createdAt_idx" ON "bookings" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "celebrations_memberId_idx" ON "celebrations" USING btree ("memberId");--> statement-breakpoint
CREATE INDEX "celebrations_date_idx" ON "celebrations" USING btree ("celebrationDate");--> statement-breakpoint
CREATE INDEX "chatwoot_conv_memberId_idx" ON "chatwoot_conversations" USING btree ("memberId");--> statement-breakpoint
CREATE INDEX "chatwoot_conv_status_idx" ON "chatwoot_conversations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "chatwoot_msg_conversationId_idx" ON "chatwoot_messages" USING btree ("conversationId");--> statement-breakpoint
CREATE INDEX "commission_ledger_bookingId_idx" ON "commission_ledger" USING btree ("bookingId");--> statement-breakpoint
CREATE INDEX "commission_ledger_status_idx" ON "commission_ledger" USING btree ("status");--> statement-breakpoint
CREATE INDEX "commission_ledger_advisorId_idx" ON "commission_ledger" USING btree ("advisorId");--> statement-breakpoint
CREATE INDEX "comm_timeline_memberId_idx" ON "communication_timeline" USING btree ("memberId");--> statement-breakpoint
CREATE INDEX "comm_timeline_type_idx" ON "communication_timeline" USING btree ("communicationType");--> statement-breakpoint
CREATE INDEX "comm_timeline_createdAt_idx" ON "communication_timeline" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "comm_timeline_followUp_idx" ON "communication_timeline" USING btree ("followUpRequired","followUpDueAt");--> statement-breakpoint
CREATE INDEX "conversations_memberId_idx" ON "conversations" USING btree ("memberId");--> statement-breakpoint
CREATE INDEX "conversations_channel_idx" ON "conversations" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "documents_memberId_idx" ON "documents" USING btree ("memberId");--> statement-breakpoint
CREATE INDEX "documents_bookingId_idx" ON "documents" USING btree ("bookingId");--> statement-breakpoint
CREATE UNIQUE INDEX "event_deliveries_event_target_unique" ON "event_deliveries" USING btree ("outboxEventId","target");--> statement-breakpoint
CREATE INDEX "event_deliveries_status_created_idx" ON "event_deliveries" USING btree ("status","createdAt");--> statement-breakpoint
CREATE INDEX "invoice_line_items_invoiceId_idx" ON "invoice_line_items" USING btree ("invoiceId");--> statement-breakpoint
CREATE INDEX "invoices_memberId_idx" ON "invoices" USING btree ("memberId");--> statement-breakpoint
CREATE INDEX "invoices_supplierId_idx" ON "invoices" USING btree ("supplierId");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "invoices_type_idx" ON "invoices" USING btree ("invoiceType");--> statement-breakpoint
CREATE INDEX "invoices_dueDate_idx" ON "invoices" USING btree ("dueDate");--> statement-breakpoint
CREATE INDEX "lakehouse_checkpoints_topic_partition_idx" ON "lakehouse_checkpoints" USING btree ("topic","partition");--> statement-breakpoint
CREATE INDEX "ledger_accounts_member_idx" ON "ledger_accounts" USING btree ("memberId");--> statement-breakpoint
CREATE INDEX "ledger_accounts_supplier_idx" ON "ledger_accounts" USING btree ("supplierId");--> statement-breakpoint
CREATE INDEX "ledger_accounts_advisor_idx" ON "ledger_accounts" USING btree ("advisorUserId");--> statement-breakpoint
CREATE INDEX "ledger_transfers_reference_idx" ON "ledger_transfers" USING btree ("referenceType","referenceId");--> statement-breakpoint
CREATE INDEX "ledger_transfers_debit_created_idx" ON "ledger_transfers" USING btree ("debitLedgerAccountId","createdAt");--> statement-breakpoint
CREATE INDEX "ledger_transfers_credit_created_idx" ON "ledger_transfers" USING btree ("creditLedgerAccountId","createdAt");--> statement-breakpoint
CREATE INDEX "family_members_memberId_idx" ON "member_family_members" USING btree ("memberId");--> statement-breakpoint
CREATE INDEX "member_invitations_email_idx" ON "member_invitations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "member_invitations_token_idx" ON "member_invitations" USING btree ("token");--> statement-breakpoint
CREATE INDEX "member_preferences_memberId_idx" ON "member_preferences" USING btree ("memberId");--> statement-breakpoint
CREATE INDEX "member_profiles_memberId_idx" ON "member_profiles" USING btree ("memberId");--> statement-breakpoint
CREATE INDEX "member_sessions_memberId_idx" ON "member_sessions" USING btree ("memberId");--> statement-breakpoint
CREATE INDEX "member_sessions_token_idx" ON "member_sessions" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "member_tags_unique" ON "member_tags" USING btree ("memberId","tagId");--> statement-breakpoint
CREATE INDEX "member_tags_memberId_idx" ON "member_tags" USING btree ("memberId");--> statement-breakpoint
CREATE INDEX "members_email_idx" ON "members" USING btree ("email");--> statement-breakpoint
CREATE INDEX "members_tier_idx" ON "members" USING btree ("tier");--> statement-breakpoint
CREATE INDEX "members_assignedAdvisor_idx" ON "members" USING btree ("assignedAdvisorId");--> statement-breakpoint
CREATE INDEX "messages_conversationId_idx" ON "messages" USING btree ("conversationId");--> statement-breakpoint
CREATE INDEX "messages_createdAt_idx" ON "messages" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "morning_briefings_date_idx" ON "morning_briefings" USING btree ("date");--> statement-breakpoint
CREATE INDEX "notifications_recipientUser_idx" ON "notifications" USING btree ("recipientUserId");--> statement-breakpoint
CREATE INDEX "notifications_recipientMember_idx" ON "notifications" USING btree ("recipientMemberId");--> statement-breakpoint
CREATE INDEX "notifications_isRead_idx" ON "notifications" USING btree ("isRead");--> statement-breakpoint
CREATE INDEX "notifications_createdAt_idx" ON "notifications" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "nps_responses_memberId_idx" ON "nps_responses" USING btree ("memberId");--> statement-breakpoint
CREATE INDEX "nps_responses_score_idx" ON "nps_responses" USING btree ("score");--> statement-breakpoint
CREATE INDEX "nps_responses_createdAt_idx" ON "nps_responses" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "outbox_events_status_next_attempt_idx" ON "outbox_events" USING btree ("status","nextAttemptAt");--> statement-breakpoint
CREATE INDEX "outbox_events_aggregate_idx" ON "outbox_events" USING btree ("aggregateType","aggregateId","createdAt");--> statement-breakpoint
CREATE INDEX "outbox_events_event_type_created_idx" ON "outbox_events" USING btree ("eventType","createdAt");--> statement-breakpoint
CREATE INDEX "platform_events_eventType_idx" ON "platform_events" USING btree ("eventType");--> statement-breakpoint
CREATE INDEX "platform_events_actorId_idx" ON "platform_events" USING btree ("actorId");--> statement-breakpoint
CREATE INDEX "platform_events_createdAt_idx" ON "platform_events" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "pricing_inquiries_supplierId_idx" ON "pricing_inquiries" USING btree ("supplierId");--> statement-breakpoint
CREATE INDEX "pricing_inquiries_travelRequest_idx" ON "pricing_inquiries" USING btree ("travelRequestId");--> statement-breakpoint
CREATE INDEX "pricing_inquiries_status_idx" ON "pricing_inquiries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "proposal_items_proposalId_idx" ON "proposal_items" USING btree ("proposalId");--> statement-breakpoint
CREATE INDEX "proposals_travelRequestId_idx" ON "proposals" USING btree ("travelRequestId");--> statement-breakpoint
CREATE INDEX "proposals_memberId_idx" ON "proposals" USING btree ("memberId");--> statement-breakpoint
CREATE INDEX "proposals_status_idx" ON "proposals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "revenue_snapshots_date_idx" ON "revenue_snapshots" USING btree ("snapshotDate");--> statement-breakpoint
CREATE INDEX "supplier_contacts_supplierId_idx" ON "supplier_contacts" USING btree ("supplierId");--> statement-breakpoint
CREATE INDEX "supplier_services_supplierId_idx" ON "supplier_services" USING btree ("supplierId");--> statement-breakpoint
CREATE INDEX "supplier_services_type_idx" ON "supplier_services" USING btree ("serviceType");--> statement-breakpoint
CREATE INDEX "suppliers_name_idx" ON "suppliers" USING btree ("name");--> statement-breakpoint
CREATE INDEX "suppliers_category_idx" ON "suppliers" USING btree ("category");--> statement-breakpoint
CREATE INDEX "suppliers_country_idx" ON "suppliers" USING btree ("country");--> statement-breakpoint
CREATE INDEX "task_templates_type_idx" ON "task_templates" USING btree ("templateType");--> statement-breakpoint
CREATE INDEX "travel_requests_memberId_idx" ON "travel_requests" USING btree ("memberId");--> statement-breakpoint
CREATE INDEX "travel_requests_status_idx" ON "travel_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "travel_requests_assignedTo_idx" ON "travel_requests" USING btree ("assignedToUserId");--> statement-breakpoint
CREATE INDEX "travel_requests_createdAt_idx" ON "travel_requests" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "trip_timeline_memberId_idx" ON "trip_timeline" USING btree ("memberId");--> statement-breakpoint
CREATE INDEX "trip_timeline_departure_idx" ON "trip_timeline" USING btree ("departureDate");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_openId_idx" ON "users" USING btree ("openId");--> statement-breakpoint
CREATE INDEX "vip_amenities_memberId_idx" ON "vip_amenities" USING btree ("memberId");--> statement-breakpoint
CREATE INDEX "vip_amenities_bookingId_idx" ON "vip_amenities" USING btree ("bookingId");--> statement-breakpoint
CREATE INDEX "workflow_executions_status_updated_idx" ON "workflow_executions" USING btree ("status","updatedAt");--> statement-breakpoint
CREATE INDEX "workflow_executions_aggregate_idx" ON "workflow_executions" USING btree ("aggregateType","aggregateId");