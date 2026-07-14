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
  "new", "in_progress", "proposal_sent", "booked", "completed", "cancelled",
]);
export const proposalStatusEnum = pgEnum("proposal_status", [
  "draft", "sent", "approved", "rejected", "expired",
]);
export const bookingStatusEnum = pgEnum("booking_status", [
  "pending", "confirmed", "paid", "cancelled", "refunded",
]);
export const notificationTypeEnum = pgEnum("notification_type", [
  "travel_request", "proposal", "booking", "message", "payment", "system", "ai_insight",
]);
export const messageChannelEnum = pgEnum("message_channel", [
  "whatsapp", "email", "portal", "sms",
]);
export const messageSenderEnum = pgEnum("message_sender", [
  "member", "advisor", "ai",
]);
export const auditActionEnum = pgEnum("audit_action", [
  "create", "update", "delete", "login", "logout", "invite", "approve", "reject",
]);
export const taskStatusEnum = pgEnum("task_status", [
  "open", "in_progress", "done", "cancelled",
]);
export const taskPriorityEnum = pgEnum("task_priority", [
  "low", "medium", "high", "urgent",
]);
export const insightTypeEnum = pgEnum("insight_type", [
  "churn_risk", "upsell_opportunity", "preference_detected", "anniversary",
  "morning_briefing", "proposal_suggestion",
]);
export const commissionStatusEnum = pgEnum("commission_status", [
  "expected", "invoiced", "received", "disputed", "written_off",
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
  ]
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
  ]
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
  ]
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
  ]
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
  ]
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
  ]
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
  (t) => [
    index("proposal_items_proposalId_idx").on(t.proposalId),
  ]
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
    supplierConfirmationRef: varchar("supplierConfirmationRef", { length: 128 }),
    status: bookingStatusEnum("status").default("pending").notNull(),
    totalAmount: numeric("totalAmount", { precision: 12, scale: 2 }),
    currency: varchar("currency", { length: 8 }).default("GBP"),
    commissionExpected: numeric("commissionExpected", { precision: 12, scale: 2 }),
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
  ]
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
    defaultCommissionRate: numeric("defaultCommissionRate", { precision: 5, scale: 2 }),
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
  ]
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
  (t) => [index("supplier_contacts_supplierId_idx").on(t.supplierId)]
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
  ]
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
  ]
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
  ]
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
  ]
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
  (t) => [
    index("morning_briefings_date_idx").on(t.date),
  ]
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
    expectedAmount: numeric("expectedAmount", { precision: 12, scale: 2 }).notNull(),
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
  ]
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
  ]
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
  ]
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
    communicationPreference: varchar("communicationPreference", { length: 64 }).default("email"),
    notifyOnProposal: boolean("notifyOnProposal").default(true).notNull(),
    notifyOnBooking: boolean("notifyOnBooking").default(true).notNull(),
    notifyOnMessage: boolean("notifyOnMessage").default(true).notNull(),
    customPreferences: jsonb("customPreferences"),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => [
    index("member_preferences_memberId_idx").on(t.memberId),
  ]
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
  ]
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
  ]
);
export type AdvisorTask = typeof advisorTasks.$inferSelect;
export type InsertAdvisorTask = typeof advisorTasks.$inferInsert;

// ─── Tags ─────────────────────────────────────────────────────────────────────

export const tags = pgTable(
  "tags",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 64 }).notNull().unique(),
    color: varchar("color", { length: 16 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  }
);
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
  ]
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

export const travelRequestsRelations = relations(travelRequests, ({ one, many }) => ({
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
}));

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

export const supplierContactsRelations = relations(supplierContacts, ({ one }) => ({
  supplier: one(suppliers, {
    fields: [supplierContacts.supplierId],
    references: [suppliers.id],
  }),
}));

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

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  member: one(members, {
    fields: [conversations.memberId],
    references: [members.id],
  }),
  assignedAdvisor: one(users, {
    fields: [conversations.assignedAdvisorId],
    references: [users.id],
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

export const commissionLedgerRelations = relations(commissionLedger, ({ one }) => ({
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
}));

export const memberPreferencesRelations = relations(memberPreferences, ({ one }) => ({
  member: one(members, {
    fields: [memberPreferences.memberId],
    references: [members.id],
  }),
}));

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
