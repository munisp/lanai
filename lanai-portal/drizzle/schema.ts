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