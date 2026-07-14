import {
  boolean,
  integer as int,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar,
  serial,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["advisor", "senior_advisor", "admin"]);
export const tierEnum = pgEnum("tier", ["platinum", "gold", "silver"]);

// ─── Advisor / Staff Users (Manus OAuth) ─────────────────────────────────────

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
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
  role: roleEnum("role").default("advisor").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Members (Client-facing portal users) ────────────────────────────────────

export const members = pgTable("members", {
  id: serial("id").primaryKey(),
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
  tier: tierEnum("tier").default("gold").notNull(),
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
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn"),
});

export type Member = typeof members.$inferSelect;
export type InsertMember = typeof members.$inferInsert;

// ─── Member Invitations ───────────────────────────────────────────────────────

export const memberInvitations = pgTable("member_invitations", {
  id: serial("id").primaryKey(),
  /** Cryptographically random token sent in the invite email link. */
  token: varchar("token", { length: 128 }).notNull().unique(),
  /** Email address the invitation was sent to. */
  email: varchar("email", { length: 320 }).notNull(),
  /** Pre-populated display name (from CRM or advisor input). */
  name: varchar("name", { length: 255 }).notNull(),
  /** Tier to assign on acceptance. */
  tier: tierEnum("tier").default("gold").notNull(),
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

export const memberSessions = pgTable("member_sessions", {
  id: serial("id").primaryKey(),
  /** Cryptographically random session token stored in an HttpOnly cookie. */
  token: varchar("token", { length: 128 }).notNull().unique(),
  memberId: int("memberId").notNull(),
  /** When the session expires (30 days from creation). */
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MemberSession = typeof memberSessions.$inferSelect;
export type InsertMemberSession = typeof memberSessions.$inferInsert;


// ─── Additional Missing Schemas for Full Architecture ─────────────────────────

export const travelRequestStatusEnum = pgEnum("travel_request_status", ["new", "in_progress", "proposal_sent", "booked", "completed", "cancelled"]);

export const travelRequests = pgTable("travel_requests", {
  id: serial("id").primaryKey(),
  memberId: int("memberId").notNull(),
  destination: varchar("destination", { length: 255 }).notNull(),
  dates: varchar("dates", { length: 255 }).notNull(),
  pax: int("pax").notNull(),
  budget: varchar("budget", { length: 64 }),
  notes: text("notes"),
  status: travelRequestStatusEnum("status").default("new").notNull(),
  assignedToUserId: int("assignedToUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const proposalStatusEnum = pgEnum("proposal_status", ["draft", "sent", "approved", "rejected"]);

export const proposals = pgTable("proposals", {
  id: serial("id").primaryKey(),
  travelRequestId: int("travelRequestId").notNull(),
  memberId: int("memberId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  status: proposalStatusEnum("status").default("draft").notNull(),
  totalPrice: varchar("totalPrice", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const bookingStatusEnum = pgEnum("booking_status", ["pending", "confirmed", "paid", "cancelled"]);

export const bookings = pgTable("bookings", {
  id: serial("id").primaryKey(),
  proposalId: int("proposalId").notNull(),
  memberId: int("memberId").notNull(),
  supplierId: int("supplierId"),
  referenceNumber: varchar("referenceNumber", { length: 128 }),
  status: bookingStatusEnum("status").default("pending").notNull(),
  commissionExpected: varchar("commissionExpected", { length: 64 }),
  commissionReceived: boolean("commissionReceived").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 128 }),
  rating: int("rating"),
  contactEmail: varchar("contactEmail", { length: 320 }),
  contactPhone: varchar("contactPhone", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  memberId: int("memberId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  fileUrl: varchar("fileUrl", { length: 1024 }).notNull(),
  documentType: varchar("documentType", { length: 64 }),
  uploadedByUserId: int("uploadedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
