import {
  boolean,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

// ─── Advisor / Staff Users (Manus OAuth) ─────────────────────────────────────

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier returned from the OAuth callback. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  /**
   * advisor        — full CRM access, can manage members and invitations
   * senior_advisor — same as advisor + can promote other advisors, manage settings
   * admin          — alias for senior_advisor (used by Manus owner bootstrap)
   */
  role: mysqlEnum("role", ["advisor", "senior_advisor", "admin"]).default("advisor").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Members (Client-facing portal users) ────────────────────────────────────

export const members = mysqlTable("members", {
  id: int("id").autoincrement().primaryKey(),
  /** Email address — used as login identifier. */
  email: varchar("email", { length: 320 }).notNull().unique(),
  /** Display name pulled from CRM or set during onboarding. */
  name: varchar("name", { length: 255 }).notNull(),
  /**
   * bcrypt hash of the member's PIN (min 6 digits).
   * Never stored in plaintext.
   */
  pinHash: varchar("pinHash", { length: 255 }),
  /**
   * Membership tier — controls feature access.
   * platinum: document vault + priority messaging + all features
   * gold:     standard features
   * silver:   basic features
   */
  tier: mysqlEnum("tier", ["platinum", "gold", "silver"]).default("gold").notNull(),
  /**
   * The Twenty CRM person UUID linked to this member.
   * Used to filter opportunities/trips to only this member's records.
   */
  crmPersonId: varchar("crmPersonId", { length: 64 }),
  /** Whether the member has completed onboarding (set PIN, verified email). */
  onboardingComplete: boolean("onboardingComplete").default(false).notNull(),
  /** Whether the account is active. Advisors can deactivate members. */
  active: boolean("active").default(true).notNull(),
  /** Which advisor invited this member. */
  invitedByUserId: int("invitedByUserId"),
  /**
   * Stripe Customer ID (cus_…) — created on first checkout.
   * Used to list payment methods, subscriptions, and invoices.
   */
  stripeCustomerId: varchar("stripeCustomerId", { length: 64 }),
  /**
   * Active Stripe Subscription ID (sub_…) — null if no active subscription.
   */
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn"),
});

export type Member = typeof members.$inferSelect;
export type InsertMember = typeof members.$inferInsert;

// ─── Member Invitations ───────────────────────────────────────────────────────

export const memberInvitations = mysqlTable("member_invitations", {
  id: int("id").autoincrement().primaryKey(),
  /** Cryptographically random token sent in the invite email link. */
  token: varchar("token", { length: 128 }).notNull().unique(),
  /** Email address the invitation was sent to. */
  email: varchar("email", { length: 320 }).notNull(),
  /** Pre-populated display name (from CRM or advisor input). */
  name: varchar("name", { length: 255 }).notNull(),
  /** Tier to assign on acceptance. */
  tier: mysqlEnum("tier", ["platinum", "gold", "silver"]).default("gold").notNull(),
  /** CRM person ID to link on acceptance. */
  crmPersonId: varchar("crmPersonId", { length: 64 }),
  /** Advisor who created the invitation. */
  invitedByUserId: int("invitedByUserId").notNull(),
  /** Whether the invitation has been accepted. */
  accepted: boolean("accepted").default(false).notNull(),
  /** When the invitation expires (48 hours from creation). */
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MemberInvitation = typeof memberInvitations.$inferSelect;
export type InsertMemberInvitation = typeof memberInvitations.$inferInsert;

// ─── Member Sessions ──────────────────────────────────────────────────────────

export const memberSessions = mysqlTable("member_sessions", {
  id: int("id").autoincrement().primaryKey(),
  /** Cryptographically random session token stored in an HttpOnly cookie. */
  token: varchar("token", { length: 128 }).notNull().unique(),
  memberId: int("memberId").notNull(),
  /** When the session expires (30 days from creation). */
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MemberSession = typeof memberSessions.$inferSelect;
export type InsertMemberSession = typeof memberSessions.$inferInsert;

// ─── Chatwoot Configuration ───────────────────────────────────────────────────
// Stores Chatwoot instance settings and sync state.

export const chatwootConfig = mysqlTable("chatwoot_config", {
  id: int("id").autoincrement().primaryKey(),
  /** Chatwoot instance URL (e.g. https://chatwoot.lanai.com). */
  instanceUrl: varchar("instanceUrl", { length: 512 }).notNull(),
  /** Chatwoot access token (personal token for API auth). */
  accessToken: varchar("accessToken", { length: 256 }).notNull(),
  /** Chatwoot account ID (usually 1 for single-account setups). */
  accountId: int("accountId").default(1).notNull(),
  /** Whether the Chatwoot integration is active. */
  enabled: boolean("enabled").default(false).notNull(),
  /** Chatwoot inbox ID for web widget conversations. */
  defaultInboxId: int("defaultInboxId").default(1),
  /** When the last successful sync occurred. */
  lastSyncAt: timestamp("lastSyncAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ChatwootConfig = typeof chatwootConfig.$inferSelect;
export type InsertChatwootConfig = typeof chatwootConfig.$inferInsert;

// ─── Chatwoot Conversations (local mirror) ────────────────────────────────────
// Mirrors Chatwoot conversations for fast local queries and dashboard display.

export const chatwootConversations = mysqlTable("chatwoot_conversations", {
  id: int("id").autoincrement().primaryKey(),
  /** Chatwoot conversation ID (conv_*). */
  chatwootId: varchar("chatwootId", { length: 64 }).notNull().unique(),
  /** Member linked to this conversation. */
  memberId: int("memberId"),
  /** Advisor who owns this conversation. */
  advisorUserId: int("advisorUserId"),
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ChatwootConversation = typeof chatwootConversations.$inferSelect;
export type InsertChatwootConversation = typeof chatwootConversations.$inferInsert;

// ─── Chatwoot Messages (local mirror) ─────────────────────────────────────────
// Mirrors Chatwoot messages for fast local queries.

export const chatwootMessages = mysqlTable("chatwoot_messages", {
  id: int("id").autoincrement().primaryKey(),
  /** Chatwoot message ID (msg_*). */
  chatwootId: varchar("chatwootId", { length: 64 }).notNull(),
  /** Parent conversation. */
  conversationId: int("conversationId").notNull(),
  /** Which side sent it: account (advisor) or lead (member). */
  messageType: mysqlEnum("messageType", ["inbound", "outbound"]).notNull(),
  /** Message body text. */
  content: text("content").notNull(),
  /** Attachment URL if any. */
  attachmentUrl: varchar("attachmentUrl", { length: 1024 }),
  /** Whether this is a template message (WhatsApp). */
  isTemplate: boolean("isTemplate").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ChatwootMessage = typeof chatwootMessages.$inferSelect;
export type InsertChatwootMessage = typeof chatwootMessages.$inferInsert;