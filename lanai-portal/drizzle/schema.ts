/**
 * Lanai Lifestyle — Complete PostgreSQL Schema
 *
 * Stakeholders:
 *   - Advisor (advisor | senior_advisor | admin): staff portal users
 *   - Member (client): portal members with tier-gated access
 *
 * Tables:
 *   Core:        users, members, member_sessions, member_invitations
 *   Concierge:   travel_requests, proposals, proposal_items, bookings
 *   Suppliers:   suppliers, supplier_contacts
 *   Documents:   documents
 *   Messaging:   conversations, messages
 *   AI:          ai_insights, morning_briefings
 *   Finance:     commission_ledger_entries
 *   Audit:       audit_logs
 *   Notifications: notifications
 *   Preferences: member_preferences
 *   Analytics:   platform_events
 *   Tasks:       advisor_tasks
 *   Tags:        tags, member_tags
 */

import {
  pgTable,
  pgEnum,
  serial,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  numeric,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const roleEnum = pgEnum("role", ["advisor", "senior_advisor", "admin"]);
export const tierEnum = pgEnum("tier", ["platinum", "gold", "silver"]);
export const travelRequestStatusEnum = pgEnum("travel_request_status", [
  "new",
  "in_progress",
  "proposal_sent",
  "booked",
  "completed",
  "cancelled",
]);
export const proposalStatusEnum = pgEnum("proposal_status", [
  "draft",
  "sent",
  "approved",
  "rejected",
  "expired",
]);
export const bookingStatusEnum = pgEnum("booking_status", [
  "pending",
  "confirmed",
  "paid",
  "cancelled",
  "refunded",
]);
export const notificationTypeEnum = pgEnum("notification_type", [
  "travel_request",
  "proposal",
  "booking",
  "message",
  "payment",
  "system",
  "ai_insight",
]);
export const messageChannelEnum = pgEnum("message_channel", [
  "whatsapp",
  "email",
  "portal",
  "sms",
]);
export const messageSenderEnum = pgEnum("message_sender", [
  "member",
  "advisor",
  "ai",
]);
export const auditActionEnum = pgEnum("audit_action", [
  "create",
  "update",
  "delete",
  "login",
  "logout",
  "invite",
  "approve",
  "reject",
]);
export const taskStatusEnum = pgEnum("task_status", [
  "open",
  "in_progress",
  "done",
  "cancelled",
]);
export const taskPriorityEnum = pgEnum("task_priority", [
  "low",
  "medium",
  "high",
  "urgent",
]);
export const insightTypeEnum = pgEnum("insight_type", [
  "churn_risk",
  "upsell_opportunity",
  "preference_detected",
  "anniversary",
  "morning_briefing",
  "proposal_suggestion",
]);
export const commissionStatusEnum = pgEnum("commission_status", [
  "expected",
  "invoiced",
  "received",
  "disputed",
  "written_off",
]);

// ─── Core: Users (Advisors / Staff) ──────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    openId: varchar("openId", { length: 255 }).unique(),
    email: varchar("email", { length: 320 }).notNull().unique(),
    name: varchar("name", { length: 255 }),
    loginMethod: varchar("loginMethod", { length: 64 }),
    role: roleEnum("role").default("advisor").notNull(),
    avatarUrl: varchar("avatarUrl", { length: 1024 }),
    phone: varchar("phone", { length: 64 }),
    bio: text("bio"),
    isActive: boolean("isActive").default(true).notNull(),
    lastSignedIn: timestamp("lastSignedIn"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => [
    index("users_email_idx").on(t.email),
    index("users_openId_idx").on(t.openId),
  ],
);
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Core: Members (Clients) ──────────────────────────────────────────────────

export const members = pgTable(
  "members",
  {
    id: serial("id").primaryKey(),
    email: varchar("email", { length: 320 }).notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    pinHash: varchar("pinHash", { length: 255 }),
    tier: tierEnum("tier").default("gold").notNull(),
    crmPersonId: varchar("crmPersonId", { length: 64 }),
    onboardingComplete: boolean("onboardingComplete").default(false).notNull(),
    active: boolean("active").default(true).notNull(),
    invitedByUserId: integer("invitedByUserId"),
    assignedAdvisorId: integer("assignedAdvisorId"),
    stripeCustomerId: varchar("stripeCustomerId", { length: 64 }),
    stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 64 }),
    phone: varchar("phone", { length: 64 }),
    nationality: varchar("nationality", { length: 128 }),
    passportNumber: varchar("passportNumber", { length: 64 }),
    passportExpiry: timestamp("passportExpiry"),
    dateOfBirth: timestamp("dateOfBirth"),
    dietaryRequirements: text("dietaryRequirements"),
    accessibilityNeeds: text("accessibilityNeeds"),
    emergencyContactName: varchar("emergencyContactName", { length: 255 }),
    emergencyContactPhone: varchar("emergencyContactPhone", { length: 64 }),
    notes: text("notes"),
    lastSignedIn: timestamp("lastSignedIn"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => [
    index("members_email_idx").on(t.email),
    index("members_tier_idx").on(t.tier),
    index("members_assignedAdvisor_idx").on(t.assignedAdvisorId),
  ],
);
export type Member = typeof members.$inferSelect;
export type InsertMember = typeof members.$inferInsert;

// ─── Core: Member Sessions ────────────────────────────────────────────────────

export const memberSessions = pgTable(
  "member_sessions",
  {
    id: serial("id").primaryKey(),
    token: varchar("token", { length: 128 }).notNull().unique(),
    memberId: integer("memberId").notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("member_sessions_memberId_idx").on(t.memberId),
    index("member_sessions_token_idx").on(t.token),
  ],
);
export type MemberSession = typeof memberSessions.$inferSelect;
export type InsertMemberSession = typeof memberSessions.$inferInsert;

// ─── Core: Member Invitations ─────────────────────────────────────────────────

export const memberInvitations = pgTable(
  "member_invitations",
  {
    id: serial("id").primaryKey(),
    token: varchar("token", { length: 128 }).notNull().unique(),
    email: varchar("email", { length: 320 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    tier: tierEnum("tier").default("gold").notNull(),
    crmPersonId: varchar("crmPersonId", { length: 64 }),
    invitedByUserId: integer("invitedByUserId").notNull(),
    accepted: boolean("accepted").default(false).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("member_invitations_email_idx").on(t.email),
    index("member_invitations_token_idx").on(t.token),
  ],
);
export type MemberInvitation = typeof memberInvitations.$inferSelect;
export type InsertMemberInvitation = typeof memberInvitations.$inferInsert;

// ─── Concierge: Travel Requests ───────────────────────────────────────────────

export const travelRequests = pgTable(
  "travel_requests",
  {
    id: serial("id").primaryKey(),
    memberId: integer("memberId").notNull(),
    destination: varchar("destination", { length: 255 }).notNull(),
    originCity: varchar("originCity", { length: 255 }),
    dates: varchar("dates", { length: 255 }).notNull(),
    departureDate: timestamp("departureDate"),
    returnDate: timestamp("returnDate"),
    pax: integer("pax").notNull(),
    adults: integer("adults").default(1),
    children: integer("children").default(0),
    infants: integer("infants").default(0),
    budget: varchar("budget", { length: 64 }),
    budgetCurrency: varchar("budgetCurrency", { length: 8 }).default("GBP"),
    accommodationType: varchar("accommodationType", { length: 128 }),
    flightClass: varchar("flightClass", { length: 64 }),
    specialRequests: text("specialRequests"),
    notes: text("notes"),
    status: travelRequestStatusEnum("status").default("new").notNull(),
    assignedToUserId: integer("assignedToUserId"),
    priority: taskPriorityEnum("priority").default("medium").notNull(),
    crmOpportunityId: varchar("crmOpportunityId", { length: 64 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => [
    index("travel_requests_memberId_idx").on(t.memberId),
    index("travel_requests_status_idx").on(t.status),
    index("travel_requests_assignedTo_idx").on(t.assignedToUserId),
    index("travel_requests_createdAt_idx").on(t.createdAt),
  ],
);
export type TravelRequest = typeof travelRequests.$inferSelect;
export type InsertTravelRequest = typeof travelRequests.$inferInsert;

// ─── Concierge: Proposals ─────────────────────────────────────────────────────

export const proposals = pgTable(
  "proposals",
  {
    id: serial("id").primaryKey(),
    travelRequestId: integer("travelRequestId").notNull(),
    memberId: integer("memberId").notNull(),
    createdByUserId: integer("createdByUserId"),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    aiGenerated: boolean("aiGenerated").default(false).notNull(),
    aiModel: varchar("aiModel", { length: 64 }),
    status: proposalStatusEnum("status").default("draft").notNull(),
    totalPrice: numeric("totalPrice", { precision: 12, scale: 2 }),
    currency: varchar("currency", { length: 8 }).default("GBP"),
    validUntil: timestamp("validUntil"),
    sentAt: timestamp("sentAt"),
    approvedAt: timestamp("approvedAt"),
    rejectedAt: timestamp("rejectedAt"),
    rejectionReason: text("rejectionReason"),
    version: integer("version").default(1).notNull(),
    parentProposalId: integer("parentProposalId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => [
    index("proposals_travelRequestId_idx").on(t.travelRequestId),
    index("proposals_memberId_idx").on(t.memberId),
    index("proposals_status_idx").on(t.status),
  ],
);
export type Proposal = typeof proposals.$inferSelect;
export type InsertProposal = typeof proposals.$inferInsert;

// ─── Concierge: Proposal Items (line items within a proposal) ─────────────────

export const proposalItems = pgTable(
  "proposal_items",
  {
    id: serial("id").primaryKey(),
    proposalId: integer("proposalId").notNull(),
    sortOrder: integer("sortOrder").default(0).notNull(),
    itemType: varchar("itemType", { length: 64 }).notNull(), // flight, hotel, transfer, experience, insurance
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    supplierId: integer("supplierId"),
    supplierRef: varchar("supplierRef", { length: 128 }),
    checkIn: timestamp("checkIn"),
    checkOut: timestamp("checkOut"),
    nights: integer("nights"),
    unitPrice: numeric("unitPrice", { precision: 12, scale: 2 }),
    quantity: integer("quantity").default(1),
    totalPrice: numeric("totalPrice", { precision: 12, scale: 2 }),
    currency: varchar("currency", { length: 8 }).default("GBP"),
    commissionRate: numeric("commissionRate", { precision: 5, scale: 2 }),
    commissionAmount: numeric("commissionAmount", { precision: 12, scale: 2 }),
    notes: text("notes"),
    imageUrl: varchar("imageUrl", { length: 1024 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => [index("proposal_items_proposalId_idx").on(t.proposalId)],
);
export type ProposalItem = typeof proposalItems.$inferSelect;
export type InsertProposalItem = typeof proposalItems.$inferInsert;

// ─── Concierge: Bookings ──────────────────────────────────────────────────────

export const bookings = pgTable(
  "bookings",
  {
    id: serial("id").primaryKey(),
    proposalId: integer("proposalId").notNull(),
    memberId: integer("memberId").notNull(),
    supplierId: integer("supplierId"),
    createdByUserId: integer("createdByUserId"),
    referenceNumber: varchar("referenceNumber", { length: 128 }),
    supplierConfirmationRef: varchar("supplierConfirmationRef", {
      length: 128,
    }),
    status: bookingStatusEnum("status").default("pending").notNull(),
    totalAmount: numeric("totalAmount", { precision: 12, scale: 2 }),
    currency: varchar("currency", { length: 8 }).default("GBP"),
    commissionExpected: numeric("commissionExpected", {
      precision: 12,
      scale: 2,
    }),
    commissionReceived: boolean("commissionReceived").default(false).notNull(),
    commissionReceivedAt: timestamp("commissionReceivedAt"),
    commissionAmount: numeric("commissionAmount", { precision: 12, scale: 2 }),
    checkIn: timestamp("checkIn"),
    checkOut: timestamp("checkOut"),
    pax: integer("pax"),
    notes: text("notes"),
    cancellationPolicy: text("cancellationPolicy"),
    confirmedAt: timestamp("confirmedAt"),
    cancelledAt: timestamp("cancelledAt"),
    cancellationReason: text("cancellationReason"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => [
    index("bookings_memberId_idx").on(t.memberId),
    index("bookings_proposalId_idx").on(t.proposalId),
    index("bookings_status_idx").on(t.status),
    index("bookings_createdAt_idx").on(t.createdAt),
  ],
);
export type Booking = typeof bookings.$inferSelect;
export type InsertBooking = typeof bookings.$inferInsert;

// ─── Suppliers ────────────────────────────────────────────────────────────────

export const suppliers = pgTable(
  "suppliers",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    category: varchar("category", { length: 128 }),
    subCategory: varchar("subCategory", { length: 128 }),
    country: varchar("country", { length: 128 }),
    city: varchar("city", { length: 128 }),
    rating: integer("rating"),
    preferredStatus: boolean("preferredStatus").default(false).notNull(),
    contactEmail: varchar("contactEmail", { length: 320 }),
    contactPhone: varchar("contactPhone", { length: 64 }),
    website: varchar("website", { length: 512 }),
    defaultCommissionRate: numeric("defaultCommissionRate", {
      precision: 5,
      scale: 2,
    }),
    notes: text("notes"),
    logoUrl: varchar("logoUrl", { length: 1024 }),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => [
    index("suppliers_name_idx").on(t.name),
    index("suppliers_category_idx").on(t.category),
    index("suppliers_country_idx").on(t.country),
  ],
);
export type Supplier = typeof suppliers.$inferSelect;
export type InsertSupplier = typeof suppliers.$inferInsert;

// ─── Supplier Contacts ────────────────────────────────────────────────────────

export const supplierContacts = pgTable(
  "supplier_contacts",
  {
    id: serial("id").primaryKey(),
    supplierId: integer("supplierId").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    role: varchar("role", { length: 128 }),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 64 }),
    isPrimary: boolean("isPrimary").default(false).notNull(),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("supplier_contacts_supplierId_idx").on(t.supplierId)],
);
export type SupplierContact = typeof supplierContacts.$inferSelect;
export type InsertSupplierContact = typeof supplierContacts.$inferInsert;

// ─── Documents (Digital Vault) ────────────────────────────────────────────────

export const documents = pgTable(
  "documents",
  {
    id: serial("id").primaryKey(),
    memberId: integer("memberId").notNull(),
    travelRequestId: integer("travelRequestId"),
    bookingId: integer("bookingId"),
    title: varchar("title", { length: 255 }).notNull(),
    fileUrl: varchar("fileUrl", { length: 1024 }).notNull(),
    fileSize: integer("fileSize"),
    mimeType: varchar("mimeType", { length: 128 }),
    documentType: varchar("documentType", { length: 64 }),
    uploadedByUserId: integer("uploadedByUserId"),
    isVisibleToMember: boolean("isVisibleToMember").default(true).notNull(),
    expiresAt: timestamp("expiresAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("documents_memberId_idx").on(t.memberId),
    index("documents_bookingId_idx").on(t.bookingId),
  ],
);
export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;

// ─── Messaging: Conversations ─────────────────────────────────────────────────

export const conversations = pgTable(
  "conversations",
  {
    id: serial("id").primaryKey(),
    memberId: integer("memberId").notNull(),
    assignedAdvisorId: integer("assignedAdvisorId"),
    channel: messageChannelEnum("channel").default("portal").notNull(),
    subject: varchar("subject", { length: 255 }),
    isResolved: boolean("isResolved").default(false).notNull(),
    lastMessageAt: timestamp("lastMessageAt"),
    travelRequestId: integer("travelRequestId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => [
    index("conversations_memberId_idx").on(t.memberId),
    index("conversations_channel_idx").on(t.channel),
  ],
);
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;

// ─── Messaging: Messages ──────────────────────────────────────────────────────

export const messages = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversationId").notNull(),
    senderType: messageSenderEnum("senderType").notNull(),
    senderMemberId: integer("senderMemberId"),
    senderUserId: integer("senderUserId"),
    body: text("body").notNull(),
    attachmentUrl: varchar("attachmentUrl", { length: 1024 }),
    isRead: boolean("isRead").default(false).notNull(),
    readAt: timestamp("readAt"),
    aiDraftReply: text("aiDraftReply"),
    externalMessageId: varchar("externalMessageId", { length: 255 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("messages_conversationId_idx").on(t.conversationId),
    index("messages_createdAt_idx").on(t.createdAt),
  ],
);
export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

// ─── AI: Insights ─────────────────────────────────────────────────────────────

export const aiInsights = pgTable(
  "ai_insights",
  {
    id: serial("id").primaryKey(),
    memberId: integer("memberId"),
    travelRequestId: integer("travelRequestId"),
    insightType: insightTypeEnum("insightType").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    body: text("body").notNull(),
    confidence: numeric("confidence", { precision: 5, scale: 4 }),
    model: varchar("model", { length: 64 }),
    metadata: jsonb("metadata"),
    isActioned: boolean("isActioned").default(false).notNull(),
    actionedByUserId: integer("actionedByUserId"),
    actionedAt: timestamp("actionedAt"),
    expiresAt: timestamp("expiresAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("ai_insights_memberId_idx").on(t.memberId),
    index("ai_insights_type_idx").on(t.insightType),
    index("ai_insights_createdAt_idx").on(t.createdAt),
  ],
);
export type AiInsight = typeof aiInsights.$inferSelect;
export type InsertAiInsight = typeof aiInsights.$inferInsert;

// ─── AI: Morning Briefings ────────────────────────────────────────────────────

export const morningBriefings = pgTable(
  "morning_briefings",
  {
    id: serial("id").primaryKey(),
    date: varchar("date", { length: 16 }).notNull().unique(),
    generatedByUserId: integer("generatedByUserId"),
    headline: varchar("headline", { length: 512 }),
    body: text("body").notNull(),
    urgentItems: jsonb("urgentItems"),
    opportunities: jsonb("opportunities"),
    model: varchar("model", { length: 64 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("morning_briefings_date_idx").on(t.date)],
);
export type MorningBriefing = typeof morningBriefings.$inferSelect;
export type InsertMorningBriefing = typeof morningBriefings.$inferInsert;

// ─── Finance: Commission Ledger ───────────────────────────────────────────────

export const commissionLedger = pgTable(
  "commission_ledger",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("bookingId").notNull(),
    memberId: integer("memberId").notNull(),
    supplierId: integer("supplierId"),
    advisorId: integer("advisorId"),
    status: commissionStatusEnum("status").default("expected").notNull(),
    expectedAmount: numeric("expectedAmount", {
      precision: 12,
      scale: 2,
    }).notNull(),
    receivedAmount: numeric("receivedAmount", { precision: 12, scale: 2 }),
    currency: varchar("currency", { length: 8 }).default("GBP"),
    expectedDate: timestamp("expectedDate"),
    receivedDate: timestamp("receivedDate"),
    invoiceRef: varchar("invoiceRef", { length: 128 }),
    notes: text("notes"),
    tigerBeetleTransferId: varchar("tigerBeetleTransferId", { length: 128 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => [
    index("commission_ledger_bookingId_idx").on(t.bookingId),
    index("commission_ledger_status_idx").on(t.status),
    index("commission_ledger_advisorId_idx").on(t.advisorId),
  ],
);
export type CommissionLedgerEntry = typeof commissionLedger.$inferSelect;
export type InsertCommissionLedgerEntry = typeof commissionLedger.$inferInsert;

// ─── Audit Logs ───────────────────────────────────────────────────────────────

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    actorType: varchar("actorType", { length: 32 }).notNull(), // user | member | system
    actorId: integer("actorId"),
    action: auditActionEnum("action").notNull(),
    resourceType: varchar("resourceType", { length: 64 }).notNull(),
    resourceId: integer("resourceId"),
    before: jsonb("before"),
    after: jsonb("after"),
    ipAddress: varchar("ipAddress", { length: 64 }),
    userAgent: varchar("userAgent", { length: 512 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("audit_logs_actorId_idx").on(t.actorId),
    index("audit_logs_resourceType_idx").on(t.resourceType),
    index("audit_logs_createdAt_idx").on(t.createdAt),
  ],
);
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

// ─── Notifications ────────────────────────────────────────────────────────────

export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    recipientType: varchar("recipientType", { length: 32 }).notNull(), // user | member
    recipientUserId: integer("recipientUserId"),
    recipientMemberId: integer("recipientMemberId"),
    type: notificationTypeEnum("type").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    body: text("body"),
    resourceType: varchar("resourceType", { length: 64 }),
    resourceId: integer("resourceId"),
    isRead: boolean("isRead").default(false).notNull(),
    readAt: timestamp("readAt"),
    actionUrl: varchar("actionUrl", { length: 512 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("notifications_recipientUser_idx").on(t.recipientUserId),
    index("notifications_recipientMember_idx").on(t.recipientMemberId),
    index("notifications_isRead_idx").on(t.isRead),
    index("notifications_createdAt_idx").on(t.createdAt),
  ],
);
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

// ─── Member Preferences ───────────────────────────────────────────────────────

export const memberPreferences = pgTable(
  "member_preferences",
  {
    id: serial("id").primaryKey(),
    memberId: integer("memberId").notNull().unique(),
    preferredAirlines: jsonb("preferredAirlines"),
    preferredHotelChains: jsonb("preferredHotelChains"),
    preferredCabinClass: varchar("preferredCabinClass", { length: 64 }),
    preferredRoomType: varchar("preferredRoomType", { length: 128 }),
    frequentFlyerNumbers: jsonb("frequentFlyerNumbers"),
    hotelLoyaltyNumbers: jsonb("hotelLoyaltyNumbers"),
    seatPreference: varchar("seatPreference", { length: 64 }),
    mealPreference: varchar("mealPreference", { length: 128 }),
    travelStyle: varchar("travelStyle", { length: 128 }),
    favouriteDestinations: jsonb("favouriteDestinations"),
    bucketListDestinations: jsonb("bucketListDestinations"),
    avoidedDestinations: jsonb("avoidedDestinations"),
    communicationPreference: varchar("communicationPreference", {
      length: 64,
    }).default("email"),
    notifyOnProposal: boolean("notifyOnProposal").default(true).notNull(),
    notifyOnBooking: boolean("notifyOnBooking").default(true).notNull(),
    notifyOnMessage: boolean("notifyOnMessage").default(true).notNull(),
    customPreferences: jsonb("customPreferences"),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => [index("member_preferences_memberId_idx").on(t.memberId)],
);
export type MemberPreference = typeof memberPreferences.$inferSelect;
export type InsertMemberPreference = typeof memberPreferences.$inferInsert;

// ─── Platform Events (Analytics) ─────────────────────────────────────────────

export const platformEvents = pgTable(
  "platform_events",
  {
    id: serial("id").primaryKey(),
    eventType: varchar("eventType", { length: 128 }).notNull(),
    actorType: varchar("actorType", { length: 32 }),
    actorId: integer("actorId"),
    resourceType: varchar("resourceType", { length: 64 }),
    resourceId: integer("resourceId"),
    properties: jsonb("properties"),
    sessionId: varchar("sessionId", { length: 128 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("platform_events_eventType_idx").on(t.eventType),
    index("platform_events_actorId_idx").on(t.actorId),
    index("platform_events_createdAt_idx").on(t.createdAt),
  ],
);
export type PlatformEvent = typeof platformEvents.$inferSelect;
export type InsertPlatformEvent = typeof platformEvents.$inferInsert;

// ─── Advisor Tasks ────────────────────────────────────────────────────────────

export const advisorTasks = pgTable(
  "advisor_tasks",
  {
    id: serial("id").primaryKey(),
    assignedToUserId: integer("assignedToUserId").notNull(),
    createdByUserId: integer("createdByUserId"),
    memberId: integer("memberId"),
    travelRequestId: integer("travelRequestId"),
    bookingId: integer("bookingId"),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    status: taskStatusEnum("status").default("open").notNull(),
    priority: taskPriorityEnum("priority").default("medium").notNull(),
    dueDate: timestamp("dueDate"),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => [
    index("advisor_tasks_assignedTo_idx").on(t.assignedToUserId),
    index("advisor_tasks_memberId_idx").on(t.memberId),
    index("advisor_tasks_status_idx").on(t.status),
    index("advisor_tasks_dueDate_idx").on(t.dueDate),
  ],
);
export type AdvisorTask = typeof advisorTasks.$inferSelect;
export type InsertAdvisorTask = typeof advisorTasks.$inferInsert;

// ─── Tags ─────────────────────────────────────────────────────────────────────

export const tags = pgTable("tags", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 64 }).notNull().unique(),
  color: varchar("color", { length: 16 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Tag = typeof tags.$inferSelect;
export type InsertTag = typeof tags.$inferInsert;

export const memberTags = pgTable(
  "member_tags",
  {
    id: serial("id").primaryKey(),
    memberId: integer("memberId").notNull(),
    tagId: integer("tagId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("member_tags_unique").on(t.memberId, t.tagId),
    index("member_tags_memberId_idx").on(t.memberId),
  ],
);
export type MemberTag = typeof memberTags.$inferSelect;
export type InsertMemberTag = typeof memberTags.$inferInsert;

// ─── Drizzle Relations ────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  assignedMembers: many(members, { relationName: "assignedAdvisor" }),
  createdTasks: many(advisorTasks, { relationName: "createdByUser" }),
  assignedTasks: many(advisorTasks, { relationName: "assignedToUser" }),
  auditLogs: many(auditLogs),
  notifications: many(notifications),
}));

export const membersRelations = relations(members, ({ one, many }) => ({
  assignedAdvisor: one(users, {
    fields: [members.assignedAdvisorId],
    references: [users.id],
    relationName: "assignedAdvisor",
  }),
  travelRequests: many(travelRequests),
  proposals: many(proposals),
  bookings: many(bookings),
  documents: many(documents),
  conversations: many(conversations),
  preferences: one(memberPreferences),
  notifications: many(notifications),
  aiInsights: many(aiInsights),
  tags: many(memberTags),
}));

export const travelRequestsRelations = relations(
  travelRequests,
  ({ one, many }) => ({
    member: one(members, {
      fields: [travelRequests.memberId],
      references: [members.id],
    }),
    assignedAdvisor: one(users, {
      fields: [travelRequests.assignedToUserId],
      references: [users.id],
    }),
    proposals: many(proposals),
    documents: many(documents),
    conversations: many(conversations),
    tasks: many(advisorTasks),
    aiInsights: many(aiInsights),
  }),
);

export const proposalsRelations = relations(proposals, ({ one, many }) => ({
  travelRequest: one(travelRequests, {
    fields: [proposals.travelRequestId],
    references: [travelRequests.id],
  }),
  member: one(members, {
    fields: [proposals.memberId],
    references: [members.id],
  }),
  createdBy: one(users, {
    fields: [proposals.createdByUserId],
    references: [users.id],
  }),
  items: many(proposalItems),
  bookings: many(bookings),
}));

export const proposalItemsRelations = relations(proposalItems, ({ one }) => ({
  proposal: one(proposals, {
    fields: [proposalItems.proposalId],
    references: [proposals.id],
  }),
  supplier: one(suppliers, {
    fields: [proposalItems.supplierId],
    references: [suppliers.id],
  }),
}));

export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  proposal: one(proposals, {
    fields: [bookings.proposalId],
    references: [proposals.id],
  }),
  member: one(members, {
    fields: [bookings.memberId],
    references: [members.id],
  }),
  supplier: one(suppliers, {
    fields: [bookings.supplierId],
    references: [suppliers.id],
  }),
  documents: many(documents),
  commissionEntries: many(commissionLedger),
}));

export const suppliersRelations = relations(suppliers, ({ many }) => ({
  contacts: many(supplierContacts),
  proposalItems: many(proposalItems),
  bookings: many(bookings),
  commissionEntries: many(commissionLedger),
}));

export const supplierContactsRelations = relations(
  supplierContacts,
  ({ one }) => ({
    supplier: one(suppliers, {
      fields: [supplierContacts.supplierId],
      references: [suppliers.id],
    }),
  }),
);

export const documentsRelations = relations(documents, ({ one }) => ({
  member: one(members, {
    fields: [documents.memberId],
    references: [members.id],
  }),
  travelRequest: one(travelRequests, {
    fields: [documents.travelRequestId],
    references: [travelRequests.id],
  }),
  booking: one(bookings, {
    fields: [documents.bookingId],
    references: [bookings.id],
  }),
}));

export const conversationsRelations = relations(
  conversations,
  ({ one, many }) => ({
    member: one(members, {
      fields: [conversations.memberId],
      references: [members.id],
    }),
    assignedAdvisor: one(users, {
      fields: [conversations.assignedAdvisorId],
      references: [users.id],
    }),
    messages: many(messages),
  }),
);

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

export const commissionLedgerRelations = relations(
  commissionLedger,
  ({ one }) => ({
    booking: one(bookings, {
      fields: [commissionLedger.bookingId],
      references: [bookings.id],
    }),
    supplier: one(suppliers, {
      fields: [commissionLedger.supplierId],
      references: [suppliers.id],
    }),
    advisor: one(users, {
      fields: [commissionLedger.advisorId],
      references: [users.id],
    }),
  }),
);

export const memberPreferencesRelations = relations(
  memberPreferences,
  ({ one }) => ({
    member: one(members, {
      fields: [memberPreferences.memberId],
      references: [members.id],
    }),
  }),
);

export const aiInsightsRelations = relations(aiInsights, ({ one }) => ({
  member: one(members, {
    fields: [aiInsights.memberId],
    references: [members.id],
  }),
}));

export const advisorTasksRelations = relations(advisorTasks, ({ one }) => ({
  assignedTo: one(users, {
    fields: [advisorTasks.assignedToUserId],
    references: [users.id],
    relationName: "assignedToUser",
  }),
  createdBy: one(users, {
    fields: [advisorTasks.createdByUserId],
    references: [users.id],
    relationName: "createdByUser",
  }),
  member: one(members, {
    fields: [advisorTasks.memberId],
    references: [members.id],
  }),
}));

export const memberTagsRelations = relations(memberTags, ({ one }) => ({
  member: one(members, {
    fields: [memberTags.memberId],
    references: [members.id],
  }),
  tag: one(tags, {
    fields: [memberTags.tagId],
    references: [tags.id],
  }),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  memberTags: many(memberTags),
}));

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2 EXTENSIONS — Human Tester Feedback Implementation
// ─────────────────────────────────────────────────────────────────────────────

// ─── New Enums ────────────────────────────────────────────────────────────────

export const invoiceTypeEnum = pgEnum("invoice_type", [
  "client_service", // invoice sent to member for non-hotel services
  "commission", // commission invoice sent to supplier at month-end
]);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "sent",
  "paid",
  "overdue",
  "voided",
  "disputed",
]);

export const invoiceLineItemTypeEnum = pgEnum("invoice_line_item_type", [
  "hotel",
  "flight",
  "villa",
  "apartment",
  "yacht",
  "jet",
  "transfer",
  "restaurant",
  "event",
  "experience",
  "membership_fee",
  "ancillary",
  "other",
]);

export const pricingInquiryStatusEnum = pgEnum("pricing_inquiry_status", [
  "pending",
  "responded",
  "accepted",
  "declined",
  "expired",
]);

export const celebrationTypeEnum = pgEnum("celebration_type", [
  "birthday",
  "anniversary",
  "graduation",
  "honeymoon",
  "retirement",
  "promotion",
  "other",
]);

export const npsResponseEnum = pgEnum("nps_response", [
  "promoter", // 9-10
  "passive", // 7-8
  "detractor", // 0-6
]);

export const taskTemplateTypeEnum = pgEnum("task_template_type", [
  "airport_fast_track",
  "villa_provisioning",
  "yacht_charter",
  "restaurant_reservation",
  "celebration_planning",
  "visa_check",
  "welcome_gift",
  "vip_amenity",
  "jet_charter",
  "transfer_arrangement",
  "custom",
]);

export const communicationTypeEnum = pgEnum("communication_type", [
  "email",
  "whatsapp",
  "phone_call",
  "portal_message",
  "internal_note",
  "sms",
]);

export const sentimentEnum = pgEnum("sentiment", [
  "positive",
  "neutral",
  "negative",
  "urgent",
]);

// ─── Member Family Members ────────────────────────────────────────────────────

export const memberFamilyMembers = pgTable(
  "member_family_members",
  {
    id: serial("id").primaryKey(),
    memberId: integer("memberId").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    relationship: varchar("relationship", { length: 64 }).notNull(), // spouse, child, parent, etc.
    dateOfBirth: timestamp("dateOfBirth"),
    passportNumber: varchar("passportNumber", { length: 64 }),
    passportExpiry: timestamp("passportExpiry"),
    nationality: varchar("nationality", { length: 128 }),
    dietaryRequirements: text("dietaryRequirements"),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => [index("family_members_memberId_idx").on(t.memberId)],
);
export type MemberFamilyMember = typeof memberFamilyMembers.$inferSelect;
export type InsertMemberFamilyMember = typeof memberFamilyMembers.$inferInsert;

// ─── Member Extended Profile ──────────────────────────────────────────────────
// Stores rich luxury-profile data that is too large/structured for the members table

export const memberProfiles = pgTable(
  "member_profiles",
  {
    id: serial("id").primaryKey(),
    memberId: integer("memberId").notNull().unique(),

    // Frequent Flyer & Loyalty
    frequentFlyerNumbers: jsonb("frequentFlyerNumbers"), // [{ airline: "BA", number: "BA123456" }]
    hotelLoyaltyNumbers: jsonb("hotelLoyaltyNumbers"), // [{ chain: "Marriott", number: "M123456", tier: "Titanium" }]

    // Travel Documents
    visaExpiry: jsonb("visaExpiry"), // [{ country: "USA", expiry: "2027-01-01" }]
    globalEntryNumber: varchar("globalEntryNumber", { length: 64 }),
    knownTravellerNumber: varchar("knownTravellerNumber", { length: 64 }),

    // Preferences
    preferredPaymentMethod: varchar("preferredPaymentMethod", { length: 128 }),
    preferredCurrency: varchar("preferredCurrency", { length: 8 }).default(
      "GBP",
    ),
    preferredHotelBrands: jsonb("preferredHotelBrands"), // ["Four Seasons", "Aman"]
    roomPreferences: jsonb("roomPreferences"), // { type: "suite", floor: "high", view: "ocean", pillow: "soft" }
    seatPreference: varchar("seatPreference", { length: 64 }), // window, aisle, bulkhead
    cabinClass: varchar("cabinClass", { length: 32 }).default("business"),
    dietaryRequirements: jsonb("dietaryRequirements"), // ["halal", "gluten-free"]
    allergies: text("allergies"),
    favouriteDestinations: jsonb("favouriteDestinations"),
    bucketListDestinations: jsonb("bucketListDestinations"),
    travelStyle: jsonb("travelStyle"), // ["adventure", "wellness", "cultural"]
    amenityPreferences: jsonb("amenityPreferences"), // ["champagne on arrival", "fruit basket"]

    // Celebration Dates
    anniversaryDate: timestamp("anniversaryDate"),
    weddingAnniversaryDate: timestamp("weddingAnniversaryDate"),

    // Personal & Professional
    personalAssistantName: varchar("personalAssistantName", { length: 255 }),
    personalAssistantEmail: varchar("personalAssistantEmail", { length: 320 }),
    personalAssistantPhone: varchar("personalAssistantPhone", { length: 64 }),
    familyOfficeContactName: varchar("familyOfficeContactName", {
      length: 255,
    }),
    familyOfficeContactEmail: varchar("familyOfficeContactEmail", {
      length: 320,
    }),
    familyOfficeContactPhone: varchar("familyOfficeContactPhone", {
      length: 64,
    }),

    // Security & Privacy
    securityLevel: varchar("securityLevel", { length: 32 }).default("standard"), // standard, enhanced, maximum
    privacyNotes: text("privacyNotes"),
    nda: boolean("nda").default(false).notNull(),

    // Revenue & Value
    lifetimeRevenue: numeric("lifetimeRevenue", {
      precision: 12,
      scale: 2,
    }).default("0"),
    annualRevenue: numeric("annualRevenue", {
      precision: 12,
      scale: 2,
    }).default("0"),
    membershipFeesPaid: numeric("membershipFeesPaid", {
      precision: 12,
      scale: 2,
    }).default("0"),
    satisfactionScore: numeric("satisfactionScore", { precision: 3, scale: 1 }),
    lastNpsScore: integer("lastNpsScore"),
    conciergeNotes: text("conciergeNotes"),

    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => [index("member_profiles_memberId_idx").on(t.memberId)],
);
export type MemberProfile = typeof memberProfiles.$inferSelect;
export type InsertMemberProfile = typeof memberProfiles.$inferInsert;

// ─── Supplier Services ────────────────────────────────────────────────────────

export const supplierServices = pgTable(
  "supplier_services",
  {
    id: serial("id").primaryKey(),
    supplierId: integer("supplierId").notNull(),
    serviceType: varchar("serviceType", { length: 128 }).notNull(), // "hotel_rooms", "private_dining", "spa", "transfers"
    description: text("description"),
    basePrice: numeric("basePrice", { precision: 10, scale: 2 }),
    currency: varchar("currency", { length: 8 }).default("GBP"),
    commissionRate: numeric("commissionRate", { precision: 5, scale: 2 }),
    availability: varchar("availability", { length: 255 }),
    isActive: boolean("isActive").default(true).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => [
    index("supplier_services_supplierId_idx").on(t.supplierId),
    index("supplier_services_type_idx").on(t.serviceType),
  ],
);
export type SupplierService = typeof supplierServices.$inferSelect;
export type InsertSupplierService = typeof supplierServices.$inferInsert;

// ─── Pricing Inquiries ────────────────────────────────────────────────────────

export const pricingInquiries = pgTable(
  "pricing_inquiries",
  {
    id: serial("id").primaryKey(),
    supplierId: integer("supplierId").notNull(),
    travelRequestId: integer("travelRequestId"),
    memberId: integer("memberId"),
    requestedByUserId: integer("requestedByUserId").notNull(),
    serviceType: varchar("serviceType", { length: 128 }).notNull(),
    requestDetails: text("requestDetails").notNull(),
    checkInDate: timestamp("checkInDate"),
    checkOutDate: timestamp("checkOutDate"),
    guestCount: integer("guestCount"),
    budget: numeric("budget", { precision: 10, scale: 2 }),
    currency: varchar("currency", { length: 8 }).default("GBP"),
    status: pricingInquiryStatusEnum("status").default("pending").notNull(),
    responseDetails: text("responseDetails"),
    quotedPrice: numeric("quotedPrice", { precision: 10, scale: 2 }),
    respondedAt: timestamp("respondedAt"),
    expiresAt: timestamp("expiresAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => [
    index("pricing_inquiries_supplierId_idx").on(t.supplierId),
    index("pricing_inquiries_travelRequest_idx").on(t.travelRequestId),
    index("pricing_inquiries_status_idx").on(t.status),
  ],
);
export type PricingInquiry = typeof pricingInquiries.$inferSelect;
export type InsertPricingInquiry = typeof pricingInquiries.$inferInsert;

// ─── Invoices ─────────────────────────────────────────────────────────────────

export const invoices = pgTable(
  "invoices",
  {
    id: serial("id").primaryKey(),
    invoiceNumber: varchar("invoiceNumber", { length: 64 }).notNull().unique(),
    invoiceType: invoiceTypeEnum("invoiceType").notNull(),
    status: invoiceStatusEnum("status").default("draft").notNull(),

    // Recipient — either a member (client invoice) or supplier (commission invoice)
    memberId: integer("memberId"),
    supplierId: integer("supplierId"),

    // Linked records
    bookingId: integer("bookingId"),
    travelRequestId: integer("travelRequestId"),

    // Financial
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
    taxAmount: numeric("taxAmount", { precision: 12, scale: 2 }).default("0"),
    discountAmount: numeric("discountAmount", {
      precision: 12,
      scale: 2,
    }).default("0"),
    totalAmount: numeric("totalAmount", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 8 }).default("GBP"),
    commissionRate: numeric("commissionRate", { precision: 5, scale: 2 }),

    // Dates
    issuedAt: timestamp("issuedAt"),
    dueDate: timestamp("dueDate"),
    paidAt: timestamp("paidAt"),

    // Content
    notes: text("notes"),
    pdfUrl: varchar("pdfUrl", { length: 1024 }),
    brandedLogoUrl: varchar("brandedLogoUrl", { length: 1024 }),

    // Audit
    createdByUserId: integer("createdByUserId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => [
    index("invoices_memberId_idx").on(t.memberId),
    index("invoices_supplierId_idx").on(t.supplierId),
    index("invoices_status_idx").on(t.status),
    index("invoices_type_idx").on(t.invoiceType),
    index("invoices_dueDate_idx").on(t.dueDate),
  ],
);
export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = typeof invoices.$inferInsert;

// ─── Invoice Line Items ───────────────────────────────────────────────────────

export const invoiceLineItems = pgTable(
  "invoice_line_items",
  {
    id: serial("id").primaryKey(),
    invoiceId: integer("invoiceId").notNull(),
    itemType: invoiceLineItemTypeEnum("itemType").notNull(),
    description: varchar("description", { length: 512 }).notNull(),
    quantity: numeric("quantity", { precision: 8, scale: 2 }).default("1"),
    unitPrice: numeric("unitPrice", { precision: 10, scale: 2 }).notNull(),
    totalPrice: numeric("totalPrice", { precision: 10, scale: 2 }).notNull(),
    commissionRate: numeric("commissionRate", { precision: 5, scale: 2 }),
    commissionAmount: numeric("commissionAmount", { precision: 10, scale: 2 }),
    supplierId: integer("supplierId"),
    bookingId: integer("bookingId"),
    sortOrder: integer("sortOrder").default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("invoice_line_items_invoiceId_idx").on(t.invoiceId)],
);
export type InvoiceLineItem = typeof invoiceLineItems.$inferSelect;
export type InsertInvoiceLineItem = typeof invoiceLineItems.$inferInsert;

// ─── Celebrations & Special Dates ────────────────────────────────────────────

export const celebrations = pgTable(
  "celebrations",
  {
    id: serial("id").primaryKey(),
    memberId: integer("memberId").notNull(),
    celebrationType: celebrationTypeEnum("celebrationType").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    celebrationDate: timestamp("celebrationDate").notNull(),
    isRecurring: boolean("isRecurring").default(true).notNull(),
    familyMemberId: integer("familyMemberId"), // link to family member if applicable
    reminderDaysBefore: integer("reminderDaysBefore").default(30),
    lastReminderSentAt: timestamp("lastReminderSentAt"),
    notes: text("notes"),
    giftSuggestions: jsonb("giftSuggestions"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => [
    index("celebrations_memberId_idx").on(t.memberId),
    index("celebrations_date_idx").on(t.celebrationDate),
  ],
);
export type Celebration = typeof celebrations.$inferSelect;
export type InsertCelebration = typeof celebrations.$inferInsert;

// ─── NPS & Feedback ───────────────────────────────────────────────────────────

export const npsResponses = pgTable(
  "nps_responses",
  {
    id: serial("id").primaryKey(),
    memberId: integer("memberId").notNull(),
    bookingId: integer("bookingId"),
    travelRequestId: integer("travelRequestId"),
    score: integer("score").notNull(), // 0-10
    category: npsResponseEnum("category").notNull(),
    feedback: text("feedback"),
    followUpRequired: boolean("followUpRequired").default(false).notNull(),
    followedUpAt: timestamp("followedUpAt"),
    followedUpByUserId: integer("followedUpByUserId"),
    channel: varchar("channel", { length: 32 }).default("portal"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("nps_responses_memberId_idx").on(t.memberId),
    index("nps_responses_score_idx").on(t.score),
    index("nps_responses_createdAt_idx").on(t.createdAt),
  ],
);
export type NpsResponse = typeof npsResponses.$inferSelect;
export type InsertNpsResponse = typeof npsResponses.$inferInsert;

// ─── Communication Timeline ───────────────────────────────────────────────────
// Unified record of ALL communications with a member (email, WhatsApp, calls, notes)

export const communicationTimeline = pgTable(
  "communication_timeline",
  {
    id: serial("id").primaryKey(),
    memberId: integer("memberId").notNull(),
    advisorUserId: integer("advisorUserId"),
    communicationType: communicationTypeEnum("communicationType").notNull(),
    channel: messageChannelEnum("channel"),
    direction: varchar("direction", { length: 16 }).notNull(), // inbound | outbound
    subject: varchar("subject", { length: 512 }),
    body: text("body"),
    summary: text("summary"), // AI-generated summary
    transcription: text("transcription"), // AI transcription for calls
    sentiment: sentimentEnum("sentiment"),
    sentimentScore: numeric("sentimentScore", { precision: 4, scale: 3 }),
    durationSeconds: integer("durationSeconds"), // for phone calls
    attachmentUrls: jsonb("attachmentUrls"),
    externalId: varchar("externalId", { length: 255 }), // WhatsApp message ID, email thread ID
    travelRequestId: integer("travelRequestId"),
    bookingId: integer("bookingId"),
    followUpRequired: boolean("followUpRequired").default(false).notNull(),
    followUpDueAt: timestamp("followUpDueAt"),
    followUpCompletedAt: timestamp("followUpCompletedAt"),
    responseTimeMinutes: integer("responseTimeMinutes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => [
    index("comm_timeline_memberId_idx").on(t.memberId),
    index("comm_timeline_type_idx").on(t.communicationType),
    index("comm_timeline_createdAt_idx").on(t.createdAt),
    index("comm_timeline_followUp_idx").on(t.followUpRequired, t.followUpDueAt),
  ],
);
export type CommunicationTimelineEntry =
  typeof communicationTimeline.$inferSelect;
export type InsertCommunicationTimelineEntry =
  typeof communicationTimeline.$inferInsert;

// ─── Task Templates ───────────────────────────────────────────────────────────

export const taskTemplates = pgTable(
  "task_templates",
  {
    id: serial("id").primaryKey(),
    templateType: taskTemplateTypeEnum("templateType").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    defaultPriority: taskPriorityEnum("defaultPriority")
      .default("medium")
      .notNull(),
    defaultDueDaysFromTrigger: integer("defaultDueDaysFromTrigger").default(1),
    checklistItems: jsonb("checklistItems"), // [{ item: "Confirm fast-track booking", required: true }]
    triggerOnBookingStatus: varchar("triggerOnBookingStatus", { length: 64 }),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => [index("task_templates_type_idx").on(t.templateType)],
);
export type TaskTemplate = typeof taskTemplates.$inferSelect;
export type InsertTaskTemplate = typeof taskTemplates.$inferInsert;

// ─── Trip Timeline ────────────────────────────────────────────────────────────
// Chronological view of all trips, spending, and experiences for a member

export const tripTimeline = pgTable(
  "trip_timeline",
  {
    id: serial("id").primaryKey(),
    memberId: integer("memberId").notNull(),
    travelRequestId: integer("travelRequestId"),
    bookingId: integer("bookingId"),
    title: varchar("title", { length: 255 }).notNull(),
    destination: varchar("destination", { length: 255 }),
    departureDate: timestamp("departureDate"),
    returnDate: timestamp("returnDate"),
    totalSpend: numeric("totalSpend", { precision: 12, scale: 2 }),
    currency: varchar("currency", { length: 8 }).default("GBP"),
    satisfactionScore: integer("satisfactionScore"), // 1-5
    highlights: jsonb("highlights"),
    suppliersUsed: jsonb("suppliersUsed"),
    aiRecommendations: jsonb("aiRecommendations"),
    memberFeedback: text("memberFeedback"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("trip_timeline_memberId_idx").on(t.memberId),
    index("trip_timeline_departure_idx").on(t.departureDate),
  ],
);
export type TripTimelineEntry = typeof tripTimeline.$inferSelect;
export type InsertTripTimelineEntry = typeof tripTimeline.$inferInsert;

// ─── Welcome Gifts & VIP Amenities ───────────────────────────────────────────

export const vipAmenities = pgTable(
  "vip_amenities",
  {
    id: serial("id").primaryKey(),
    memberId: integer("memberId").notNull(),
    bookingId: integer("bookingId"),
    travelRequestId: integer("travelRequestId"),
    amenityType: varchar("amenityType", { length: 128 }).notNull(), // "welcome_gift", "room_upgrade", "champagne", "flowers"
    description: text("description"),
    supplierId: integer("supplierId"),
    requestedByUserId: integer("requestedByUserId"),
    confirmedAt: timestamp("confirmedAt"),
    deliveredAt: timestamp("deliveredAt"),
    cost: numeric("cost", { precision: 8, scale: 2 }),
    currency: varchar("currency", { length: 8 }).default("GBP"),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("vip_amenities_memberId_idx").on(t.memberId),
    index("vip_amenities_bookingId_idx").on(t.bookingId),
  ],
);
export type VipAmenity = typeof vipAmenities.$inferSelect;
export type InsertVipAmenity = typeof vipAmenities.$inferInsert;

// ─── Revenue Analytics (Materialized Snapshots) ───────────────────────────────

export const revenueSnapshots = pgTable(
  "revenue_snapshots",
  {
    id: serial("id").primaryKey(),
    snapshotDate: varchar("snapshotDate", { length: 16 }).notNull().unique(), // YYYY-MM-DD
    totalDailyRevenue: numeric("totalDailyRevenue", {
      precision: 12,
      scale: 2,
    }).default("0"),
    averageBookingValue: numeric("averageBookingValue", {
      precision: 10,
      scale: 2,
    }).default("0"),
    membershipFeesCollected: numeric("membershipFeesCollected", {
      precision: 12,
      scale: 2,
    }).default("0"),
    revenueByCategory: jsonb("revenueByCategory"), // { hotels: 0, ancillary: 0, transport: 0, villas: 0, apartments: 0 }
    bookingsCount: integer("bookingsCount").default(0),
    newMembersCount: integer("newMembersCount").default(0),
    activeRequestsCount: integer("activeRequestsCount").default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("revenue_snapshots_date_idx").on(t.snapshotDate)],
);
export type RevenueSnapshot = typeof revenueSnapshots.$inferSelect;
export type InsertRevenueSnapshot = typeof revenueSnapshots.$inferInsert;

// ─── New Relations ────────────────────────────────────────────────────────────

export const memberProfilesRelations = relations(memberProfiles, ({ one }) => ({
  member: one(members, {
    fields: [memberProfiles.memberId],
    references: [members.id],
  }),
}));

export const memberFamilyMembersRelations = relations(
  memberFamilyMembers,
  ({ one }) => ({
    member: one(members, {
      fields: [memberFamilyMembers.memberId],
      references: [members.id],
    }),
  }),
);

export const supplierServicesRelations = relations(
  supplierServices,
  ({ one }) => ({
    supplier: one(suppliers, {
      fields: [supplierServices.supplierId],
      references: [suppliers.id],
    }),
  }),
);

export const pricingInquiriesRelations = relations(
  pricingInquiries,
  ({ one }) => ({
    supplier: one(suppliers, {
      fields: [pricingInquiries.supplierId],
      references: [suppliers.id],
    }),
    travelRequest: one(travelRequests, {
      fields: [pricingInquiries.travelRequestId],
      references: [travelRequests.id],
    }),
    requestedBy: one(users, {
      fields: [pricingInquiries.requestedByUserId],
      references: [users.id],
    }),
  }),
);

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  member: one(members, {
    fields: [invoices.memberId],
    references: [members.id],
  }),
  supplier: one(suppliers, {
    fields: [invoices.supplierId],
    references: [suppliers.id],
  }),
  lineItems: many(invoiceLineItems),
  createdBy: one(users, {
    fields: [invoices.createdByUserId],
    references: [users.id],
  }),
}));

export const invoiceLineItemsRelations = relations(
  invoiceLineItems,
  ({ one }) => ({
    invoice: one(invoices, {
      fields: [invoiceLineItems.invoiceId],
      references: [invoices.id],
    }),
  }),
);

export const celebrationsRelations = relations(celebrations, ({ one }) => ({
  member: one(members, {
    fields: [celebrations.memberId],
    references: [members.id],
  }),
}));

export const npsResponsesRelations = relations(npsResponses, ({ one }) => ({
  member: one(members, {
    fields: [npsResponses.memberId],
    references: [members.id],
  }),
  booking: one(bookings, {
    fields: [npsResponses.bookingId],
    references: [bookings.id],
  }),
}));

export const communicationTimelineRelations = relations(
  communicationTimeline,
  ({ one }) => ({
    member: one(members, {
      fields: [communicationTimeline.memberId],
      references: [members.id],
    }),
    advisor: one(users, {
      fields: [communicationTimeline.advisorUserId],
      references: [users.id],
    }),
  }),
);

export const tripTimelineRelations = relations(tripTimeline, ({ one }) => ({
  member: one(members, {
    fields: [tripTimeline.memberId],
    references: [members.id],
  }),
  travelRequest: one(travelRequests, {
    fields: [tripTimeline.travelRequestId],
    references: [travelRequests.id],
  }),
}));

export const vipAmenitiesRelations = relations(vipAmenities, ({ one }) => ({
  member: one(members, {
    fields: [vipAmenities.memberId],
    references: [members.id],
  }),
  booking: one(bookings, {
    fields: [vipAmenities.bookingId],
    references: [bookings.id],
  }),
}));

// ─── Chatwoot Configuration ───────────────────────────────────────────────────
// Stores Chatwoot instance settings and sync state.

export const chatwootConfig = pgTable("chatwoot_config", {
  id: serial("id").primaryKey(),
  /** Chatwoot instance URL (e.g. https://chatwoot.lanai.com). */
  instanceUrl: varchar("instanceUrl", { length: 512 }).notNull(),
  /** Chatwoot access token (personal token for API auth). */
  accessToken: varchar("accessToken", { length: 256 }).notNull(),
  /** Chatwoot account ID (usually 1 for single-account setups). */
  accountId: integer("accountId").default(1).notNull(),
  /** Whether the Chatwoot integration is active. */
  enabled: boolean("enabled").default(false).notNull(),
  /** Chatwoot inbox ID for web widget conversations. */
  defaultInboxId: integer("defaultInboxId").default(1),
  /** When the last successful sync occurred. */
  lastSyncAt: timestamp("lastSyncAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type ChatwootConfig = typeof chatwootConfig.$inferSelect;
export type InsertChatwootConfig = typeof chatwootConfig.$inferInsert;

// ─── Chatwoot Conversations (local mirror) ────────────────────────────────────
// Mirrors Chatwoot conversations for fast local queries and dashboard display.

export const chatwootConversations = pgTable(
  "chatwoot_conversations",
  {
    id: serial("id").primaryKey(),
    /** Chatwoot conversation ID (conv_*). */
    chatwootId: varchar("chatwootId", { length: 64 }).notNull().unique(),
    /** Member linked to this conversation. */
    memberId: integer("memberId"),
    /** Advisor who owns this conversation. */
    advisorUserId: integer("advisorUserId"),
    /** Chatwoot contact identifier. */
    contactIdentifier: varchar("contactIdentifier", { length: 512 }),
    /** Contact name (cached). */
    contactName: varchar("contactName", { length: 255 }),
    /** Contact email (cached). */
    contactEmail: varchar("contactEmail", { length: 320 }),
    /** Channel type: website, whatsapp, email, sms, etc. */
    channel: varchar("channel", { length: 64 }).default("website"),
    /** Current status: open, resolved, pending. */
    status: varchar("status", { length: 32 }).default("open").notNull(),
    /** Last message body (cached). */
    lastMessage: text("lastMessage"),
    /** Whether the member saw the latest messages. */
    memberSeen: boolean("memberSeen").default(false).notNull(),
    /** Whether the advisor responded. */
    advisorResponded: boolean("advisorResponded").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => [
    index("chatwoot_conv_memberId_idx").on(t.memberId),
    index("chatwoot_conv_status_idx").on(t.status),
  ],
);

export type ChatwootConversation = typeof chatwootConversations.$inferSelect;
export type InsertChatwootConversation =
  typeof chatwootConversations.$inferInsert;

// ─── Chatwoot Messages (local mirror) ─────────────────────────────────────────
// Mirrors Chatwoot messages for fast local queries.

export const chatwootMessageTypeEnum = pgEnum("chatwoot_message_type", [
  "inbound",
  "outbound",
]);

export const chatwootMessages = pgTable(
  "chatwoot_messages",
  {
    id: serial("id").primaryKey(),
    /** Chatwoot message ID (msg_*). */
    chatwootId: varchar("chatwootId", { length: 64 }).notNull(),
    /** Parent conversation. */
    conversationId: integer("conversationId").notNull(),
    /** Which side sent it: account (advisor) or lead (member). */
    messageType: chatwootMessageTypeEnum("messageType").notNull(),
    /** Message body text. */
    content: text("content").notNull(),
    /** Attachment URL if any. */
    attachmentUrl: varchar("attachmentUrl", { length: 1024 }),
    /** Whether this is a template message (WhatsApp). */
    isTemplate: boolean("isTemplate").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("chatwoot_msg_conversationId_idx").on(t.conversationId)],
);

export type ChatwootMessage = typeof chatwootMessages.$inferSelect;
export type InsertChatwootMessage = typeof chatwootMessages.$inferInsert;

// ─── Platform Integration Contracts ──────────────────────────────────────────
// These tables make cross-service work durable and idempotent. They are deliberately
// kept in PostgreSQL so an application mutation and its integration event can be
// committed atomically before any network call is attempted.

export const outboxStatusEnum = pgEnum("outbox_status", [
  "pending",
  "publishing",
  "published",
  "failed",
  "dead_letter",
]);

export const deliveryStatusEnum = pgEnum("delivery_status", [
  "pending",
  "delivered",
  "failed",
  "dead_letter",
]);

export const inferenceRunStatusEnum = pgEnum("inference_run_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: serial("id").primaryKey(),
    eventId: varchar("eventId", { length: 64 }).notNull().unique(),
    aggregateType: varchar("aggregateType", { length: 64 }).notNull(),
    aggregateId: varchar("aggregateId", { length: 64 }).notNull(),
    eventType: varchar("eventType", { length: 128 }).notNull(),
    schemaVersion: integer("schemaVersion").default(1).notNull(),
    payload: jsonb("payload").notNull(),
    idempotencyKey: varchar("idempotencyKey", { length: 128 })
      .notNull()
      .unique(),
    status: outboxStatusEnum("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    nextAttemptAt: timestamp("nextAttemptAt").defaultNow().notNull(),
    lastError: text("lastError"),
    publishedAt: timestamp("publishedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => [
    index("outbox_events_status_next_attempt_idx").on(
      t.status,
      t.nextAttemptAt,
    ),
    index("outbox_events_aggregate_idx").on(
      t.aggregateType,
      t.aggregateId,
      t.createdAt,
    ),
    index("outbox_events_event_type_created_idx").on(t.eventType, t.createdAt),
  ],
);
export type OutboxEvent = typeof outboxEvents.$inferSelect;
export type InsertOutboxEvent = typeof outboxEvents.$inferInsert;

export const eventDeliveries = pgTable(
  "event_deliveries",
  {
    id: serial("id").primaryKey(),
    outboxEventId: integer("outboxEventId").notNull(),
    target: varchar("target", { length: 64 }).notNull(),
    status: deliveryStatusEnum("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    lastError: text("lastError"),
    deliveredAt: timestamp("deliveredAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("event_deliveries_event_target_unique").on(
      t.outboxEventId,
      t.target,
    ),
    index("event_deliveries_status_created_idx").on(t.status, t.createdAt),
  ],
);
export type EventDelivery = typeof eventDeliveries.$inferSelect;
export type InsertEventDelivery = typeof eventDeliveries.$inferInsert;

export const ledgerAccounts = pgTable(
  "ledger_accounts",
  {
    id: serial("id").primaryKey(),
    accountKey: varchar("accountKey", { length: 128 }).notNull().unique(),
    tigerBeetleAccountId: varchar("tigerBeetleAccountId", { length: 39 })
      .notNull()
      .unique(),
    ledger: integer("ledger").notNull(),
    code: integer("code").notNull(),
    memberId: integer("memberId"),
    supplierId: integer("supplierId"),
    advisorUserId: integer("advisorUserId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => [
    index("ledger_accounts_member_idx").on(t.memberId),
    index("ledger_accounts_supplier_idx").on(t.supplierId),
    index("ledger_accounts_advisor_idx").on(t.advisorUserId),
  ],
);
export type LedgerAccount = typeof ledgerAccounts.$inferSelect;
export type InsertLedgerAccount = typeof ledgerAccounts.$inferInsert;

export const ledgerTransfers = pgTable(
  "ledger_transfers",
  {
    id: serial("id").primaryKey(),
    transferKey: varchar("transferKey", { length: 128 }).notNull().unique(),
    tigerBeetleTransferId: varchar("tigerBeetleTransferId", { length: 39 })
      .notNull()
      .unique(),
    debitLedgerAccountId: integer("debitLedgerAccountId").notNull(),
    creditLedgerAccountId: integer("creditLedgerAccountId").notNull(),
    amountMinor: numeric("amountMinor", { precision: 20, scale: 0 }).notNull(),
    currency: varchar("currency", { length: 8 }).notNull(),
    status: varchar("status", { length: 32 }).default("posted").notNull(),
    referenceType: varchar("referenceType", { length: 64 }),
    referenceId: varchar("referenceId", { length: 64 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("ledger_transfers_reference_idx").on(t.referenceType, t.referenceId),
    index("ledger_transfers_debit_created_idx").on(
      t.debitLedgerAccountId,
      t.createdAt,
    ),
    index("ledger_transfers_credit_created_idx").on(
      t.creditLedgerAccountId,
      t.createdAt,
    ),
  ],
);
export type LedgerTransfer = typeof ledgerTransfers.$inferSelect;
export type InsertLedgerTransfer = typeof ledgerTransfers.$inferInsert;

export const workflowExecutions = pgTable(
  "workflow_executions",
  {
    id: serial("id").primaryKey(),
    workflowId: varchar("workflowId", { length: 128 }).notNull().unique(),
    runId: varchar("runId", { length: 128 }),
    workflowType: varchar("workflowType", { length: 128 }).notNull(),
    taskQueue: varchar("taskQueue", { length: 128 }).notNull(),
    aggregateType: varchar("aggregateType", { length: 64 }),
    aggregateId: varchar("aggregateId", { length: 64 }),
    status: varchar("status", { length: 32 }).default("running").notNull(),
    input: jsonb("input").notNull(),
    result: jsonb("result"),
    error: text("error"),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => [
    index("workflow_executions_status_updated_idx").on(t.status, t.updatedAt),
    index("workflow_executions_aggregate_idx").on(
      t.aggregateType,
      t.aggregateId,
    ),
  ],
);
export type WorkflowExecution = typeof workflowExecutions.$inferSelect;
export type InsertWorkflowExecution = typeof workflowExecutions.$inferInsert;

export const authorizationSyncState = pgTable(
  "authorization_sync_state",
  {
    id: serial("id").primaryKey(),
    subjectType: varchar("subjectType", { length: 64 }).notNull(),
    subjectId: varchar("subjectId", { length: 128 }).notNull(),
    resourceType: varchar("resourceType", { length: 64 }).notNull(),
    resourceId: varchar("resourceId", { length: 128 }).notNull(),
    relation: varchar("relation", { length: 64 }).notNull(),
    schemaVersion: varchar("schemaVersion", { length: 128 }),
    syncedAt: timestamp("syncedAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("authorization_sync_state_relation_unique").on(
      t.subjectType,
      t.subjectId,
      t.resourceType,
      t.resourceId,
      t.relation,
    ),
    index("authorization_sync_state_resource_idx").on(
      t.resourceType,
      t.resourceId,
    ),
  ],
);
export type AuthorizationSyncState = typeof authorizationSyncState.$inferSelect;
export type InsertAuthorizationSyncState =
  typeof authorizationSyncState.$inferInsert;

export const aiInferenceRuns = pgTable(
  "ai_inference_runs",
  {
    id: serial("id").primaryKey(),
    requestId: varchar("requestId", { length: 64 }).notNull().unique(),
    capability: varchar("capability", { length: 128 }).notNull(),
    provider: varchar("provider", { length: 64 }).notNull(),
    model: varchar("model", { length: 128 }).notNull(),
    memberId: integer("memberId"),
    travelRequestId: integer("travelRequestId"),
    initiatedByUserId: integer("initiatedByUserId"),
    inputDigest: varchar("inputDigest", { length: 64 }).notNull(),
    inputMetadata: jsonb("inputMetadata"),
    outputMetadata: jsonb("outputMetadata"),
    status: inferenceRunStatusEnum("status").default("queued").notNull(),
    latencyMs: integer("latencyMs"),
    error: text("error"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
  },
  (t) => [
    index("ai_inference_runs_status_created_idx").on(t.status, t.createdAt),
    index("ai_inference_runs_member_created_idx").on(t.memberId, t.createdAt),
    index("ai_inference_runs_request_created_idx").on(
      t.travelRequestId,
      t.createdAt,
    ),
  ],
);
export type AiInferenceRun = typeof aiInferenceRuns.$inferSelect;
export type InsertAiInferenceRun = typeof aiInferenceRuns.$inferInsert;

export const lakehouseCheckpoints = pgTable(
  "lakehouse_checkpoints",
  {
    id: serial("id").primaryKey(),
    consumerName: varchar("consumerName", { length: 128 }).notNull().unique(),
    topic: varchar("topic", { length: 128 }).notNull(),
    partition: integer("partition").default(0).notNull(),
    offset: varchar("offset", { length: 64 }),
    lastEventId: varchar("lastEventId", { length: 64 }),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => [
    index("lakehouse_checkpoints_topic_partition_idx").on(t.topic, t.partition),
  ],
);
export type LakehouseCheckpoint = typeof lakehouseCheckpoints.$inferSelect;
export type InsertLakehouseCheckpoint =
  typeof lakehouseCheckpoints.$inferInsert;

export const apiIdempotencyKeys = pgTable(
  "api_idempotency_keys",
  {
    id: serial("id").primaryKey(),
    scope: varchar("scope", { length: 128 }).notNull(),
    key: varchar("key", { length: 128 }).notNull(),
    requestDigest: varchar("requestDigest", { length: 64 }).notNull(),
    response: jsonb("response"),
    statusCode: integer("statusCode"),
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("api_idempotency_keys_scope_key_unique").on(t.scope, t.key),
    index("api_idempotency_keys_expiry_idx").on(t.expiresAt),
  ],
);
export type ApiIdempotencyKey = typeof apiIdempotencyKeys.$inferSelect;
export type InsertApiIdempotencyKey = typeof apiIdempotencyKeys.$inferInsert;
