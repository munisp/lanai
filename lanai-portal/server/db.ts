import { and, eq, gt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  InsertMember,
  InsertMemberInvitation,
  InsertMemberSession,
  InsertUser,
  Member,
  memberInvitations,
  memberSessions,
  members,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;
let client: postgres.Sql | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      client = postgres(process.env.DATABASE_URL, { max: 10 });
      _db = drizzle(client);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Advisor / Staff Users ────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};

  const textFields = ["name", "email", "loginMethod"] as const;
  type TextField = (typeof textFields)[number];

  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  };
  textFields.forEach(assignNullable);

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onConflictDoUpdate({ target: [users.openId], set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0] ?? undefined;
}

export async function getAllAdvisors() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(users.name);
}

export async function updateUserRole(
  userId: number,
  role: "advisor" | "senior_advisor" | "admin"
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

// ─── Members ──────────────────────────────────────────────────────────────────

export async function getMemberByEmail(email: string): Promise<Member | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(members)
    .where(and(eq(members.email, email.toLowerCase()), eq(members.active, true)))
    .limit(1);
  return result[0] ?? undefined;
}

export async function getMemberById(id: number): Promise<Member | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(members).where(eq(members.id, id)).limit(1);
  return result[0] ?? undefined;
}

export async function getAllMembers(): Promise<Member[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(members).orderBy(members.name);
}

export async function createMember(data: InsertMember): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [row] = await db
    .insert(members)
    .values({ ...data, email: data.email.toLowerCase() })
    .returning({ id: members.id });
  return row?.id ?? 0;
}

export async function updateMemberPin(memberId: number, pinHash: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(members)
    .set({ pinHash, onboardingComplete: true, updatedAt: new Date() })
    .where(eq(members.id, memberId));
}

export async function updateMemberLastSignedIn(memberId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(members)
    .set({ lastSignedIn: new Date() })
    .where(eq(members.id, memberId));
}

export async function updateMember(
  memberId: number,
  data: Partial<Pick<Member, "name" | "tier" | "crmPersonId" | "active">>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(members).set({ ...data, updatedAt: new Date() }).where(eq(members.id, memberId));
}

// ─── Member Invitations ───────────────────────────────────────────────────────

export async function createInvitation(data: InsertMemberInvitation) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(memberInvitations).values(data);
}

export async function getInvitationByToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  const now = new Date();
  const result = await db
    .select()
    .from(memberInvitations)
    .where(
      and(
        eq(memberInvitations.token, token),
        eq(memberInvitations.accepted, false),
        gt(memberInvitations.expiresAt, now)
      )
    )
    .limit(1);
  return result[0] ?? undefined;
}

export async function markInvitationAccepted(token: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(memberInvitations)
    .set({ accepted: true })
    .where(eq(memberInvitations.token, token));
}

export async function getPendingInvitations() {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  return db
    .select()
    .from(memberInvitations)
    .where(and(eq(memberInvitations.accepted, false), gt(memberInvitations.expiresAt, now)))
    .orderBy(memberInvitations.createdAt);
}

// ─── Member Sessions ──────────────────────────────────────────────────────────

export async function createMemberSession(data: InsertMemberSession): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(memberSessions).values(data);
}

export async function getMemberSessionByToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  const now = new Date();
  const result = await db
    .select()
    .from(memberSessions)
    .where(and(eq(memberSessions.token, token), gt(memberSessions.expiresAt, now)))
    .limit(1);
  return result[0] ?? undefined;
}

export async function deleteMemberSession(token: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(memberSessions).where(eq(memberSessions.token, token));
}

export async function deleteExpiredMemberSessions(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const now = new Date();
    await db.delete(memberSessions).where(gt(memberSessions.expiresAt, now));
}
